import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createAskPass } from "./askpass.ts";
import { shellQuote, validateConnection, type AskPass, type ConnectionSpec } from "./config.ts";
import { sshCommand } from "./ssh-command.ts";
import type { RemoteResult, RemoteWorkspace, RunOptions } from "./remote-types.ts";

export class SshWorkspace implements RemoteWorkspace {
	private root = "";
	private remoteHome = "";
	private remoteTemp = "";
	private ready = false;
	private stopped = false;
	private ended = false;
	private master: ChildProcess | undefined;
	private spec: ConnectionSpec;
	private directory: string;
	private socket: string;
	private calls = new Map<Promise<RemoteResult>, AbortController>();
	private closing: Promise<void> | undefined;
	private disconnected: () => void;
	private configFile: string | undefined;

	private constructor(directory: string, spec: ConnectionSpec, disconnected: () => void) {
		this.directory = directory;
		this.socket = join(directory, "ssh");
		this.spec = spec;
		this.disconnected = disconnected;
	}

	static async connect(spec: ConnectionSpec, ask: AskPass, signal: AbortSignal, disconnected = () => {}, configFile?: string): Promise<SshWorkspace> {
		spec = validateConnection(spec);
		const workspace = new SshWorkspace(await mkdtemp(join(tmpdir(), "pi-ssh-")), spec, disconnected);
		let broker: Awaited<ReturnType<typeof createAskPass>> | undefined;
		try {
			await workspace.configure(configFile);
			broker = await createAskPass(workspace.directory, ask);
			await workspace.authenticate(broker.env, signal);
			await workspace.initialize(signal);
			return workspace;
		} catch (error) {
			await workspace.close();
			throw error;
		} finally {
			await broker?.close();
		}
	}

	get cwd(): string { return this.root; }
	get home(): string { return this.remoteHome; }
	get connected(): boolean { return this.ready && !this.ended && !this.stopped; }

	run(command: string, options: RunOptions = {}): Promise<RemoteResult> {
		if (!this.connected) return Promise.reject(new Error("Remote workspace disconnected. Run /remote stop to return to local. No command ran locally."));
		const controller = new AbortController();
		const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
		const pidFile = `${this.remoteTemp}/${randomUUID()}.pid`;
		const childCommand = `cd -- ${shellQuote(this.cwd)} && ${command}`;
		// Job control gives this call its own process group, so cancellation does not hit other calls.
		const script = [
			"set -m",
			`bash -c ${shellQuote(childCommand)} <&0 &`,
			"child=$!", "set +m",
			`printf '%s\\n' "$child" > ${shellQuote(pidFile)}`,
			`cleanup() { kill -TERM -- "-$child" 2>/dev/null || :; rm -f -- ${shellQuote(pidFile)}; }`,
			"trap cleanup EXIT", "trap 'exit 143' TERM", "trap 'exit 129' HUP",
			"wait \"$child\"", "status=$?", "exit \"$status\"",
		].join("\n");
		const call = this.execute(script, { ...options, signal }, async () => {
			const cancel = [
				`for attempt in 1 2 3 4 5 6 7 8 9 10; do test -f ${shellQuote(pidFile)} && break; sleep 0.05; done`,
				`if test -f ${shellQuote(pidFile)}; then`,
				`read -r child < ${shellQuote(pidFile)}`,
				`case "$child" in ''|*[!0-9]*) exit 1;; esac`,
				"kill -TERM -- \"-$child\" 2>/dev/null || :", "sleep 0.15",
				"kill -KILL -- \"-$child\" 2>/dev/null || :", "fi",
			].join("\n");
			await this.execute(cancel, { timeout: 2 });
		});
		this.calls.set(call, controller);
		void call.finally(() => this.calls.delete(call)).catch(() => {});
		return call;
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.stopped = true;
		this.closing = (async () => {
			for (const controller of this.calls.values()) controller.abort();
			await Promise.allSettled(this.calls.keys());
			if (this.remoteTemp && !this.ended) {
				await this.execute(`rm -rf -- ${shellQuote(this.remoteTemp)}`, { timeout: 2 }).catch(() => {});
			}
			this.removeListeners();
			this.killMaster();
			await rm(this.directory, { recursive: true, force: true });
		})();
		return this.closing;
	}

	private async configure(source?: string): Promise<void> {
		// A trailing SendEnv removal must follow user/system config; a CLI -o is processed too early.
		const sources = source ? [source] : [join(homedir(), ".ssh", "config"), "/etc/ssh/ssh_config"];
		const includes = sources.map((path) => `Include "${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join("\n");
		this.configFile = join(this.directory, "config");
		await writeFile(this.configFile, `${includes}\nHost *\n  SendEnv -*\n`, { mode: 0o600 });
	}

	private targetArgs(): string[] {
		return ["-o", "ForkAfterAuthentication=no", "-o", "StdinNull=no", ...(this.configFile ? ["-F", this.configFile] : []), ...(this.spec.user ? ["-l", this.spec.user] : []), ...(this.spec.port ? ["-p", String(this.spec.port)] : []), "--", this.spec.host];
	}

	private async authenticate(env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
		if (signal.aborted) throw new Error("SSH login cancelled.");
		let diagnostics = "";
		const master = spawn("ssh", [
			"-N", "-T", "-S", this.socket, "-o", "ControlMaster=yes", "-o", "ControlPersist=no",
			"-o", "StrictHostKeyChecking=ask", "-o", "ForwardAgent=no", "-o", "ForwardX11=no",
			"-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no", "-o", "ConnectTimeout=15", "-o", "ConnectionAttempts=1",
			"-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", "-o", "RemoteCommand=none", ...this.targetArgs(),
		], { stdio: ["ignore", "ignore", "pipe"], detached: true, env: { ...process.env, ...env } });
		this.master = master;
		process.once("exit", this.onExit);
		process.prependListener("SIGHUP", this.onHangup);
		process.prependListener("SIGTERM", this.onTerminate);
		master.stderr?.on("data", (data: Buffer) => { diagnostics = (diagnostics + data.toString()).slice(-4000); });
		master.once("error", () => { this.ended = true; });
		master.once("exit", () => {
			this.ended = true;
			if (this.ready && !this.stopped) this.disconnected();
		});
		const deadline = Date.now() + 300_000;
		while (!this.ended && !signal.aborted && Date.now() < deadline) {
			const checked = await sshCommand(["-S", this.socket, "-O", "check", ...this.targetArgs()], { timeout: 2 });
			if (checked.exitCode === 0) { this.ready = true; return; }
			await delay(100, undefined, { signal });
		}
		if (signal.aborted) throw new Error("SSH login cancelled.");
		if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(diagnostics)) {
			throw new Error("SSH host-key verification failed. Verify the server identity and your known_hosts entry outside Pi.");
		}
		if (/Permission denied/i.test(diagnostics)) throw new Error("SSH authentication was rejected. Check your username, key or password.");
		throw new Error("SSH connection failed or timed out. Check the server, port and SSH configuration.");
	}

	private async initialize(signal: AbortSignal): Promise<void> {
		const directory = shellQuote(this.spec.directory);
		const script = [
			`requested=${directory}`,
			`case "$requested" in '~') requested=$HOME;; '~/'*) requested="$HOME/\${requested#\\~/}";; esac`,
			`cd -- "$requested" || exit 1`,
			`workspace=$(pwd -P) || exit 1`,
			`temporary=$(mktemp -d "\${TMPDIR:-/tmp}/pi-workspace.XXXXXXXX") || exit 1`,
			`printf '%s\\0%s\\0%s\\0' "$HOME" "$workspace" "$temporary"`,
		].join("\n");
		const result = await this.execute(script, { signal, timeout: 15 });
		if (result.exitCode !== 0) throw new Error("Could not open the remote directory. The server needs bash and standard Unix utilities.");
		const fields = result.stdout.toString().split("\0");
		const [home, cwd, temporary, tail] = fields;
		const validPath = (path: string | undefined): path is string => typeof path === "string" && path.startsWith("/") && path.length <= 4096 && !/[\x00-\x1f\x7f-\x9f]/.test(path);
		if (fields.length !== 4 || !validPath(home) || !validPath(cwd) || !validPath(temporary) ||
			!(/\/pi-workspace\.[A-Za-z0-9]{8}$/).test(temporary) || tail !== "") {
			throw new Error("The SSH server returned invalid workspace metadata.");
		}
		this.remoteHome = home;
		this.root = cwd;
		this.remoteTemp = temporary;
	}

	private commandArgs(script: string): string[] {
		return ["-T", "-S", this.socket, "-o", "ControlMaster=no", "-o", "ProxyCommand=false", "-o", "BatchMode=yes", "-o", "RemoteCommand=none", "-o", "PermitLocalCommand=no",
			...this.targetArgs(), `bash -c ${shellQuote(script)}`];
	}

	private async execute(script: string, options: RunOptions, cancel?: () => Promise<void>): Promise<RemoteResult> {
		const result = await sshCommand(this.commandArgs(script), { ...options, cancel });
		if (result.exitCode === 255) {
			const check = await sshCommand(["-S", this.socket, "-O", "check", ...this.targetArgs()], { timeout: 2 });
			if (check.exitCode !== 0) {
				if (!this.ended && !this.stopped) this.disconnected();
				this.ended = true;
				throw new Error("SSH connection lost. Remote commands may still be running. Use /remote stop to return local; nothing ran locally.");
			}
		}
		return result;
	}

	private killMaster(): void {
		if (!this.master?.pid || this.master.exitCode !== null || this.master.signalCode !== null) return;
		try { process.kill(-this.master.pid, "SIGTERM"); } catch { /* Already exited. */ }
	}

	private removeListeners(): void {
		process.removeListener("exit", this.onExit);
		process.removeListener("SIGHUP", this.onHangup);
		process.removeListener("SIGTERM", this.onTerminate);
	}

	private onHangup = (): void => this.onSignal("SIGHUP");
	private onTerminate = (): void => this.onSignal("SIGTERM");
	private onSignal(signal: "SIGHUP" | "SIGTERM"): void {
		this.removeListeners();
		this.onExit();
		if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
	}
	private onExit = (): void => {
		this.stopped = true;
		try {
			if (this.remoteTemp && !this.ended) execFileSync("ssh", this.commandArgs(`rm -rf -- ${shellQuote(this.remoteTemp)}`), { stdio: "ignore", timeout: 750 });
		} catch { /* Network loss can prevent remote scratch cleanup. */ }
		this.killMaster();
		rmSync(this.directory, { recursive: true, force: true });
	};
}
