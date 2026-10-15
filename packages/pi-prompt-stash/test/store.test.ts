import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DEFAULT_STASH_SHORTCUT } from "../lib/shortcut.ts";
import { loadState, saveState, type StashState } from "../lib/store.ts";

function fixture(t: TestContext) {
	const directory = mkdtempSync(join(tmpdir(), "pi-prompt-stash-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return { directory, file: join(directory, "prompt-stash.json") };
}

const state: StashState = {
	stashes: [{ id: 1, text: "First line\n  中文 🙂\nLast line", timestamp: 123 }],
	nextId: 2,
	shortcut: "alt+s",
};

test("missing file starts empty; saving creates an agent directory and survives reload", (t) => {
	const { directory } = fixture(t);
	const file = join(directory, "agent", "prompt-stash.json");
	assert.deepEqual(loadState(file), { stashes: [], nextId: 1, shortcut: DEFAULT_STASH_SHORTCUT });
	saveState(file, state);
	assert.deepEqual(loadState(file), state);
	assert.deepEqual(readdirSync(join(directory, "agent")), ["prompt-stash.json"]);
	if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("legacy files keep prompt text, IDs and timestamps without needing a shortcut field", (t) => {
	const { file } = fixture(t);
	writeFileSync(file, JSON.stringify({ stashes: state.stashes, nextId: state.nextId }));
	assert.deepEqual(loadState(file), { ...state, shortcut: DEFAULT_STASH_SHORTCUT });
});

test("invalid shortcut falls back to the default without discarding prompts", (t) => {
	const { file } = fixture(t);
	writeFileSync(file, JSON.stringify({ ...state, shortcut: "s" }));
	assert.deepEqual(loadState(file), { ...state, shortcut: DEFAULT_STASH_SHORTCUT });
});

test("corrupt data is rejected without overwriting the original file", (t) => {
	const { file } = fixture(t);
	for (const content of [
		"{",
		"null",
		JSON.stringify({ ...state, stashes: [null] }),
		JSON.stringify({ ...state, stashes: [{ id: 1, timestamp: 0 }] }),
		JSON.stringify({ ...state, nextId: 1 }),
		JSON.stringify({ ...state, nextId: 1.5 }),
		JSON.stringify({ ...state, stashes: [state.stashes[0], state.stashes[0]] }),
	]) {
		writeFileSync(file, content);
		assert.throws(() => loadState(file));
		assert.equal(readFileSync(file, "utf-8"), content);
	}
});

test("read errors other than a missing file are not mistaken for an empty stash", (t) => {
	const { file } = fixture(t);
	mkdirSync(file);
	assert.throws(() => loadState(file));
});

test("failed replacement leaves existing destination intact and removes temporary files", (t) => {
	const { directory, file } = fixture(t);
	mkdirSync(file);
	writeFileSync(join(file, "keep"), "original");
	assert.throws(() => saveState(file, state));
	assert.equal(readFileSync(join(file, "keep"), "utf-8"), "original");
	assert.deepEqual(readdirSync(directory), ["prompt-stash.json"]);
});

test("delete and clear states persist without changing the shortcut", (t) => {
	const { file } = fixture(t);
	saveState(file, state);
	const deleted = { ...loadState(file), stashes: [] };
	saveState(file, deleted);
	assert.deepEqual(loadState(file), deleted);
	const cleared = { ...deleted, nextId: 1 };
	saveState(file, cleared);
	assert.deepEqual(loadState(file), cleared);
});
