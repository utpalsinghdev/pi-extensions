import assert from "node:assert/strict";
import { test } from "node:test";
import type { KeyId } from "@earendil-works/pi-tui";
import { DEFAULT_STASH_SHORTCUT, normalizeStashShortcut, stashShortcutConflict } from "../lib/shortcut.ts";

test("shortcut normalization handles case, whitespace, modifier order and key aliases", () => {
	const cases: [string, KeyId][] = [
		[" Ctrl + Shift + S ", DEFAULT_STASH_SHORTCUT],
		["shift+ALT+ctrl+s", "ctrl+alt+shift+s"],
		["alt+Esc", "alt+escape"],
		["super+Return", "super+enter"],
		["ctrl+pageup", "ctrl+pageUp"],
		["ctrl+pagedown", "ctrl+pageDown"],
		["F12", "f12"],
		["alt+/", "alt+/"],
	];
	for (const [input, expected] of cases) assert.equal(normalizeStashShortcut(input), expected);
});

test("invalid shortcuts cannot swallow plain typing or navigation", () => {
	for (const input of [undefined, null, 1, "", "s", "shift+s", "enter", "up", "ctrl+ctrl+s", "meta+s", "ctrl+", "ctrl+nope", "f13"]) {
		assert.equal(normalizeStashShortcut(input), undefined, String(input));
	}
});

test("conflict detection covers editor, input and global actions, but not picker-local bindings", () => {
	const keybindings = {
		getEffectiveConfig: () => ({
			"tui.editor.cursorLeft": "ctrl+b",
			"tui.input.deleteToEnd": ["ctrl+k", "alt+k"],
			"app.session.new": "alt+n",
			"app.clear": undefined,
			"app.models.favorite": "ctrl+s",
		} satisfies Record<string, KeyId | KeyId[] | undefined>),
	};
	assert.equal(stashShortcutConflict("ctrl+b", keybindings), "tui.editor.cursorLeft");
	assert.equal(stashShortcutConflict("alt+k", keybindings), "tui.input.deleteToEnd");
	assert.equal(stashShortcutConflict("alt+n", keybindings), "app.session.new");
	assert.equal(stashShortcutConflict("ctrl+s", keybindings), undefined);
	assert.equal(stashShortcutConflict(DEFAULT_STASH_SHORTCUT, keybindings), undefined);
});
