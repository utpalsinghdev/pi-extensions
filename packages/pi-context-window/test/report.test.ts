import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextReport, structuredReport } from "../lib/report.ts";

const windowTokens = 200_000;

test("unknown window reports no sizes and keeps a configured threshold", () => {
	const report = buildContextReport({
		usage: undefined,
		modelContextWindow: 0,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(report.text, "Context: unknown used | unknown tokens remaining | threshold 70%");
	assert.equal(report.details.available, false);
	assert.equal(report.details.thresholdPercent, 70);
	assert.equal(report.details.thresholdReached, null);
});

test("a selected model supplies the window when usage is missing", () => {
	const report = buildContextReport({
		usage: undefined,
		modelContextWindow: 500_000,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(report.text, "Context: unknown used | 500000 token window | unknown tokens remaining | threshold 70%");
	assert.equal(report.details.contextWindow, 500_000);
	assert.equal(report.details.usageKnown, false);
});

test("known window with unknown usage does not invent a reached flag", () => {
	const report = buildContextReport({
		usage: { tokens: null, contextWindow: windowTokens, percent: null },
		modelContextWindow: windowTokens,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(report.text, "Context: unknown used | 200000 token window | unknown tokens remaining | threshold 70%");
	assert.equal(report.details.available, true);
	assert.equal(report.details.usageKnown, false);
	assert.equal(report.details.thresholdReached, null);
});

test("known usage without a threshold does not invent a limit", () => {
	const report = buildContextReport({
		usage: { tokens: 84_000, contextWindow: windowTokens, percent: 42 },
		modelContextWindow: undefined,
		thresholdPercent: null,
		thresholdError: null,
	});
	assert.equal(report.text, "Context: 42% used | 84000/200000 tokens | 116000 remaining | threshold not set");
	assert.equal(report.details.thresholdReached, null);
	assert.equal(report.details.remainingPercent, 58);
});

test("usage below, at, and above the threshold uses exact token math", () => {
	const below = buildContextReport({
		usage: { tokens: 69_999, contextWindow: 100_000, percent: null },
		modelContextWindow: 100_000,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(below.details.thresholdReached, false);
	assert.equal(below.details.tokensUntilThreshold, 1);
	assert.match(below.text, /under 0.1% until threshold$/);

	const at = buildContextReport({
		usage: { tokens: 70_000, contextWindow: 100_000, percent: null },
		modelContextWindow: 100_000,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(at.details.thresholdReached, true);
	assert.equal(at.details.tokensUntilThreshold, 0);
	assert.match(at.text, /threshold reached$/);

	const above = buildContextReport({
		usage: { tokens: 142_400, contextWindow: windowTokens, percent: null },
		modelContextWindow: windowTokens,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(above.details.thresholdReached, true);
	assert.equal(above.details.usedTokens, 142_400);
	assert.equal(above.details.remainingTokens, 57_600);
});

test("a fractional threshold boundary rounds the remaining tokens up", () => {
	const report = buildContextReport({
		usage: { tokens: 1, contextWindow: 3, percent: null },
		modelContextWindow: 3,
		thresholdPercent: 50,
		thresholdError: null,
	});
	assert.equal(report.details.thresholdReached, false);
	assert.equal(report.details.tokensUntilThreshold, 1);
});

test("usage above the window clamps remaining tokens at zero", () => {
	const report = buildContextReport({
		usage: { tokens: 250_000, contextWindow: windowTokens, percent: null },
		modelContextWindow: windowTokens,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(report.details.remainingTokens, 0);
	assert.equal(report.details.remainingPercent, 0);
	assert.equal(report.details.thresholdReached, true);
});

test("an invalid threshold file hides the limit without dropping usage", () => {
	const report = buildContextReport({
		usage: { tokens: 10, contextWindow: 100, percent: null },
		modelContextWindow: 100,
		thresholdPercent: 70,
		thresholdError: "Invalid context threshold file: /tmp/context-window.json",
	});
	assert.match(report.text, /10\/100 tokens/);
	assert.match(report.text, /threshold unavailable$/);
	assert.equal(report.details.thresholdPercent, null);
	assert.equal(report.details.thresholdReached, null);
	assert.match(report.details.thresholdError ?? "", /Invalid context threshold file/);
});

test("static threshold stays at 200k across model windows and uses exact token boundaries", () => {
	for (const contextWindow of [100_000, 200_000, 500_000, 1_000_000]) {
		for (const tokens of [199_999, 200_000, 200_001]) {
			const report = buildContextReport({
				usage: { tokens, contextWindow, percent: null },
				modelContextWindow: contextWindow,
				thresholdPercent: null,
				thresholdTokens: 200_000,
				thresholdError: null,
			});
			assert.equal(report.details.contextWindow, contextWindow);
			assert.equal(report.details.usedPercent, tokens / contextWindow * 100);
			assert.equal(report.details.remainingTokens, Math.max(0, contextWindow - tokens));
			assert.equal(report.details.thresholdPercent, null);
			assert.equal(report.details.thresholdTokens, 200_000);
			assert.equal(report.details.thresholdReached, tokens >= 200_000);
			assert.equal(report.details.tokensUntilThreshold, Math.max(0, 200_000 - tokens));
			assert.equal(report.details.percentPointsUntilThreshold, null);
			assert.match(report.text, /threshold 200000 tokens/);
			assert.match(report.text, tokens < 200_000 ? /1 tokens until threshold$/ : /threshold reached$/);
			assert.deepEqual(structuredReport(report.details), report.details);
		}
	}
});

test("static reports keep the limit when usage or window is unknown without inventing a gap", () => {
	for (const modelContextWindow of [undefined, 500_000]) {
		const report = buildContextReport({
			usage: undefined,
			modelContextWindow,
			thresholdPercent: null,
			thresholdTokens: 200_000,
			thresholdError: null,
		});
		assert.match(report.text, /unknown used/);
		assert.match(report.text, /threshold 200000 tokens$/);
		assert.equal(report.details.thresholdTokens, 200_000);
		assert.equal(report.details.thresholdReached, null);
		assert.equal(report.details.tokensUntilThreshold, null);
	}
});

test("a settings error hides a static threshold without dropping usage", () => {
	const report = buildContextReport({
		usage: { tokens: 84_000, contextWindow: 500_000, percent: null },
		modelContextWindow: 500_000,
		thresholdPercent: null,
		thresholdTokens: 200_000,
		thresholdError: "Invalid context threshold file",
	});
	assert.match(report.text, /84000\/500000 tokens/);
	assert.match(report.text, /threshold unavailable$/);
	assert.equal(report.details.thresholdTokens, null);
	assert.equal(report.details.thresholdReached, null);
	assert.equal(report.details.tokensUntilThreshold, null);
});

test("percentage reports leave static threshold unset in structured output", () => {
	const report = buildContextReport({
		usage: { tokens: 84_000, contextWindow: windowTokens, percent: null },
		modelContextWindow: windowTokens,
		thresholdPercent: 70,
		thresholdError: null,
	});
	assert.equal(report.details.thresholdTokens, null);
	assert.deepEqual(structuredReport(report.details), report.details);
});

test("the report does not include compaction settings", () => {
	const report = buildContextReport({
		usage: { tokens: 1, contextWindow: 100, percent: 1 },
		modelContextWindow: 100,
		thresholdPercent: 70,
		thresholdError: null,
	});
	const encoded = JSON.stringify(report);
	assert.equal(encoded.includes("autoCompaction"), false);
	assert.equal(encoded.includes("reserveTokens"), false);
	assert.equal(report.text.includes("auto-compaction"), false);
});
