import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { createStashPicker } from "../lib/picker.ts";
import { createShortcutDialog } from "../lib/shortcut-dialog.ts";
import { loadState, saveState, type StashState } from "../lib/store.ts";

export default function promptStashExtension(pi: ExtensionAPI) {
	const file = join(getAgentDir(), "prompt-stash.json");
	let state = loadState(file);
	const activeShortcut = state.shortcut;

	function updateWidget(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWidget("prompt-stash", state.stashes.length ? [
			ctx.ui.theme.fg("accent", `${state.stashes.length} stashed • /stash to manage`),
		] : undefined);
	}

	// Commit memory and UI changes only after the file has been saved.
	function persist(nextState: StashState, ctx: ExtensionContext): boolean {
		try {
			saveState(file, nextState);
		} catch {
			ctx.ui.notify("Could not save prompt stash. Nothing was changed.", "error");
			return false;
		}
		state = nextState;
		updateWidget(ctx);
		return true;
	}

	pi.on("session_start", (_event, ctx) => {
		state = loadState(file);
		updateWidget(ctx);
	});

	pi.registerShortcut(activeShortcut, {
		description: "Stash current prompt",
		handler: async (ctx) => {
			const text = ctx.ui.getEditorText();
			if (!text.trim()) {
				ctx.ui.notify("Nothing to stash. Editor is empty.", "warning");
				return;
			}
			const entry = { id: state.nextId, text, timestamp: Date.now() };
			if (!persist({ ...state, stashes: [...state.stashes, entry], nextId: state.nextId + 1 }, ctx)) return;
			ctx.ui.setEditorText("");
			ctx.ui.notify(`Stashed prompt #${entry.id}`, "info");
		},
	});

	pi.registerCommand("stash", {
		description: "Manage stashed prompts or change the stash shortcut",
		getArgumentCompletions: (prefix) => {
			if (prefix === "clear" || prefix === "shortcut") return null;
			const items = [
				{ value: "clear", label: "clear", description: "Delete all stashed prompts" },
				{ value: "shortcut", label: "shortcut", description: "Change the stash shortcut" },
			].filter((item) => item.value.startsWith(prefix));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "shortcut") {
				if (ctx.mode !== "tui") {
					ctx.ui.notify("/stash shortcut requires interactive mode", "error");
					return;
				}
				if (!ctx.isIdle()) {
					ctx.ui.notify("Wait for the current response to finish before changing the shortcut", "warning");
					return;
				}

				const shortcut = await ctx.ui.custom<KeyId | undefined>(
					(tui, theme, keybindings, done) => createShortcutDialog({
						initialValue: activeShortcut,
						theme, keybindings, done,
						getHeight: () => tui.terminal.rows - 2,
						requestRender: () => tui.requestRender(),
					}),
					{ overlay: true, overlayOptions: { width: 62, margin: 1 } },
				);
				if (!shortcut || shortcut === activeShortcut) return;
				if (!persist({ ...state, shortcut }, ctx)) return;
				ctx.ui.notify(`Saved stash shortcut: ${shortcut}. Reloading to apply.`, "info");
				await ctx.reload();
				return;
			}
			if (action === "clear") {
				const count = state.stashes.length;
				if (!persist({ ...state, stashes: [], nextId: 1 }, ctx)) return;
				ctx.ui.notify(`Cleared ${count} stashed prompt(s)`, "info");
				return;
			}
			if (state.stashes.length === 0) {
				ctx.ui.notify(`No stashed prompts. Write something and press ${activeShortcut} to stash. Change it with /stash shortcut.`, "info");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/stash requires interactive mode", "error");
				return;
			}

			const id = await ctx.ui.custom<number | undefined>((tui, theme, _kb, done) => createStashPicker({
				stashes: state.stashes,
				theme,
				getHeight: () => tui.terminal.rows - 2,
				requestRender: () => tui.requestRender(),
				onDelete: (id) => persist({ ...state, stashes: state.stashes.filter((entry) => entry.id !== id) }, ctx),
				done,
			}), { overlay: true, overlayOptions: { width: 100, margin: 1 } });
			const entry = state.stashes.find((entry) => entry.id === id);
			if (entry) {
				ctx.ui.setEditorText(entry.text);
				ctx.ui.notify(`Loaded prompt #${entry.id} into editor`, "info");
			}
		},
	});
}
