import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createRemoteTools, remotePath } from "../lib/operations.ts";
import { SshWorkspace } from "../lib/workspace.ts";
import { sshFixture } from "./ssh-fixture.ts";

function text(result: { content: { type: string; text?: string }[] }): string {
	return result.content.map((block) => block.text ?? "").join("\n");
}

test("all coding tools use the authenticated remote workspace, including hostile filenames and remote home", { timeout: 30_000 }, async (t) => {
	const fixture = await sshFixture();
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) =>
		prompt.kind === "confirm" ? "yes" : fixture.password, new AbortController().signal, () => {}, fixture.config);
	const tools = createRemoteTools(workspace);
	assert.equal(remotePath("~/dir/../x", workspace), join(fixture.home, "x"));
	assert.throws(() => remotePath("bad\0path", workspace), /NUL/);
	const name = "a 'quote' $(touch INJECTED).txt";
	await tools.write.execute("w", { path: `~/${name}`, content: "hello remote\nsecond line\n" });
	assert.equal(await readFile(join(fixture.home, name), "utf8"), "hello remote\nsecond line\n");
	assert.match(text(await tools.read.execute("r", { path: `~/${name}`, offset: 2, limit: 1 })), /second line/);
	await tools.edit.execute("e", { path: `~/${name}`, edits: [{ oldText: "hello remote", newText: "edited remotely" }] });
	assert.match(await readFile(join(fixture.home, name), "utf8"), /edited remotely/);
	assert.match(text(await tools.ls.execute("l", { path: "~" })), /quote/);
	assert.match(text(await tools.grep.execute("g", { pattern: "edited remotely", path: "~", literal: true })), /quote.*edited remotely/);
	assert.match(text(await tools.find.execute("f", { pattern: "*.txt", path: "~" })), /quote/);
	const bash = await tools.bash.execute("b", { command: "printf '%s' \"$HOME\"; exit 7" });
	assert.match(text(bash), /Command exited with code 7/);
	assert.match(text(bash), new RegExp(fixture.home));
	assert.ok(bash.structuredContent && typeof bash.structuredContent === "object" && "exit_code" in bash.structuredContent);
	assert.equal(bash.structuredContent.exit_code, 7);
	assert.doesNotMatch(fixture.commands.join("\n"), /must-not-forward/);
	assert.ok(!text(await tools.ls.execute("check", {})).split("\n").includes("INJECTED"));
	assert.equal(text(await tools.grep.execute("none", { pattern: "nevermatches-xyz", path: "~" })), "No matches found.");
});

test("remote read truncates text, supports images, and find matches recursive globs", { timeout: 30_000 }, async (t) => {
	const fixture = await sshFixture();
	let workspace: SshWorkspace | undefined;
	t.after(async () => { await workspace?.close(); await fixture.close(); });
	workspace = await SshWorkspace.connect({ host: "fixture", directory: "~" }, async (prompt) =>
		prompt.kind === "confirm" ? "yes" : fixture.password, new AbortController().signal, () => {}, fixture.config);
	const tools = createRemoteTools(workspace);
	await tools.write.execute("w", { path: "long.txt", content: Array.from({ length: 2500 }, (_, index) => `line${index}`).join("\n") });
	const read = await tools.read.execute("r", { path: "long.txt" });
	assert.match(text(read), /2000/);
	assert.doesNotMatch(text(read), /line2499/);
	await tools.write.execute("w2", { path: "src/nested/a.ts", content: "export const value = 1;" });
	await tools.write.execute("w3", { path: "src/b.ts", content: "export const value = 2;" });
	const found = text(await tools.find.execute("f", { pattern: "src/**/*.ts" }));
	assert.match(found, /src\/b.ts/);
	assert.match(found, /src\/nested\/a.ts/);
	await writeFile(join(fixture.home, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==", "base64"));
	const image = await tools.read.execute("image", { path: "pixel.png" });
	assert.ok(image.content.some((block) => block.type === "image"));
	const large = await tools.bash.execute("big", { command: "head -c 60000 /dev/zero | tr '\\0' x" });
	assert.match(text(large), /last 50 KB/);
	assert.doesNotMatch(text(large), /\/tmp\/.*\.log|Full output:/);
});
