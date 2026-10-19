import { spawn } from "node:child_process";
import type { RemoteResult, RunOptions } from "./remote-types.ts";

/** One multiplexed SSH channel. Output is bounded; cancelled commands get a remote cleanup attempt. */
export function sshCommand(args: string[], options: RunOptions & {
	cancel?: () => Promise<void>;
} = {}): Promise<RemoteResult> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) return reject(new Error("Remote operation cancelled."));
		const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let size = 0;
		let failure: string | undefined;
		let cancelling: Promise<void> | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const cancel = (reason: string): void => {
			if (cancelling) return;
			failure = reason;
			cancelling = (async () => {
				try { await options.cancel?.(); } catch { /* A lost connection may prevent remote cleanup. */ }
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGTERM");
					killTimer = setTimeout(() => child.kill("SIGKILL"), 250);
				}
			})();
		};
		const aborted = () => cancel("Remote operation cancelled. Input or changes already applied cannot be undone.");
		options.signal?.addEventListener("abort", aborted, { once: true });
		const timer = options.timeout ? setTimeout(() => cancel("Remote operation timed out."), options.timeout * 1000) : undefined;
		const receive = (data: Buffer, chunks: Buffer[]): void => {
			options.onData?.(data);
			if (options.onData) return;
			size += data.length;
			if (size > 32 * 1024 * 1024) cancel("Remote output exceeds 32 MiB. Read a smaller range using bash.");
			else chunks.push(data);
		};
		child.stdout.on("data", (data: Buffer) => receive(data, stdout));
		child.stderr.on("data", (data: Buffer) => receive(data, stderr));
		child.stdin.on("error", () => {});
		child.stdin.end(options.input);
		child.once("error", () => { failure = "Could not start SSH. Check that OpenSSH is installed."; });
		child.once("close", (exitCode) => {
			void (async () => {
				await cancelling;
				if (timer) clearTimeout(timer);
				if (killTimer) clearTimeout(killTimer);
				options.signal?.removeEventListener("abort", aborted);
				if (failure) reject(new Error(failure));
				else if (exitCode === null) reject(new Error("SSH channel closed unexpectedly. Remote commands may still be running."));
				else resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode });
			})();
		});
	});
}
