import { createStashPicker } from "./picker.ts";
import { piKit } from "./pi-kit.ts";
import { createShortcutDialog } from "./shortcut-dialog.ts";
import type { StashUi } from "./extension.ts";
import type { KeyId } from "@earendil-works/pi-tui";

export const piUi: StashUi = {
	pickStash: (ctx, { stashes, onDelete }) => ctx.ui.custom<number | undefined>((tui, theme, _kb, done) => createStashPicker({
		stashes,
		kit: piKit,
		theme,
		getHeight: () => tui.terminal.rows - 2,
		requestRender: () => tui.requestRender(),
		onDelete,
		done,
	}), { overlay: true, overlayOptions: { width: 100, margin: 1 } }),

	askShortcut: (ctx, { initialValue }) => ctx.ui.custom<KeyId | undefined>(
		(tui, theme, keybindings, done) => createShortcutDialog({
			initialValue,
			theme, keybindings, done,
			getHeight: () => tui.terminal.rows - 2,
			requestRender: () => tui.requestRender(),
		}),
		{ overlay: true, overlayOptions: { width: 62, margin: 1 } },
	),
};
