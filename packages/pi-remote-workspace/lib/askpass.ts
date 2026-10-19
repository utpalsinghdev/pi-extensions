import { createServer, type Socket } from "node:net";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { shellQuote, type AskPass } from "./config.ts";

/** Serve native SSH prompts without adding credentials to Pi messages, logs or process arguments. */
export async function createAskPass(directory: string, ask: AskPass): Promise<{
	env: NodeJS.ProcessEnv;
	close(): Promise<void>;
}> {
	const sockets = new Set<Socket>();
	const path = join(directory, "auth.sock");
	const executable = join(directory, "askpass");
	const helper = fileURLToPath(new URL("./askpass.mjs", import.meta.url));
	await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(helper)} "$@"\n`, { mode: 0o700 });
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => {});
		let input = "";
		let handled = false;
		socket.on("data", (data) => {
			if (handled) return;
			input += data.toString();
			if (input.length > 65536) return socket.destroy();
			if (!input.includes("\n")) return;
			handled = true;
			void (async () => {
				try {
					const prompt: unknown = JSON.parse(input);
					input = "";
					if (!prompt || typeof prompt !== "object" || !("text" in prompt) || typeof prompt.text !== "string") {
						socket.end("{}\n");
						return;
					}
					const kind = "kind" in prompt && prompt.kind === "confirm" ? "confirm" : "secret";
					const answer = await ask({ text: prompt.text, kind });
					if (!socket.destroyed) socket.end(JSON.stringify({ answer }) + "\n");
				} catch {
					if (!socket.destroyed) socket.end("{}\n");
				}
			})();
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(path, () => { server.removeListener("error", reject); resolve(); });
	});
	return {
		env: {
			SSH_ASKPASS: executable,
			SSH_ASKPASS_REQUIRE: "force",
			DISPLAY: process.env.DISPLAY || "pi-remote-workspace:0",
			PI_REMOTE_WORKSPACE_ASKPASS_SOCKET: path,
		},
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}
