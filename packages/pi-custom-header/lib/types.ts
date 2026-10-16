import type { Theme } from "@earendil-works/pi-coding-agent";

export type { Theme };

export type HeaderPortraitFrame = "open" | "quarter" | "half" | "threeQuarter" | "closed";

export type HeaderWorkspace = {
	name: string;
	path: string;
	recentSessions: readonly { title: string; modified: Date }[];
};

export type HeaderDetails = {
	sessionId: string;
	model: string;
	provider: string;
	thinking: string;
	tools: number;
	commands: number;
};
