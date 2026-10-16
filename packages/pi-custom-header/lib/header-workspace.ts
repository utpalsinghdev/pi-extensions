import { homedir } from "node:os";
import { basename, resolve, sep } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderWorkspace, Theme } from "./types.ts";

const recentSessionLimit = 3;

export function cleanText(text: string): string {
	return stripTerminalSequences(text)
		.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Read a same-workspace snapshot once, never during animation. */
export async function loadHeaderWorkspace({
	cwd,
	sessionId,
	sessionDir,
}: {
	cwd: string;
	sessionId: string;
	sessionDir: string;
}): Promise<HeaderWorkspace> {
	const directory = resolve(cwd);
	const home = homedir();
	const shortPath = directory === home || directory.startsWith(home + sep)
		? "~" + directory.slice(home.length)
		: directory;
	const sessions = await SessionManager.list(directory, sessionDir);
	return {
		name: cleanText(basename(directory) || directory),
		path: cleanText(shortPath),
		recentSessions: sessions
			.filter((session) => session.id !== sessionId && session.messageCount > 0)
			.slice(0, recentSessionLimit)
			.map((session) => ({
				title: cleanText(session.name || session.firstMessage) || "Untitled session",
				modified: session.modified,
			})),
	};
}

function sessionAge(modified: Date, now: number): string {
	const minutes = Math.floor(Math.max(0, now - modified.getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

/** Ten rows fit below the nine metadata rows without enlarging the portrait. */
export function buildWorkspaceLines(
	theme: Theme,
	workspace: HeaderWorkspace,
	width: number,
	now = Date.now(),
): string[] {
	const label = (text: string) => theme.fg("dim", text);
	const value = (text: string) => theme.fg("accent", cleanText(text));
	const recentLines = workspace.recentSessions.slice(0, recentSessionLimit).map((session) => {
		const age = sessionAge(session.modified, now);
		const titleWidth = Math.max(0, width - visibleWidth(age) - 3);
		return theme.fg("text", truncateToWidth(cleanText(session.title), titleWidth)) + label(` · ${age}`);
	});
	const recentRows = Array.from(
		{ length: recentSessionLimit },
		(_, index) => recentLines[index] ?? (index === 0 ? label("No previous sessions") : ""),
	);
	const commands = width >= 33
		? `${value("/resume")} ${label("sessions")} · ${value("/model")} ${label("model")}`
		: `${value("/resume")} · ${value("/model")}`;
	// Keybindings are configurable, so do not advertise hardcoded shortcuts.
	return [
		"",
		`${label("Workspace:")} ${value(workspace.name)}`,
		theme.fg("text", cleanText(workspace.path)),
		"",
		theme.bold(theme.fg("text", "Recent sessions")),
		...recentRows,
		commands,
		value("/hotkeys"),
	];
}
