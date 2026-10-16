import { type Component, stripTerminalSequences, type TUI } from "@earendil-works/pi-tui";
import { buildHeader } from "./header.ts";
import { HEADER_PORTRAIT, HEADER_PORTRAIT_MIN_WIDTH } from "./header-portrait.ts";
import type { HeaderDetails, HeaderPortraitFrame, HeaderWorkspace, Theme } from "./types.ts";

const blinkFrames: readonly { frame: HeaderPortraitFrame; delay: number }[] = [
	{ frame: "open", delay: 0 },
	{ frame: "quarter", delay: 30 },
	{ frame: "half", delay: 30 },
	{ frame: "threeQuarter", delay: 30 },
	{ frame: "closed", delay: 80 },
	{ frame: "threeQuarter", delay: 35 },
	{ frame: "half", delay: 35 },
	{ frame: "quarter", delay: 35 },
];
const openFrame = blinkFrames[0] ?? { frame: "open", delay: 0 };
const blinkMinDelay = 1_600;
const blinkDelayRange = 1_000;

/** Sparse eye-only updates. No animation loop runs between blinks. */
export function createAnimatedHeader({
	tui,
	theme,
	getDetails,
	workspace,
	animate = true,
}: {
	tui: TUI;
	theme: Theme;
	getDetails: () => HeaderDetails;
	workspace: HeaderWorkspace;
	animate?: boolean;
}): Component & { dispose(): void } {
	let phase = 0;
	let portraitVisible = false;
	let disposed = false;
	let checkingVisibility = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const currentFrame = () => blinkFrames[phase] ?? openFrame;

	const stopTimer = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	};

	// Offscreen changes force a full scrollback redraw in regular mode.
	const isEyeVisible = () => {
		if (tui.mode !== "regular") return true;
		checkingVisibility = true;
		try {
			const eyeLine = HEADER_PORTRAIT[currentFrame().frame][6] ?? "";
			return tui.render(tui.terminal.columns)
				.slice(-tui.terminal.rows)
				.some((line) => stripTerminalSequences(line).includes(eyeLine));
		} finally {
			checkingVisibility = false;
		}
	};

	const schedule = () => {
		if (!animate || disposed || !portraitVisible || checkingVisibility || timer !== undefined) return;
		const delay = phase === 0 ? blinkMinDelay + Math.random() * blinkDelayRange : currentFrame().delay;
		timer = setTimeout(() => {
			timer = undefined;
			if (disposed || !isEyeVisible()) return;
			phase = (phase + 1) % blinkFrames.length;
			tui.requestRender();
			schedule();
		}, delay);
		timer.unref();
	};

	return {
		render(width) {
			portraitVisible = width >= HEADER_PORTRAIT_MIN_WIDTH;
			if (portraitVisible) {
				schedule();
			} else {
				stopTimer();
				phase = 0;
			}
			return buildHeader({ theme, details: getDetails(), workspace, width, frame: currentFrame().frame });
		},
		invalidate() {},
		dispose() {
			disposed = true;
			stopTimer();
		},
	};
}
