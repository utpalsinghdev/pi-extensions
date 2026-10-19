import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	Input, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi,
	type Component, type Focusable,
} from "@earendil-works/pi-tui";
import { searchProjects, type Project } from "./store.ts";

interface PickerOptions {
	projects: Project[];
	currentPath: string;
	query: string;
	theme: Theme;
	keybindings: KeybindingsManager;
	getHeight: () => number;
	requestRender: () => void;
	onRemove: (path: string) => void;
	done: (path: string | undefined) => void;
}

function safeText(value: string): string {
	return stripTerminalSequences(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

function lastUsed(timestamp: number): string {
	const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	if (days < 30) return `${Math.floor(days / 7)}w ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}y ago`;
}

export function createProjectPicker(options: PickerOptions): Component & Focusable {
	const { theme, keybindings, done } = options;
	const input = new Input({ prompt: "Search: ", placeholder: "name or path" });
	input.handleInput(`\x1b[200~${safeText(options.query)}\x1b[201~`);
	let projects = options.projects;
	let entries = searchProjects(projects, input.getValue());
	let index = 0;
	let pageSize = 12;
	let feedback: { color: "success" | "error"; text: string } | undefined;

	return {
		get focused() { return input.focused; },
		set focused(value) { input.focused = value; },
		invalidate() { input.invalidate(); },
		render(width) {
			const inner = Math.max(1, width - 4);
			const footer = [
				...(feedback ? wrapTextWithAnsi(theme.fg(feedback.color, feedback.text), inner) : []),
				...wrapTextWithAnsi(theme.fg("dim", "↑↓ select  Enter open  Ctrl+D remove  Esc close"), inner),
			];
			pageSize = Math.max(1, Math.min(12, Math.floor((options.getHeight() - 6 - footer.length) / 2)));
			const start = Math.max(0, Math.min(index - Math.floor(pageSize / 2), entries.length - pageSize));
			const body = entries.slice(start, start + pageSize).flatMap((project, offset) => {
				const selected = start + offset === index;
				const current = project.path === options.currentPath;
				const time = lastUsed(project.lastUsed);
				const label = safeText(project.name) + (current ? " (current)" : "");
				const title = truncateToWidth(`${selected ? "> " : "  "}${label}`, Math.max(1, inner - time.length - 2), "…");
				const gap = " ".repeat(Math.max(1, inner - visibleWidth(title) - time.length));
				const heading = title + gap + theme.fg("dim", time);
				return [
					selected || current ? theme.fg("accent", theme.bold(heading)) : theme.fg("text", heading),
					theme.fg("muted", truncateToWidth(`  ${safeText(project.path)}`, inner, "…")),
				];
			});
			const position = entries.length ? `${index + 1}/${entries.length}` : "0/0";
			const border = (text: string) => theme.fg("border", text);
			const edge = (left: string, right: string) => border(left + "─".repeat(Math.max(0, width - 2)) + right);
			const lines = [
				`${theme.bold("Projects")}  ${theme.fg("dim", position)}`,
				...input.render(inner),
				"",
				...(body.length ? body : [theme.fg("muted", "No matching projects.")]),
				"",
				...footer,
			];
			return [
				edge("╭", "╮"),
				...lines.map((line) => border("│") + " " + truncateToWidth(line, inner, "…", true) + " " + border("│")),
				edge("╰", "╯"),
			].map((line) => theme.bg("userMessageBg", theme.fg("text", truncateToWidth(line, width, "", true))));
		},
		handleInput(data) {
			if (keybindings.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) return done(undefined);
			if (keybindings.matches(data, "tui.select.confirm")) {
				const selected = entries[index];
				if (selected) done(selected.path);
				return;
			}
			if (matchesKey(data, "ctrl+d")) {
				const selected = entries[index];
				if (!selected) return;
				try {
					options.onRemove(selected.path);
				} catch {
					feedback = { color: "error", text: "Could not remove project. Try again." };
					options.requestRender();
					return;
				}
				projects = projects.filter((project) => project.path !== selected.path);
				entries = searchProjects(projects, input.getValue());
				index = Math.min(index, Math.max(0, entries.length - 1));
				feedback = { color: "success", text: "Removed from list. Folder unchanged." };
				options.requestRender();
				return;
			}
			if (keybindings.matches(data, "tui.select.up")) index = Math.max(0, index - 1);
			else if (keybindings.matches(data, "tui.select.down")) index = Math.min(Math.max(0, entries.length - 1), index + 1);
			else if (keybindings.matches(data, "tui.select.pageUp")) index = Math.max(0, index - pageSize);
			else if (keybindings.matches(data, "tui.select.pageDown")) index = Math.min(Math.max(0, entries.length - 1), index + pageSize);
			else {
				const previous = input.getValue();
				input.handleInput(data);
				if (input.getValue() !== previous) {
					entries = searchProjects(projects, input.getValue());
					index = 0;
					feedback = undefined;
				}
			}
			options.requestRender();
		},
	};
}
