import { keyHint, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, Input, type KeyId, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { renderDialog } from "./dialog.ts";
import { normalizeStashShortcut, stashShortcutConflict } from "./shortcut.ts";

interface ShortcutDialogOptions {
	initialValue: KeyId;
	theme: Theme;
	keybindings: Pick<KeybindingsManager, "matches" | "getEffectiveConfig">;
	getHeight: () => number;
	requestRender: () => void;
	done: (shortcut: KeyId | undefined) => void;
}

export function createShortcutDialog(options: ShortcutDialogOptions): Component & Focusable {
	const { theme, keybindings, done } = options;
	const input = new Input();
	// Native Input.setValue keeps its old cursor position. Insertion leaves it at the end.
	input.handleInput(options.initialValue);
	let error = "";

	return {
		get focused() { return input.focused; },
		set focused(value: boolean) { input.focused = value; },
		render(width) {
			const contentWidth = Math.max(1, width - 4);
			const footer = wrapTextWithAnsi(
				theme.fg("dim", `${keyHint("tui.select.confirm", "save")}  ${keyHint("tui.select.cancel", "cancel")}`),
				contentWidth,
			);
			const maxBodyRows = Math.max(1, options.getHeight() - 5 - footer.length);
			const status = wrapTextWithAnsi(
				theme.fg(error ? "error" : "dim", error || "Type shortcut name, e.g. alt+s"),
				contentWidth,
			);
			const statusHeight = Math.min(3, Math.max(0, maxBodyRows - 2));
			const body = [
				...input.render(contentWidth),
				...(statusHeight ? ["", ...status.slice(0, statusHeight)] : []),
			];
			return renderDialog({ theme, width, title: "Stash shortcut", body, footer });
		},
		invalidate() { input.invalidate(); },
		handleInput(data) {
			if (keybindings.matches(data, "tui.select.cancel")) {
				done(undefined);
				return;
			}
			if (keybindings.matches(data, "tui.select.confirm") || data === "\n") {
				const shortcut = normalizeStashShortcut(input.getValue());
				const conflict = shortcut ? stashShortcutConflict(shortcut, keybindings) : undefined;
				if (!shortcut) {
					error = "Use Ctrl, Alt or Super with a key, or F1-F12.";
				} else if (conflict) {
					error = `Already used by ${conflict}. Choose another shortcut.`;
				} else {
					done(shortcut);
					return;
				}
			} else {
				input.handleInput(data);
				error = "";
			}
			options.requestRender();
		},
		handleMouse(event) {
			if (event.y !== 3) return;
			const result = input.handleMouse({ ...event, x: event.x - 2, y: 0 });
			if (result) options.requestRender();
			return result;
		},
	};
}
