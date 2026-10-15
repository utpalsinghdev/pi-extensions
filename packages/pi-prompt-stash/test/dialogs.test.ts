import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
	createExtensionRuntime, ExtensionRunner, initTheme, ModelRegistry, ModelRuntime, SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER, KeybindingsManager, setKeybindings, stripTerminalSequences,
	TUI_KEYBINDINGS, visibleWidth,
} from "@earendil-works/pi-tui";
import { createStashPicker } from "../lib/picker.ts";
import { createShortcutDialog } from "../lib/shortcut-dialog.ts";
import type { StashEntry } from "../lib/store.ts";

const directory = mkdtempSync(join(tmpdir(), "pi-stash-dialogs-"));
after(() => rmSync(directory, { recursive: true, force: true }));
initTheme("dark", false);
const runtime = await ModelRuntime.create({
	authPath: join(directory, "auth.json"),
	modelsPath: null,
	modelsStorePath: join(directory, "models.json"),
	refreshOnCreate: false,
});
const theme = new ExtensionRunner(
	[], createExtensionRuntime(), directory, SessionManager.inMemory(directory), new ModelRegistry(runtime),
).getUIContext().theme;
const nativeKeys = new KeybindingsManager(TUI_KEYBINDINGS);
setKeybindings(nativeKeys);
const keybindings = {
	matches: nativeKeys.matches.bind(nativeKeys),
	getEffectiveConfig: () => ({ ...nativeKeys.getResolvedBindings(), "app.clear": "ctrl+c" as const }),
};
const text = (lines: string[]) => stripTerminalSequences(lines.join("\n"));
const stashes: StashEntry[] = [
	{ id: 1, text: "First prompt\nKeep indentation.\n  中文 🙂", timestamp: 0 },
	{ id: 2, text: "Second prompt\nA readable multiline preview.", timestamp: 1 },
];

test("picker shows split preview on wide terminals and stacked preview on narrow terminals", () => {
	const picker = createStashPicker({
		stashes, theme, getHeight: () => 30, requestRender() {}, onDelete: () => true, done() {},
	});
	const wide = text(picker.render(100));
	assert.ok(wide.includes("│"));
	assert.ok(wide.includes("1/2"));
	assert.ok(wide.indexOf("> Second prompt") < wide.indexOf("First prompt"));
	assert.ok(wide.includes("A readable multiline preview."));
	const initialHeight = picker.render(100).length;
	picker.handleInput?.("\x1b[B");
	assert.equal(picker.render(100).length, initialHeight, "selection must not resize the popup");
	picker.handleInput?.("\x1b[A");
	const narrow = text(picker.render(40));
	assert.ok(!narrow.includes("│"));
	assert.ok(narrow.includes("A readable multiline preview."));
});

test("picker fits resize, Unicode, many entries and long previews into the available rows and columns", () => {
	let height = 38;
	const picker = createStashPicker({
		stashes: Array.from({ length: 40 }, (_, index) => ({
			id: index + 1, text: `Prompt ${index + 1}\n${"中文 🙂 ".repeat(100)}`, timestamp: index,
		})),
		theme, getHeight: () => height, requestRender() {}, onDelete: () => true, done() {},
	});
	for (height of [12, 18, 38]) {
		for (const width of [20, 32, 70, 72, 100]) {
			const lines = picker.render(width);
			assert.ok(lines.length <= height, `${width}x${height}: too many rows`);
			assert.ok(lines.every((line) => visibleWidth(line) <= width), `${width}x${height}: line overflow`);
		}
	}
	for (let i = 0; i < 50; i++) picker.handleInput?.("\x1b[B");
	assert.ok(text(picker.render(32)).includes("> Prompt 1"));
	assert.ok(text(picker.render(100)).includes("40/40"));
});

test("picker preview strips terminal commands without modifying the stored prompt", () => {
	const original = "Safe title\n\x1b]52;c;clipboard\x07\x1b[31mRed text\x1b[0m\n\tIndented";
	const entry = { id: 1, text: original, timestamp: 0 };
	const picker = createStashPicker({
		stashes: [entry], theme, getHeight: () => 30, requestRender() {}, onDelete: () => true, done() {},
	});
	const output = picker.render(100).join("\n");
	assert.ok(!output.includes("clipboard"));
	assert.ok(!output.includes("\x07"));
	assert.ok(text(picker.render(100)).includes("Red text"));
	assert.equal(entry.text, original);
});

test("picker keeps failed deletions selected, then deletes and loads the correct remaining prompt", () => {
	let allowDelete = false;
	let selected: number | undefined;
	const deleted: number[] = [];
	const picker = createStashPicker({
		stashes, theme, getHeight: () => 30, requestRender() {},
		onDelete(id) { if (allowDelete) deleted.push(id); return allowDelete; },
		done(id) { selected = id; },
	});
	picker.handleInput?.("d");
	assert.ok(text(picker.render(100)).includes("Could not delete prompt"));
	assert.ok(text(picker.render(100)).includes("1/2"));
	allowDelete = true;
	picker.handleInput?.("\x1b[100u");
	assert.deepEqual(deleted, [2], "delete also works with Kitty printable key encoding");
	assert.ok(!text(picker.render(100)).includes("Could not delete prompt"));
	picker.handleInput?.("\r");
	assert.equal(selected, 1);
	assert.equal(stashes.length, 2, "picker must not mutate storage input");
});

test("shortcut dialog preserves native input cursor and focus across resize", () => {
	const dialog = createShortcutDialog({
		initialValue: "ctrl+shift+s", theme, keybindings, getHeight: () => 30, requestRender() {}, done() {},
	});
	dialog.focused = true;
	dialog.handleInput?.("+x");
	for (const width of [20, 32, 62]) {
		const lines = dialog.render(width);
		assert.ok(lines.some((line) => line.includes(CURSOR_MARKER)), "keep IME cursor marker");
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
		assert.ok(lines.length <= 30);
	}
	assert.ok(text(dialog.render(62)).includes("ctrl+shift+s+x"), "prefill cursor starts at the end");
});

test("shortcut dialog validates inline, preserves rejected input and submits a normalized free shortcut", () => {
	const results: (string | undefined)[] = [];
	const dialog = createShortcutDialog({
		initialValue: "ctrl+shift+s", theme, keybindings, getHeight: () => 30, requestRender() {},
		done(shortcut) { results.push(shortcut); },
	});
	dialog.focused = true;
	dialog.handleInput?.("\x15");
	dialog.handleInput?.("s");
	dialog.handleInput?.("\r");
	assert.ok(text(dialog.render(62)).includes("Use Ctrl, Alt or Super"));
	assert.ok(text(dialog.render(62)).includes("> s"));
	assert.equal(results.length, 0);
	dialog.handleInput?.("\x15");
	dialog.handleInput?.("ctrl+c");
	dialog.handleInput?.("\r");
	assert.ok(text(dialog.render(62)).includes("Already used by"));
	assert.equal(results.length, 0);
	assert.equal(dialog.focused, true);
	dialog.handleInput?.("\x15");
	dialog.handleInput?.("ALT + S");
	dialog.handleInput?.("\r");
	assert.deepEqual(results, ["alt+s"]);
});

test("shortcut errors remain within narrow, short dialog bounds; Escape cancels without saving", () => {
	const results: (string | undefined)[] = [];
	const dialog = createShortcutDialog({
		initialValue: "ctrl+c", theme, keybindings, getHeight: () => 12, requestRender() {},
		done(shortcut) { results.push(shortcut); },
	});
	dialog.handleInput?.("\r");
	const lines = dialog.render(30);
	assert.ok(lines.length <= 12);
	assert.ok(lines.every((line) => visibleWidth(line) <= 30));
	dialog.handleInput?.("\x1b");
	assert.deepEqual(results, [undefined]);
});
