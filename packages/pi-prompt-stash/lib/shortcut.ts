import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

export const DEFAULT_STASH_SHORTCUT: KeyId = "ctrl+shift+s";

const MODIFIERS = ["ctrl", "alt", "shift", "super"];
const SPECIAL_KEYS = new Set([
	"escape",
	"enter",
	"tab",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
]);

// Editor-global actions only. Picker-local bindings such as Ctrl+S do not conflict.
const GLOBAL_APP_ACTIONS = new Set([
	"app.interrupt",
	"app.clear",
	"app.exit",
	"app.suspend",
	"app.thinking.cycle",
	"app.model.cycleForward",
	"app.model.cycleBackward",
	"app.model.select",
	"app.tools.expand",
	"app.thinking.toggle",
	"app.editor.external",
	"app.message.copy",
	"app.message.followUp",
	"app.message.dequeue",
	"app.clipboard.pasteImage",
	"app.session.new",
	"app.session.tree",
	"app.session.fork",
	"app.session.resume",
	"tui.select.confirm",
	"tui.select.cancel",
]);

export function normalizeStashShortcut(value: unknown): KeyId | undefined {
	if (typeof value !== "string") return undefined;
	const parts = value.toLowerCase().replace(/\s+/g, "").split("+");
	let key = parts.pop();
	if (!key) return undefined;
	if (key === "esc") key = "escape";
	if (key === "return") key = "enter";
	if (parts.some((part) => !MODIFIERS.includes(part)) || new Set(parts).size !== parts.length) {
		return undefined;
	}
	const functionKey = /^f([1-9]|1[0-2])$/.test(key);
	const singleKey = key.length === 1 && /[a-z0-9`\-=[\]\\;',./!@#$%^&*()_|~{}:<>?]/.test(key);
	if (!singleKey && !functionKey && !SPECIAL_KEYS.has(key)) return undefined;
	// Do not let a shortcut swallow ordinary typing or navigation without a modifier.
	if (!functionKey && !parts.some((part) => part === "ctrl" || part === "alt" || part === "super")) {
		return undefined;
	}
	if (key === "pageup") key = "pageUp";
	if (key === "pagedown") key = "pageDown";
	const normalized = [...MODIFIERS.filter((part) => parts.includes(part)), key].join("+");
	// All keys and modifiers have been validated against Pi's KeyId syntax above.
	return normalized as KeyId;
}

export function stashShortcutConflict(shortcut: KeyId, keybindings: Pick<KeybindingsManager, "getEffectiveConfig">): string | undefined {
	for (const [action, keys] of Object.entries(keybindings.getEffectiveConfig())) {
		if (!action.startsWith("tui.editor.") && !action.startsWith("tui.input.") && !GLOBAL_APP_ACTIONS.has(action)) {
			continue;
		}
		const bindings = Array.isArray(keys) ? keys : [keys];
		if (bindings.some((key) => normalizeStashShortcut(key) === shortcut)) return action;
	}
	return undefined;
}
