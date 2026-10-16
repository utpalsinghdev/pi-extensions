import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { handleThresholdCommand, parseThresholdCommand } from "../lib/command.ts";
import { loadSettings } from "../lib/settings.ts";

function fixture(t: TestContext) {
	const directory = mkdtempSync(join(tmpdir(), "pi-context-window-command-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return { directory, file: join(directory, "context-window.json") };
}

function host(usageTokens?: number) {
	const notices: Array<{ message: string; type: string }> = [];
	return {
		notices,
		usage: usageTokens === undefined ? undefined : { tokens: usageTokens, contextWindow: 100_000, percent: null },
		modelContextWindow: 100_000,
		notify(message: string, type: "info" | "warning" | "error") {
			notices.push({ message, type });
		},
	};
}

test("parses show, set, clear, and invalid input", () => {
	assert.deepEqual(parseThresholdCommand("  "), { kind: "show" });
	assert.deepEqual(parseThresholdCommand("70"), { kind: "set", percent: 70 });
	assert.deepEqual(parseThresholdCommand(" 70% "), { kind: "set", percent: 70 });
	assert.deepEqual(parseThresholdCommand("01"), { kind: "set", percent: 1 });
	assert.deepEqual(parseThresholdCommand("99"), { kind: "set", percent: 99 });
	assert.deepEqual(parseThresholdCommand("CLEAR"), { kind: "clear" });
	assert.deepEqual(parseThresholdCommand("off"), { kind: "clear" });
	for (const args of ["0", "100", "70.5", "70 percent", "abc", "-1"]) {
		assert.equal(parseThresholdCommand(args).kind, "invalid", args);
	}
});

test("set writes only the threshold file and warns when usage is already over it", (t) => {
	const { directory, file } = fixture(t);
	const over = host(80_000);
	handleThresholdCommand("70", over, file);
	assert.deepEqual(loadSettings(file), { thresholdPercent: 70 });
	assert.deepEqual(readdirSync(directory), ["context-window.json"]);
	assert.equal(over.notices[0]?.type, "warning");
	assert.match(over.notices[0]?.message ?? "", /Context threshold set to 70%/);
	assert.match(over.notices[0]?.message ?? "", /threshold reached/);
});

test("set below the current usage is informational", (t) => {
	const { file } = fixture(t);
	const under = host(10_000);
	handleThresholdCommand("70", under, file);
	assert.equal(under.notices[0]?.type, "info");
	assert.match(under.notices[0]?.message ?? "", /60% until threshold/);
});

test("show and clear do not invent a threshold", (t) => {
	const { file } = fixture(t);
	const shown = host(10_000);
	handleThresholdCommand("", shown, file);
	assert.match(shown.notices[0]?.message ?? "", /Context threshold is not set/);
	assert.match(shown.notices[0]?.message ?? "", /threshold not set/);
	assert.equal(readdirSync(join(file, "..")).includes("context-window.json"), false);

	handleThresholdCommand("70", host(), file);
	const cleared = host(10_000);
	handleThresholdCommand("clear", cleared, file);
	assert.deepEqual(loadSettings(file), { thresholdPercent: null });
	assert.match(cleared.notices[0]?.message ?? "", /Context threshold cleared/);
	assert.match(cleared.notices[0]?.message ?? "", /threshold not set/);
});

test("invalid input does not write, and a corrupt file is not overwritten by show", (t) => {
	const { directory, file } = fixture(t);
	const invalid = host();
	handleThresholdCommand("100", invalid, file);
	assert.equal(invalid.notices[0]?.type, "warning");
	assert.deepEqual(readdirSync(directory), []);

	writeFileSync(file, "{");
	const shown = host(10_000);
	handleThresholdCommand("", shown, file);
	assert.equal(readFileSync(file, "utf-8"), "{");
	assert.equal(shown.notices[0]?.type, "error");
	assert.match(shown.notices[0]?.message ?? "", /Could not read the context threshold/);
	assert.match(shown.notices[0]?.message ?? "", /threshold unavailable/);
});

test("set repairs a corrupt file", (t) => {
	const { file } = fixture(t);
	writeFileSync(file, "{");
	handleThresholdCommand("70", host(), file);
	assert.deepEqual(loadSettings(file), { thresholdPercent: 70 });
});

test("a failed save leaves the previous file and reports the error", (t) => {
	const { file } = fixture(t);
	mkdirSync(file);
	writeFileSync(join(file, "keep"), "original");
	const failed = host();
	handleThresholdCommand("70", failed, file);
	assert.equal(failed.notices[0]?.type, "error");
	assert.match(failed.notices[0]?.message ?? "", /Nothing was changed/);
	assert.equal(readFileSync(join(file, "keep"), "utf-8"), "original");
});
