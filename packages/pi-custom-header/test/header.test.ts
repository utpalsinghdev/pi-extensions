import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	createAgentSession,
	DefaultResourceLoader,
	initTheme,
	SessionManager,
	type AgentSession,
	type ExtensionUIContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	ProcessTerminal,
	stripTerminalSequences,
	TuiAltScreen,
	TuiMainScreen,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { createAnimatedHeader } from "../lib/animated-header.ts";
import { buildHeader } from "../lib/header.ts";
import { HEADER_PORTRAIT, HEADER_PORTRAIT_MIN_WIDTH } from "../lib/header-portrait.ts";
import { loadHeaderWorkspace } from "../lib/header-workspace.ts";
import type { HeaderDetails, HeaderWorkspace } from "../lib/types.ts";

const directory = mkdtempSync(join(tmpdir(), "pi-custom-header-"));
let session: AgentSession;
let theme: Theme;
const details: HeaderDetails = {
	sessionId: "test-session",
	model: "Example model",
	provider: "example",
	thinking: "high",
	tools: 4,
	commands: 1,
};
const workspace: HeaderWorkspace = {
	name: "中文🙂 workspace",
	path: "/tmp/中文🙂 workspace",
	recentSessions: [{ title: "Wide 中文🙂 title".repeat(10), modified: new Date(0) }],
};

before(async () => {
	initTheme("dark", false);
	const loader = new DefaultResourceLoader({
		cwd: directory,
		agentDir: directory,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		additionalExtensionPaths: [fileURLToPath(new URL("../extensions/index.ts", import.meta.url))],
	});
	await loader.reload();
	const result = await createAgentSession({
		cwd: directory,
		agentDir: directory,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(),
	});
	assert.deepEqual(result.extensionsResult.errors, []);
	session = result.session;
	theme = session.extensionRunner.getUIContext().theme;
});

after(() => {
	session?.dispose();
	rmSync(directory, { recursive: true, force: true });
});

class TestTerminal extends ProcessTerminal {
	override get columns() { return 100; }
	override get rows() { return 40; }
}

test("all portrait frames fit, preserve split alignment, and collapse on narrow terminals", () => {
	for (const frame of ["open", "quarter", "half", "threeQuarter", "closed"] as const) {
		for (const width of [0, 1, 8, 24, HEADER_PORTRAIT_MIN_WIDTH - 1, HEADER_PORTRAIT_MIN_WIDTH, 80, 120]) {
			const lines = buildHeader({ theme, details, workspace, width, frame });
			assert.equal(lines.length, 20);
			assert.ok(lines.every((line) => visibleWidth(line) <= width), `${frame} at width ${width}`);
			const plain = lines.map(stripTerminalSequences);
			if (width >= HEADER_PORTRAIT_MIN_WIDTH) {
				assert.ok(plain[1]?.startsWith(HEADER_PORTRAIT[frame][0] ?? ""));
				assert.equal(new Set(plain.slice(1).map((line) => line.indexOf("│"))).size, 1);
			} else {
				assert.ok(plain.every((line) => !/[\u2800-\u28ff]/u.test(line)));
			}
		}
	}
});

test("external titles cannot inject terminal controls; changing themes changes colors", () => {
	const dirty = { ...workspace, recentSessions: [{ title: "\x1b[31mRed\x1b[0m\n\x07title", modified: new Date() }] };
	const lines = buildHeader({ theme, details, workspace: dirty, width: 120 });
	const plain = lines.map(stripTerminalSequences).join("\n");
	assert.match(plain, /Red title/);
	assert.ok(!lines.join("").includes("\x07"));
	assert.match(plain, /Example model/);
	assert.match(plain, /Workspace: 中文🙂 workspace/);
	assert.match(plain, /\/hotkeys/);
	assert.ok(!plain.includes("Upstream:"));
	try {
		initTheme("light", false);
		const light = buildHeader({ theme, details, workspace: dirty, width: 120 });
		assert.notEqual(light[1], lines[1]);
		assert.equal(stripTerminalSequences(light[1] ?? ""), stripTerminalSequences(lines[1] ?? ""));
	} finally {
		initTheme("dark", false);
	}
});

test("workspace history uses real sessions, excludes current and empty sessions, and limits to three", async () => {
	const cwd = join(directory, "workspace");
	const sessionDir = join(directory, "sessions");
	const current = SessionManager.create(cwd, sessionDir);
	current.appendMessage({ role: "user", content: "Current", timestamp: Date.now() });
	SessionManager.create(cwd, sessionDir);
	for (let index = 0; index < 5; index++) {
		const previous = SessionManager.create(cwd, sessionDir);
		previous.appendMessage({ role: "user", content: "Fallback prompt", timestamp: Date.now() });
		previous.appendSessionInfo(`Previous ${index}\x1b[31m\n`);
	}
	const result = await loadHeaderWorkspace({ cwd, sessionId: current.getSessionId(), sessionDir });
	assert.equal(result.name, "workspace");
	assert.equal(result.recentSessions.length, 3);
	assert.ok(result.recentSessions.every((entry) => /^Previous \d$/.test(entry.title)));
	const empty = await loadHeaderWorkspace({ cwd, sessionId: "none", sessionDir: join(directory, "missing") });
	assert.deepEqual(empty.recentSessions, []);
});

test("sparse blink updates stop after disposal, narrow resize, or regular-mode scrollback", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	t.mock.method(Math, "random", () => 0);
	const tui = new TuiMainScreen(new TestTerminal());
	const requestRender = t.mock.method(tui, "requestRender", () => {});
	const header = createAnimatedHeader({ tui, theme, getDetails: () => details, workspace });
	t.after(() => header.dispose());
	tui.addChild(header);
	const initial = header.render(100);
	t.mock.timers.tick(1_599);
	assert.equal(requestRender.mock.callCount(), 0);
	t.mock.timers.tick(1);
	assert.equal(requestRender.mock.callCount(), 1);
	assert.notDeepEqual(header.render(100), initial);
	header.render(20);
	t.mock.timers.tick(10_000);
	assert.equal(requestRender.mock.callCount(), 1);
	header.render(100);
	tui.addChild({ render: () => Array.from({ length: 50 }, () => "history"), invalidate() {} });
	t.mock.timers.tick(10_000);
	assert.equal(requestRender.mock.callCount(), 1);
	tui.children.pop();
	header.render(100);
	t.mock.timers.tick(1_600);
	assert.equal(requestRender.mock.callCount(), 2);
	header.dispose();
	header.dispose();
	t.mock.timers.tick(10_000);
	assert.equal(requestRender.mock.callCount(), 2);
});

test("static header never requests animation renders in fullscreen mode", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const tui = new TuiAltScreen(new TestTerminal());
	const requestRender = t.mock.method(tui, "requestRender", () => {});
	const header = createAnimatedHeader({ tui, theme, getDetails: () => details, workspace, animate: false });
	t.after(() => header.dispose());
	const first = header.render(100);
	t.mock.timers.tick(60_000);
	assert.equal(header.render(100)[7], first[7]);
	assert.equal(requestRender.mock.callCount(), 0);
});

test("real extension lifecycle leaves non-TUI modes alone, restores built-in header, and reloads", async () => {
	const runner = session.extensionRunner;
	const baseUI = runner.getUIContext();
	let factory: Parameters<ExtensionUIContext["setHeader"]>[0];
	let installed = 0;
	const ui: ExtensionUIContext = {
		...baseUI,
		setHeader(next) { factory = next; installed++; },
	};
	for (const mode of ["rpc", "json", "print"] as const) {
		await session.bindExtensions({ uiContext: ui, mode });
		assert.equal(installed, 0);
	}
	runner.setFlagValue("header-static", true);
	await session.bindExtensions({ uiContext: ui, mode: "tui" });
	assert.equal(installed, 1);
	assert.ok(factory);
	const tui = new TuiMainScreen(new TestTerminal());
	const component = factory(tui, theme);
	const output = component.render(120).map(stripTerminalSequences).join("\n");
	assert.match(output, /No previous sessions/);
	assert.match(output, /Session:/);
	await session.prompt("/builtin-header");
	assert.equal(factory, undefined);
	component.dispose?.();
	await session.reload();
	assert.ok(factory);
	assert.ok(session.extensionRunner.getFlags().has("header-static"));
});
