import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface DialogOptions {
	theme: Theme;
	width: number;
	title: string;
	position?: string;
	body: string[];
	footer: string[];
}

// Shared native-style frame. Padding also keeps underlying transcript text out of the overlay.
export function renderDialog({ theme, width, title, position, body, footer }: DialogOptions): string[] {
	const contentWidth = Math.max(1, width - 4);
	const labelWidth = position ? Math.max(1, contentWidth - visibleWidth(position) - 1) : contentWidth;
	const label = truncateToWidth(title, labelWidth, "…");
	const heading = theme.bold(label) + (position
		? " ".repeat(Math.max(1, contentWidth - visibleWidth(label) - visibleWidth(position))) + theme.fg("dim", position)
		: "");
	const border = theme.fg("dim", "─".repeat(width));
	return [
		border,
		`  ${heading}`,
		"",
		...body.map((line) => `  ${line}`),
		"",
		...footer.map((line) => `  ${line}`),
		border,
	].map((line) => truncateToWidth(line, width, "…", true));
}
