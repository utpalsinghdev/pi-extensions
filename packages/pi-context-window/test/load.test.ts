import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";

test("pi loads the tool and the threshold command without compaction settings", { timeout: 60_000 }, async (t) => {
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

	await session.prompt("/context-threshold 70");
	assert.equal(JSON.parse(readFileSync(join(directory, "context-window.json"), "utf-8")).thresholdPercent, 70);
});
