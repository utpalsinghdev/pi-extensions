import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderDialog } from "./dialog.ts";
import type { StashEntry } from "./store.ts";
import type { StashView, TextKit } from "./text-kit.ts";

interface PickerOptions {
	stashes: StashEntry[];
	kit: TextKit;
	theme: Theme;
	getHeight: () => number;
	requestRender: () => void;
	onDelete: (id: number) => boolean;
	done: (id: number | undefined) => void;
}

function preview(kit: TextKit, text: string): string {
	// Preserve prompt layout without letting pasted terminal controls execute.
	return kit.stripTerminalSequences(text)
		.replace(/\r\n?/g, "\n")
		.replace(/\t/g, "  ")
		.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
		.trim();
}

function clippedPreview(kit: TextKit, lines: string[], height: number, width: number): string[] {
	const visible = lines.slice(0, height);
	if (lines.length > height && visible.length) {
		const last = visible.length - 1;
		visible[last] = `${kit.truncateToWidth(visible[last] ?? "", Math.max(1, width - 2), "")} …`;
	}
	return visible;
}

export function createStashPicker(options: PickerOptions): StashView {
	const { kit, theme, done } = options;
	const { truncateToWidth, wrapTextWithAnsi, matchesKey } = kit;
	let entries = [...options.stashes].reverse();
	let index = 0;
	let error = "";

	function listRows(width: number, height: number): string[] {
		const start = Math.max(0, Math.min(index - Math.floor(height / 2), entries.length - height));
		return entries.slice(start, start + height).map((entry, offset) => {
			const title = preview(kit, entry.text).split("\n").find((line) => line.trim()) ?? "(Empty prompt)";
			const selected = start + offset === index;
			const row = truncateToWidth(`${selected ? "> " : "  "}${title}`, width, "…", true);
			return selected ? theme.fg("accent", theme.bold(row)) : theme.fg("text", row);
		});
	}

	return {
		render(width) {
			const contentWidth = Math.max(1, width - 4);
			const help = "↑↓ select  Enter load  d delete  Esc close";
			const footer = [
				...(error ? wrapTextWithAnsi(theme.fg("error", error), contentWidth) : []),
				...wrapTextWithAnsi(theme.fg("dim", help), contentWidth),
			];
			const maxBodyRows = Math.max(1, Math.min(16, options.getHeight() - 5 - footer.length));
			const text = preview(kit, entries[index]?.text ?? "");
			let body: string[];

			if (contentWidth >= 68) {
				const listWidth = Math.min(32, Math.floor(contentWidth * 0.35));
				const previewWidth = contentWidth - listWidth - 3;
				const fullPreview = wrapTextWithAnsi(text, previewWidth);
				const height = Math.min(maxBodyRows, Math.max(8, Math.min(entries.length, 10)));
				const rows = listRows(listWidth, height);
				const detail = clippedPreview(kit, fullPreview, height, previewWidth);
				body = Array.from({ length: height }, (_, row) =>
					(rows[row] ?? " ".repeat(listWidth)) + theme.fg("dim", " │ ") + theme.fg("text", detail[row] ?? ""));
			} else {
				const listHeight = Math.min(entries.length, 5, Math.max(1, Math.floor((maxBodyRows - 1) / 3)));
				const rows = listRows(contentWidth, listHeight);
				const previewHeight = Math.max(0, Math.min(8, maxBodyRows - rows.length - 1));
				const detail = clippedPreview(kit, wrapTextWithAnsi(text, contentWidth), previewHeight, contentWidth);
				body = previewHeight > 0 ? [
					...rows,
					theme.fg("dim", "─".repeat(contentWidth)),
					...Array.from({ length: previewHeight }, (_, row) => theme.fg("text", detail[row] ?? "")),
				] : rows;
			}

			return renderDialog({
				kit, theme, width, title: "Stashed prompts",
				position: `${index + 1}/${entries.length}`,
				body, footer,
			});
		},
		invalidate() {},
		handleInput(data) {
			if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
				done(undefined);
				return;
			}
			if (matchesKey(data, "enter")) {
				done(entries[index]?.id);
				return;
			}
			error = "";
			if (matchesKey(data, "up")) index = Math.max(0, index - 1);
			if (matchesKey(data, "down")) index = Math.min(entries.length - 1, index + 1);
			if (data === "D" || matchesKey(data, "d")) {
				const selected = entries[index];
				if (selected && options.onDelete(selected.id)) {
					entries = entries.filter((entry) => entry.id !== selected.id);
					if (entries.length === 0) {
						done(undefined);
						return;
					}
					index = Math.min(index, entries.length - 1);
				} else {
					error = "Could not delete prompt. Nothing changed.";
				}
			}
			options.requestRender();
		},
	};
}
