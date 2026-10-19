import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { SshWorkspace } from "../lib/workspace.ts";
import { shellQuote } from "../lib/config.ts";
import { sshFixture } from "./ssh-fixture.ts";

test("private host confirmation and password login establish a reusable remote workspace", { timeout: 30_000 }, async (t) => {
	const fixture = await sshFixture();
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	const prompts: string[] = [];
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) => {
		prompts.push(prompt.kind);
		return prompt.kind === "confirm" ? "yes" : fixture.password;
	}, AbortSignal.timeout(15000), () => {}, fixture.config);
	assert.deepEqual(prompts, ["confirm", "secret"]);
	assert.equal(workspace.cwd, fixture.home);
	assert.equal(workspace.home, fixture.home);
	assert.equal(workspace.connected, true);
	const result = await workspace.run("printf '%s' \"$HOME\"; printf 'stderr' >&2; exit 7");
	assert.equal(result.stdout.toString(), fixture.home);
	assert.equal(result.stderr.toString(), "stderr");
	assert.equal(result.exitCode, 7);
	const stdin = await workspace.run("cat", { input: "spaces\nλ🙂\n" });
	assert.equal(stdin.stdout.toString(), "spaces\nλ🙂\n");
	assert.deepEqual(prompts, ["confirm", "secret"], "Commands reuse authentication rather than prompting again");
	assert.ok(fixture.commands.every((command) => !command.includes(fixture.password)));
	assert.deepEqual(fixture.forwardedEnvironment, [], "Even a user config with SendEnv * must not forward local environment variables");
	await workspace.close();
	await assert.rejects(workspace.run("pwd"), /disconnected/);
});

test("encrypted SSH keys prompt privately, and rejecting host trust never authenticates", { timeout: 30_000 }, async (t) => {
	const fixture = await sshFixture("key");
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	await assert.rejects(SshWorkspace.connect({ host: "fixture", directory: "~" }, async () => "no",
		AbortSignal.timeout(15000), () => {}, fixture.config), /host-key verification/);
	const prompts: string[] = [];
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) => {
		prompts.push(prompt.kind);
		return prompt.kind === "confirm" ? "yes" : fixture.passphrase;
	}, AbortSignal.timeout(15000), () => {}, fixture.config);
	assert.deepEqual(prompts, ["confirm", "secret"]);
	assert.equal((await workspace.run("pwd")).stdout.toString().trim(), fixture.home);
});

test("remote execution cancels its process group, times out, and fails closed on disconnect", { timeout: 30_000 }, async (t) => {
	const fixture = await sshFixture();
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) =>
		prompt.kind === "confirm" ? "yes" : fixture.password, AbortSignal.timeout(15000), () => {}, fixture.config);
	const controller = new AbortController();
	const pidFile = join(fixture.home, "cancel.pid");
	const cancelled = workspace.run(`printf '%s' \"$$\" > ${shellQuote(pidFile)}; printf READY; exec sleep 20`, {
		signal: controller.signal,
		onData: (data) => { if (data.toString().includes("READY")) controller.abort(); },
	});
	await assert.rejects(cancelled, /cancelled/);
	const pid = (await readFile(pidFile)).toString();
	await assert.rejects(access(`/proc/${pid}`), "Cancelled remote process should be gone");
	await assert.rejects(workspace.run("sleep 20", { timeout: 0.15 }), /timed out/);

	const untouched = join(fixture.directory, "local-only");
	await writeFile(untouched, "unchanged");
	fixture.disconnect();
	for (let attempt = 0; attempt < 100 && workspace.connected; attempt++) await delay(20);
	assert.equal(workspace.connected, false);
	await assert.rejects(workspace.run(`printf BAD > ${shellQuote(untouched)}`), /disconnected|connection lost/i);
	assert.equal(await readFile(untouched, "utf8"), "unchanged");
});
