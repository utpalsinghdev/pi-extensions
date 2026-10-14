import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AssistantMessageComponent,
	initTheme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	getCapabilities,
	ProcessTerminal,
	setCapabilities,
	TuiMainScreen,
	Text,
} from "@earendil-works/pi-tui";
import {
	type FocusOptions,
	installFocusAdapter,
} from "../lib/render-adapter.ts";

initTheme("dark", false);

type AssistantMessage = NonNullable<
	ConstructorParameters<typeof AssistantMessageComponent>[0]
>;

function message(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "verification",
		model: "verification",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

test("focus hides the whole native tool component, including inline images, then restores it", () => {
	const tui = new TuiMainScreen(new ProcessTerminal());
	tui.stop();
	const capabilities = getCapabilities();
	setCapabilities({ ...capabilities, images: "kitty" });
	let options: FocusOptions = { enabled: true, thinking: false };
	const dispose = installFocusAdapter({
		getOptions: () => options,
		onUnsupportedLayout: assert.fail,
	});
	try {
		// No renderer definition, as with a disconnected MCP tool in a resumed session.
		const tool = new ToolExecutionComponent(
			"mcp_example",
			"call-1",
			{ path: "hidden.txt" },
			{},
			undefined,
			tui,
			process.cwd(),
		);
		tool.updateResult({
			content: [
				{ type: "text", text: "private tool output" },
				{
					type: "image",
					mimeType: "image/png",
					data: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEX/AAAZ4gk3AAAADElEQVQI12NgIA0AAAAwAAHHqoWOAAAAAElFTkSuQmCC",
				},
			],
			isError: false,
		});
		assert.deepEqual(tool.render(80), []);
		options = { ...options, enabled: false };
		const normal = tool.render(80);
		assert.ok(normal.join("\n").includes("private tool output"));
		assert.ok(
			normal.join("\n").includes("\x1b_G"),
			"native image output must exist outside focus mode",
		);
		options = { ...options, enabled: true };
		assert.deepEqual(tool.render(80), []);
		dispose();
		assert.deepEqual(tool.render(80), normal);
	} finally {
		dispose();
		setCapabilities(capabilities);
	}
});

test("thinking filtering preserves native replies, messages, child identity, and collapsed thinking", () => {
	const source = message([
		{ type: "thinking", thinking: "hidden reasoning" },
		{ type: "text", text: "**Visible reply** with 中文 and 🙂" },
	]);
	const before = structuredClone(source);
	const assistant = new AssistantMessageComponent(source);
	const content = assistant.children[0];
	assert.ok(content instanceof Container);
	const children = content.children;
	const normal = assistant.render(80);
	let options: FocusOptions = { enabled: true, thinking: false };
	const dispose = installFocusAdapter({
		getOptions: () => options,
		onUnsupportedLayout: assert.fail,
	});
	try {
		const focused = assistant.render(80).join("\n");
		assert.ok(focused.includes("Visible reply"));
		assert.ok(!focused.includes("hidden reasoning"));
		assert.ok(focused.includes("\x1b]133;A"), "preserve native reply markers");
		assert.equal(content.children, children);
		assert.deepEqual(source, before);
		assert.ok(assistant.render(24).join("\n").includes("Visible reply"));
		assistant.setHideThinkingBlock(true);
		assert.ok(!assistant.render(80).join("\n").includes("Thinking..."));
		options = { ...options, thinking: true };
		assert.ok(assistant.render(80).join("\n").includes("Thinking..."));
		assistant.setHideThinkingBlock(false);
		assert.deepEqual(assistant.render(80), normal);
		assistant.invalidate();
		options = { ...options, thinking: false };
		assert.ok(!assistant.render(80).join("\n").includes("hidden reasoning"));
		options = { ...options, enabled: false };
		assert.deepEqual(assistant.render(80), normal);
	} finally {
		dispose();
	}
});

test("thinking-only messages produce no blank rows; failures remain visible; cleanup is idempotent", () => {
	const options = { enabled: true, thinking: false };
	const original = AssistantMessageComponent.prototype.render;
	const dispose = installFocusAdapter({
		getOptions: () => options,
		onUnsupportedLayout: assert.fail,
	});
	try {
		const thinkingOnly = new AssistantMessageComponent(
			message([{ type: "thinking", thinking: "thinking only" }]),
		);
		assert.deepEqual(thinkingOnly.render(80), []);
		const failed = new AssistantMessageComponent({
			...message([]),
			stopReason: "error",
			errorMessage: "provider unavailable",
		});
		assert.ok(failed.render(80).join("\n").includes("provider unavailable"));
		const aborted = new AssistantMessageComponent({
			...message([]),
			stopReason: "aborted",
		});
		assert.ok(aborted.render(80).join("\n").includes("Operation aborted"));
		dispose();
		dispose();
		assert.equal(AssistantMessageComponent.prototype.render, original);
	} finally {
		dispose();
	}
});

test("an unexpected assistant layout falls back to native rendering without hiding replies", () => {
	const assistant = new AssistantMessageComponent(
		message([{ type: "text", text: "Visible reply" }]),
	);
	assistant.addChild(new Text("Additional native component", 0, 0));
	const normal = assistant.render(80);
	let options: FocusOptions = { enabled: true, thinking: false };
	let warnings = 0;
	const dispose = installFocusAdapter({
		getOptions: () => options,
		onUnsupportedLayout: () => {
			warnings++;
			options = { ...options, enabled: false };
		},
	});
	try {
		assert.deepEqual(assistant.render(80), normal);
		assert.deepEqual(assistant.render(80), normal);
		assert.equal(warnings, 1);
	} finally {
		dispose();
	}
});
