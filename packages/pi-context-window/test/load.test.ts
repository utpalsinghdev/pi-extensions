import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, SessionManager, type AgentToolResult } from "@earendil-works/pi-coding-agent";

test("pi loads the tool and both threshold commands, including static persistence across reload", { timeout: 60_000 }, async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "pi-context-window-session-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousOffline = process.env.PI_OFFLINE;
	process.env.PI_CODING_AGENT_DIR = directory;
	process.env.PI_OFFLINE = "1";
	t.after(() => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		if (previousOffline === undefined) delete process.env.PI_OFFLINE;
		else process.env.PI_OFFLINE = previousOffline;
		rmSync(directory, { recursive: true, force: true });
	});

	const extensionPath = fileURLToPath(new URL("../extensions/index.ts", import.meta.url));
	const loader = new DefaultResourceLoader({
		cwd: directory,
		agentDir: directory,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		additionalExtensionPaths: [extensionPath],
	});
	await loader.reload();
	const { session, extensionsResult } = await createAgentSession({
		cwd: directory,
		agentDir: directory,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(),
	});
	t.after(() => session.dispose());

	assert.deepEqual(extensionsResult.errors, []);
	const tool = session.getAllTools().find((entry) => entry.name === "context_window");
	assert.ok(tool);
	assert.match(tool.promptGuidelines?.join("\n") ?? "", /threshold reached/);
	assert.match(session.systemPrompt, /If the report says threshold reached/);
	assert.equal(session.systemPrompt.includes("auto-compaction"), false);
	assert.equal(session.systemPrompt.includes("reserveTokens"), false);

	const file = join(directory, "context-window.json");
	await session.prompt("/context-threshold 70");
	assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")), { thresholdPercent: 70 });
	await session.prompt("/context-threshold-static 200k");
	assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")), { thresholdPercent: null, thresholdTokens: 200_000 });

	await session.reload();
	const loadedTool = session.agent.state.tools.find((entry) => entry.name === "context_window");
	assert.ok(loadedTool);
	const result = await loadedTool.execute("static-after-reload", {});
	assert.match(result.content.find((entry) => entry.type === "text")?.text ?? "", /threshold 200000 tokens/);
	assert.deepEqual(result.structuredContent, result.details);
	const structured = result.structuredContent;
	assert.ok(structured && typeof structured === "object" && "thresholdTokens" in structured && "thresholdPercent" in structured);
	assert.equal(structured.thresholdTokens, 200_000);
	assert.equal(structured.thresholdPercent, null);

	const model = session.extensionRunner.getModelRegistry().getAll()[0];
	assert.ok(model);
	for (const contextWindow of [500_000, 1_000_000]) {
		session.agent.state.model = { ...model, contextWindow };
		for (const tokens of [199_999, 200_000, 200_001]) {
			session.sessionManager.appendMessage({
				role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
				usage: {
					input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop", timestamp: Date.now(),
			});
			const outcome: AgentToolResult<unknown> = await loadedTool.execute(`static-${contextWindow}-${tokens}`, {});
			const payload = outcome.structuredContent;
			assert.ok(payload && typeof payload === "object" && "thresholdReached" in payload);
			assert.equal(payload.contextWindow, contextWindow);
			assert.equal(payload.usedTokens, tokens);
			assert.equal(payload.thresholdTokens, 200_000);
			assert.equal(payload.thresholdReached, tokens >= 200_000);
			assert.equal(payload.tokensUntilThreshold, Math.max(0, 200_000 - tokens));
		}
	}

	await session.prompt("/context-threshold 60");
	assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")), { thresholdPercent: 60 });
	await session.prompt("/context-threshold-static 200000");
	assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")), { thresholdPercent: null, thresholdTokens: 200_000 });
	await session.prompt("/context-threshold-static off");
	assert.deepEqual(JSON.parse(readFileSync(file, "utf-8")), { thresholdPercent: null });
});
