export type StashKey = "escape" | "ctrl+c" | "enter" | "up" | "down" | "d";

// Terminal text helpers the stash views need. Each host supplies its own TUI library's version.
export interface TextKit {
	truncateToWidth(text: string, width: number, ellipsis: string, pad?: boolean): string;
	visibleWidth(text: string): number;
	wrapTextWithAnsi(text: string, width: number): string[];
	stripTerminalSequences(text: string): string;
	matchesKey(data: string, key: StashKey): boolean;
}

// The part of a Pi or omp view the stash dialogs implement; both hosts accept it structurally.
export interface StashView {
	render(width: number): string[];
	invalidate(): void;
	handleInput(data: string): void;
}
