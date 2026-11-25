// Typings for the omp-only modules lib/omp-kit.ts imports; the Pi workspace has no such packages.
declare module "@oh-my-pi/pi-tui/driver/input/keys" {
	export function decodeKey(
		seq: string,
		ctx: { kitty: boolean; backspaceIsCtrl: boolean },
	): { id: string; kind: "press" | "repeat" | "release" } | null;
}

declare module "@oh-my-pi/pi-tui/text/sanitize" {
	export function stripControl(text: string, keepEscapes?: boolean): string;
}

declare module "@oh-my-pi/pi-tui/text/width" {
	export function truncate(text: string, width: number, ellipsis?: string, pad?: boolean): string;
	export function visibleWidth(text: string): number;
	export function wrap(text: string, width: number): string[];
}
