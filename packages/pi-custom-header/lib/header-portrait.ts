import { visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderPortraitFrame } from "./types.ts";

const openPortrait = [
	"⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣷⢸⣿⣿⡜⢯⣷⡌⡻⣿⣿⣿⣆⢈⠻⠿⢿⣿⣿⣿⣿⣿⣿⣷⣦⣤⣀",
	"⠀⠀⠀⡁⢳⣿⣿⣿⣿⣿⣿⡜⣿⣿⣧⢀⢻⣷⠰⠈⢿⣿⣿⣧⢣⠉⠑⠪⢙⠿⠿⠿⠿⠿⠿⠿⠋⠁",
	"⠀⢀⣱⡇⡞⣿⣿⣿⣿⣿⣿⡇⣿⣿⡏⡄⣧⠹⡇⠧⠈⢻⣿⣿⡇⢧⢢⠀⠀⠑",
	"⠀⢸⣿⣇⢃⢿⣿⣿⣿⣿⣿⣷⣿⣿⠇⢃⣡⣤⡹⠐⣿⣀⢻⣿⣿⢸⡎⠳⡄",
	"⠈⣾⣿⣿⠘⡸⣿⣿⣿⣿⣿⣿⣿⡿⣰⣿⣿⢟⡷⠈⠋⠃⠎⢿⣿⡏⣿⠀⠘⢆",
	"⡐⢹⣿⣿⡐⢡⢹⣿⣿⣿⣿⡏⣿⢣⣿⣿⡑⠁⠔⠀⠉⠉⠢⡘⣿⡇⣿⡇⠀⡀⠡⡀",
	"⡇⠘⣿⣿⣇⠇⢣⢻⣿⣿⣿⡇⢇⣾⣿⣿⡆⢸⣤⡀⠚⢂⠀⢡⢿⡇⣿⡇⠀⢿⠀⠀⠄",
	"⣿⠠⠹⣿⣿⡘⣆⢣⠻⣿⣿⢈⣾⣿⣿⣿⣶⣸⣏⢀⣬⣋⡼⣠⢸⢹⣿⡇⢠⣼⠙⡄",
	"⢹⡇⠁⠹⣿⣇⠹⡃⠃⠙⡇⠘⢿⣿⣿⣿⣿⣿⣏⣓⣉⣭⣴⣿⠘⢸⣿⠁⠘⠋⠀⠹⠄",
	"⠈⢷⠀⠀⠈⢿⣇⠂⣷⠄⠐⠀⠘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢠⢸⡏⠀⢀⣠⣴⣾⣿⣶⣄",
	"⠀⠈⢆⠀⠀⠀⠙⠆⠈⠢⠲⠥⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡞⣸⠁⠀⢸⣿⣿⣿⣿⣿⣿⡆",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠄⠃⠀⠀⠘⣿⣿⣿⣿⣿⣿⣿",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⡏⠹⣿⣿⡿⠫⠊⠀⠀⠀⣶⠀⢻⣿⣿⣿⣿⡿⡇",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠛⠻⠿⠿⠿⢋⠀⠀⠀⠀⢀⣼⣿⡆⠈⣿⣿⣿⡟⣱⡷",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢁⣁⡀⠨⣛⠿⠶⠄⢀⣠⣾⣿⣿⣷⠀⢹⣿⡟⣴⠈⢃⣶⠔",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⣿⣿⡄⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠈⣿⣿⡿⠀⡀⣿⣷",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢙⠻⣿⣿⢀⠙⠻⠿⣿⣿⣿⣿⣿⣿⡇⠁⣿⠟⡀⠈⣧⢰⣿⠆",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠿⠴⠮⣥⠻⢧⣤⣄⣀⡉⢩⣭⣍⣃⣀⣩⠎⢀⣼⠉⣼⡯",
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠁⣛⠓⢒⣒⣢⡭⢁⡈⠿⠿⠟⠹⠛⠁⠀⠀⠀⠰⠃⠂",
];

// Patch both eyes, including the exposed sliver beneath the bangs.
function withEyes(patches: readonly (readonly [row: number, column: number, cells: string])[]): string[] {
	return openPortrait.map((line, row) =>
		patches.reduce(
			(result, [patchRow, column, cells]) =>
				patchRow === row ? result.slice(0, column) + cells + result.slice(column + cells.length) : result,
			line,
		),
	);
}

export const HEADER_PORTRAIT: Readonly<Record<HeaderPortraitFrame, readonly string[]>> = {
	open: openPortrait,
	quarter: withEyes([
		[5, 17, "⠻⣿⣿⣿⣿⡿⡛"],
		[6, 17, "⢸⣤⡉⠉⢁⠀⢡"],
		[8, 7, "⣃⢧⣽⡇⠘"],
		[9, 7, "⠂⣷⠄⠈⠂"],
	]),
	half: withEyes([
		[5, 17, "⣿⣿⣿⣿⣿⣿⡟"],
		[6, 17, "⢨⣛⠿⠿⢟⠋⢠"],
		[8, 7, "⣃⣧⣽⡇⠘"],
		[9, 7, "⠉⣭⠍⠛⠦"],
	]),
	threeQuarter: withEyes([
		[5, 17, "⣿⣿⣿⣿⣿⣿⡟"],
		[6, 17, "⠻⣿⣿⣿⣿⡿⢣"],
		[7, 17, "⣸⣆⢉⣭⣁⡼⣠"],
		[8, 7, "⣃⣧⣽⡇⠘"],
		[9, 7, "⠉⡻⠿⠿⠦"],
	]),
	closed: withEyes([
		[5, 17, "⣿⣿⣿⣿⣿⣿⡟"],
		[6, 17, "⣿⣿⣿⣿⣿⣿⣧"],
		[7, 17, "⣮⣛⠿⠿⢟⣫⣦"],
		[8, 7, "⣃⣧⣽⡇⠘"],
		[8, 17, "⣿⣿⣿⣿⣿⣿⣿"],
		[9, 7, "⢝⢿⣿⣿⡦"],
		[10, 7, "⠎⠳⠶⠶⠮"],
	]),
};

export const HEADER_PORTRAIT_WIDTH = Math.max(...openPortrait.map(visibleWidth));
export const HEADER_PORTRAIT_MIN_WIDTH = HEADER_PORTRAIT_WIDTH + 24;
