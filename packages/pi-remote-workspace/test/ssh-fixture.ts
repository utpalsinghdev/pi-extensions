import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { spawn, type ChildProcess } from "node:child_process";
import ssh2, { type Connection } from "ssh2";
const { Server, utils } = ssh2;

const exec = promisify(execFile);

/** Real SSH protocol with disposable credentials. Exec channels run only in this test's scratch root. */
export async function sshFixture(method: "password" | "key" | "unencrypted-key" = "password") {
	const directory = await mkdtemp(join(tmpdir(), "pi-remote-fixture-"));
	const home = join(directory, "server");
	await exec("mkdir", ["-p", home]);
	const hostKey = join(directory, "host");
	const identity = join(directory, "identity");
	const password = "fixture password λ🙂 with spaces";
	const passphrase = method === "unencrypted-key" ? "" : "fixture key passphrase";
	const keyAuth = method !== "password";
	await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", hostKey]);
	await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", passphrase, "-f", identity]);
	const parsedKey = utils.parseKey(await readFile(identity), passphrase);
	if (parsedKey instanceof Error || Array.isArray(parsedKey)) throw new Error("Fixture key generation failed.");
	const clients = new Set<Connection>();
	const processes = new Set<ChildProcess>();
	const commands: string[] = [];
	const forwardedEnvironment: string[] = [];
	let connectionCount = 0;
	const server = new Server({ hostKeys: [await readFile(hostKey)] }, (client) => {
		connectionCount++;
		clients.add(client);
		client.on("error", () => {});
		client.on("close", () => clients.delete(client));
		client.on("authentication", (ctx) => {
			if (ctx.username !== "fixture") return ctx.reject();
			if (method === "password" && ctx.method === "password" && ctx.password === password) return ctx.accept();
			if (keyAuth && ctx.method === "publickey" && ctx.key.data.equals(parsedKey.getPublicSSH()) &&
				(!ctx.signature || (ctx.blob !== undefined && parsedKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true))) return ctx.accept();
			ctx.reject([keyAuth ? "publickey" : "password"]);
		});
		client.on("ready", () => client.on("session", (accept) => {
			const session = accept();
			session.on("env", (accept, _reject, info) => { forwardedEnvironment.push(info.key); accept(); });
			session.on("exec", (accept, _reject, info) => {
				commands.push(info.command);
				const stream = accept();
				const child = spawn("bash", ["-c", info.command], {
					cwd: home, detached: true,
					env: { PATH: process.env.PATH, HOME: home, USER: "fixture", LANG: "C.UTF-8", TMPDIR: directory },
					stdio: ["pipe", "pipe", "pipe"],
				});
				processes.add(child);
				child.stdin.on("error", () => {});
				stream.on("data", (data: Buffer) => child.stdin.write(data));
				stream.on("end", () => child.stdin.end());
				stream.on("error", () => {});
				stream.on("close", () => { if (child.exitCode === null) child.kill("SIGHUP"); });
				child.stdout.on("data", (data: Buffer) => stream.write(data));
				child.stderr.on("data", (data: Buffer) => stream.stderr.write(data));
				child.on("close", (code) => {
					processes.delete(child);
					if (!stream.destroyed) { stream.exit(code ?? 128); stream.end(); }
				});
			});
		}));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (typeof address === "string" || !address) throw new Error("Fixture did not bind a port.");
	const config = join(directory, "config");
	await writeFile(config, [
		"Host fixture", "  HostName 127.0.0.1", `  Port ${address.port}`, "  User fixture",
		`  UserKnownHostsFile ${directory}/known_hosts`, "  GlobalKnownHostsFile /dev/null",
		"  StrictHostKeyChecking ask", "  IdentityAgent none", "  IdentitiesOnly yes", "  SendEnv *",
		"  ForkAfterAuthentication yes", "  StdinNull yes",
		`  IdentityFile ${keyAuth ? identity : "none"}`, "  LogLevel ERROR",
	].join("\n"), { mode: 0o600 });
	return {
		directory, home, password, passphrase, config, commands, forwardedEnvironment, port: address.port,
		get connectionCount() { return connectionCount; },
		get activeConnections() { return clients.size; },
		disconnect: () => { for (const client of clients) client.end(); },
		async close() {
			for (const client of clients) client.end();
			for (const child of processes) {
				if (child.pid) try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already gone. */ }
			}
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(directory, { recursive: true, force: true });
		},
	};
}
