import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { HEADER_PORTRAIT, HEADER_PORTRAIT_MIN_WIDTH, HEADER_PORTRAIT_WIDTH } from "./header-portrait.ts";
import { colorPortraitLine } from "./header-portrait-colors.ts";
import { buildWorkspaceLines, cleanText } from "./header-workspace.ts";
import type { HeaderDetails, HeaderPortraitFrame, HeaderWorkspace, Theme } from "./types.ts";

export function buildHeader({
	theme,
	details,
	workspace,
	width,
	frame = "open",
	now = new Date(),
}: {
	theme: Theme;
	details: HeaderDetails;
	workspace: HeaderWorkspace;
	width: number;
	frame?: HeaderPortraitFrame;
	now?: Date;
}): string[] {
	const twoColumn = width >= HEADER_PORTRAIT_MIN_WIDTH;
	const infoWidth = twoColumn ? width - HEADER_PORTRAIT_WIDTH - 3 : width;
	const label = (text: string) => theme.fg("dim", text);
	const value = (text: string) => theme.fg("accent", cleanText(text));
	const infoLines = [
		theme.bold(value("Pi")) + label(` v${VERSION}`),
		`${label("Session:")} ${value(details.sessionId)}`,
		`${label("Model:")} ${value(details.model)}`,
		`${label("Provider:")} ${value(details.provider)}`,
		`${label("Thinking:")} ${value(details.thinking)}`,
		`${label("Tools:")} ${value(String(details.tools))}`,
		`${label("Commands:")} ${value(String(details.commands))}`,
		`${label("Theme:")} ${value(theme.name ?? "custom")}`,
		`${label("Today:")} ${value(now.toLocaleString())}`,
		...buildWorkspaceLines(theme, workspace, infoWidth, now.getTime()),
	];
	const separator = theme.fg("dim", "│");
	const lines = twoColumn
		? ["", ...HEADER_PORTRAIT[frame].map((line, index) => {
			const left = colorPortraitLine(theme, line.padEnd(HEADER_PORTRAIT_WIDTH), index, frame);
			return `${left} ${separator} ${infoLines[index] ?? ""}`;
		})]
		: ["", ...infoLines];

	return lines.map((line) => truncateToWidth(line, Math.max(0, width)));
}
