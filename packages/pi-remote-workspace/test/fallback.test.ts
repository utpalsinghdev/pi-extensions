import assert from "node:assert/strict";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { SshWorkspace } from "../lib/workspace.ts";
import { sshFixture } from "./ssh-fixture.ts";

test("a missing control socket cannot silently reauthenticate even with a usable passwordless key", { timeout: 20_000 }, async (t) => {
	const fixture = await sshFixture("unencrypted-key");
	let workspace: SshWorkspace | undefined;
	t.after(async () => {
		await workspace?.close();
		await fixture.close();
	});
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async () => "yes", AbortSignal.timeout(10000), () => {}, fixture.config);
	const connections = fixture.connectionCount;
	const socket: unknown = Reflect.get(workspace, "socket");
	assert.equal(typeof socket, "string");
	if (typeof socket !== "string") throw new Error("Missing test control socket.");
	await unlink(socket);
	await assert.rejects(workspace.run("touch SHOULD_NOT_RUN"), /connection lost/);
	assert.equal(fixture.connectionCount, connections, "No new SSH authentication attempt was made");
	await assert.rejects(access(join(fixture.home, "SHOULD_NOT_RUN")));
	assert.equal(workspace.connected, false);
});
