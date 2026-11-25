import { decodeKey } from "@oh-my-pi/pi-tui/driver/input/keys";
import { stripControl } from "@oh-my-pi/pi-tui/text/sanitize";
import { truncate, visibleWidth, wrap } from "@oh-my-pi/pi-tui/text/width";
import type { TextKit } from "./text-kit.ts";

export const ompKit: TextKit = {
	truncateToWidth: truncate,
	visibleWidth,
	wrapTextWithAnsi: wrap,
	stripTerminalSequences: (text) => stripControl(text),
	matchesKey(data, key) {
		const event = decodeKey(data, { kitty: true, backspaceIsCtrl: false });
		return event !== null && event.kind !== "release" && event.id === key;
	},
};
