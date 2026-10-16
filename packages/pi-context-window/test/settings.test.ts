import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { loadSettings, readThreshold, saveSettings, settingsPath } from "../lib/settings.ts";

function fixture(t: TestContext) {
	const directory = mkdtempSync(join(tmpdir(), "pi-context-window-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return { directory, file: join(directory, "context-window.json") };
}

test("missing file is an unset threshold", (t) => {
	const { directory, file } = fixture(t);
	assert.deepEqual(loadSettings(file), { thresholdPercent: null });
	assert.deepEqual(readThreshold(settingsPath(directory)), { thresholdPercent: null, error: null });
});

test("save and load round-trip an integer threshold and a cleared threshold", (t) => {
	const { file } = fixture(t);
	saveSettings(file, { thresholdPercent: 70 });
	assert.deepEqual(loadSettings(file), { thresholdPercent: 70 });
	if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
	saveSettings(file, { thresholdPercent: null });
	assert.deepEqual(loadSettings(file), { thresholdPercent: null });
});

test("invalid files are rejected and left unchanged", (t) => {
	const { file } = fixture(t);
	for (const content of ["{", "null", "{}", JSON.stringify({ thresholdPercent: 0 }), JSON.stringify({ thresholdPercent: 70.5 }), JSON.stringify({ thresholdPercent: 100 })]) {
		writeFileSync(file, content);
		assert.throws(() => loadSettings(file));
		assert.equal(readFileSync(file, "utf-8"), content);
		const read = readThreshold(file);
		assert.equal(read.thresholdPercent, null);
		assert.match(read.error ?? "", /Invalid context threshold file/);
	}
});

test("read errors other than a missing file are not treated as unset", (t) => {
	const { file } = fixture(t);
	mkdirSync(file);
	assert.throws(() => loadSettings(file));
	assert.match(readThreshold(file).error ?? "", /EISDIR|EPERM|EACCES|illegal|invalid/i);
});

test("failed replacement leaves the existing destination intact", (t) => {
	const { directory, file } = fixture(t);
	mkdirSync(file);
	writeFileSync(join(file, "keep"), "original");
	assert.throws(() => saveSettings(file, { thresholdPercent: 70 }));
	assert.equal(readFileSync(join(file, "keep"), "utf-8"), "original");
	assert.deepEqual(readdirSync(directory), ["context-window.json"]);
});
