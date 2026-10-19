import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { SshWorkspace } from "../lib/workspace.ts";
import { sshFixture } from "./ssh-fixture.ts";

test("key authentication continues without asking for a password when no secret is needed", { timeout: 20_000 }, async (t) => {
	const fixture = await sshFixture("unencrypted-key");
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	const prompts: string[] = [];
	const folder = "sub 'quote' $(not-a-command)";
	await mkdir(join(fixture.home, folder));
	workspace = await SshWorkspace.connect({ host: "fixture", directory: `~/${folder}` }, async (prompt) => {
		prompts.push(prompt.kind);
		assert.equal(prompt.kind, "confirm", "A usable unencrypted key should not request a secret");
		return "yes";
	}, AbortSignal.timeout(10000), () => {}, fixture.config);
	assert.deepEqual(prompts, ["confirm"]);
	assert.equal(workspace.connected, true);
	assert.equal(workspace.cwd, join(fixture.home, folder));
});

test("changed host keys fail before authentication and are never bypassed", { timeout: 20_000 }, async (t) => {
	const fixture = await sshFixture();
	t.after(() => fixture.close());
	const otherKey = await readFile(join(fixture.directory, "identity.pub"), "utf8");
	await writeFile(join(fixture.directory, "known_hosts"), `[127.0.0.1]:${fixture.port} ${otherKey}`);
	let prompts = 0;
	await assert.rejects(SshWorkspace.connect({ host: "fixture", directory: "~" }, async () => {
		prompts++;
		return fixture.password;
	}, AbortSignal.timeout(10000), () => {}, fixture.config), /host-key verification failed/);
	assert.equal(prompts, 0);
	assert.equal(fixture.commands.length, 0);
});

test("cancelling an outstanding secret prompt settles login and removes signal handlers", { timeout: 20_000 }, async (t) => {
	const fixture = await sshFixture();
	t.after(() => fixture.close());
	const controller = new AbortController();
	const listeners = process.listenerCount("SIGTERM");
	await assert.rejects(SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) => {
		if (prompt.kind === "confirm") return "yes";
		controller.abort();
		return new Promise<string>(() => {});
	}, controller.signal, () => {}, fixture.config), /abort|cancel/i);
	assert.equal(process.listenerCount("SIGTERM"), listeners);
	assert.equal(fixture.commands.length, 0);
});
