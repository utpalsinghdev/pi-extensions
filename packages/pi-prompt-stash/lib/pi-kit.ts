import { matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { TextKit } from "./text-kit.ts";

export const piKit: TextKit = { truncateToWidth, visibleWidth, wrapTextWithAnsi, stripTerminalSequences, matchesKey };
