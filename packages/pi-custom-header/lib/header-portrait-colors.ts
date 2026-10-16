import { parseColor } from "@earendil-works/pi-tui";
import type { HeaderPortraitFrame, Theme } from "./types.ts";

const blushPink = parseColor("#f98bab");

const palette = {
	hair: parseColor("#c4aff6"),
	skin: parseColor("#ffd5ba"),
	eye: parseColor("#f8f4ff"),
	dress: blushPink,
	blush: blushPink,
	blushEdge: parseColor("#ffb8bd"),
};

type PortraitPart = keyof typeof palette;
type ColumnRange = readonly [start: number, end: number];

const skinRanges: Readonly<Partial<Record<number, ColumnRange>>> = {
	4: [19, 23],
	5: [16, 24],
	6: [16, 24],
	7: [11, 25],
	8: [11, 25],
	9: [7, 25],
	10: [7, 25],
	11: [10, 24],
	12: [11, 23],
	13: [13, 23],
	14: [23, 29],
	15: [19, 29],
	16: [19, 28],
};

const hairRanges: Readonly<Partial<Record<number, ColumnRange>>> = {
	11: [25, 29],
	12: [24, 29],
	13: [25, 30],
	14: [29, 33],
	15: [29, 33],
	16: [28, 31],
	17: [29, 31],
};

const eyeStartRows: Readonly<Record<HeaderPortraitFrame, number>> = {
	open: 6,
	quarter: 6,
	half: 7,
	threeQuarter: 8,
	closed: 9,
};

function partAt(row: number, column: number, frame: HeaderPortraitFrame): PortraitPart {
	const blushStart = row === 9 ? 18 : row === 11 ? 12 : undefined;
	if (blushStart !== undefined && column >= blushStart && column < blushStart + 4) {
		return column === blushStart || column === blushStart + 3 ? "blushEdge" : "blush";
	}
	if (row >= eyeStartRows[frame] && row <= 7 && column >= 17 && column < 24) return "eye";
	if (frame === "open" && row === 9 && column === 8) return "eye";

	const skin = skinRanges[row];
	if (skin && column >= skin[0] && column < skin[1]) return "skin";
	const hair = hairRanges[row];
	if (hair && column >= hair[0] && column < hair[1]) return "hair";
	return row < 9 || (row <= 10 && column < 7) ? "hair" : "dress";
}

/** Color contiguous glyph runs without changing the portrait's dots or width. */
export function colorPortraitLine(theme: Theme, line: string, row: number, frame: HeaderPortraitFrame): string {
	let output = "";
	let run = "";
	let part = partAt(row, 0, frame);
	for (const [column, glyph] of [...line].entries()) {
		const next = partAt(row, column, frame);
		if (next !== part) {
			if (run) output += theme.style(run, { fg: palette[part] });
			run = "";
			part = next;
		}
		run += glyph;
	}
	return output + (run ? theme.style(run, { fg: palette[part] }) : "");
}
