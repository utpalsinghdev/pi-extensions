import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const tmuxAvailable = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const driver = fileURLToPath(new URL("./ui-driver.mjs", import.meta.url));

for (const [mode, auth] of [["fullscreen", "password"], ["regular", "key"]] as const) {
	test(`Pi ${mode} ${auth} login, remote tools, fail-closed disconnect, and stop back to local`, {
		skip: tmuxAvailable ? false : "tmux is required for the isolated interactive Pi test, not for the extension",
		timeout: 60_000,
	}, async () => {
		const { stdout } = await exec(process.execPath, ["--experimental-strip-types", driver, mode, auth], {
			timeout: 55_000, maxBuffer: 1024 * 1024,
		});
		assert.match(stdout, /PASS/);
	});
}
