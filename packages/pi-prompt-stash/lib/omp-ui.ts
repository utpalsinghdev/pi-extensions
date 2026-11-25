import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { StashUi } from "./extension.ts";
import { ompKit } from "./omp-kit.ts";
import { createStashPicker } from "./picker.ts";
import { normalizeStashShortcut, type ShortcutId } from "./shortcut.ts";

// What omp passes to ctx.ui.custom factories in place of Pi's TUI object.
interface OmpUiHost {
	requestRender(): void;
	size(): { columns: number; rows: number };
}

type OmpShortcutConflict = { kind: "reserved" } | { kind: "keybinding"; keybindings: string[] } | { kind: "extension" };
type OmpApi = ExtensionAPI & { getShortcutConflict?: (shortcut: ShortcutId) => OmpShortcutConflict | undefined };

export const ompUi: StashUi = {
	pickStash: (ctx, { stashes, onDelete }) => ctx.ui.custom<number | undefined>((host, theme, _kb, done) => {
		const ui = host as unknown as OmpUiHost;
		return createStashPicker({
			stashes,
			kit: ompKit,
			theme,
			getHeight: () => ui.size().rows - 2,
			requestRender: () => ui.requestRender(),
			onDelete,
			done,
		});
	}, { overlay: true }),

	async askShortcut(ctx, { pi, initialValue }) {
		let message = "Type shortcut name, e.g. alt+s";
		for (;;) {
			const value = await ctx.ui.input(`Stash shortcut (current ${initialValue}). ${message}`, initialValue);
			if (value === undefined) return undefined;
			const shortcut = normalizeStashShortcut(value);
			if (!shortcut) {
				message = "Use Ctrl, Alt or Super with a key, or F1-F12.";
				continue;
			}
			const conflict = (pi as OmpApi).getShortcutConflict?.(shortcut);
			if (conflict?.kind === "reserved") {
				message = `${shortcut} is reserved by omp. Choose another shortcut.`;
				continue;
			}
			if (conflict?.kind === "keybinding") {
				message = `Already used by ${conflict.keybindings.join(", ")}. Choose another shortcut.`;
				continue;
			}
			return shortcut;
		}
	},
};
