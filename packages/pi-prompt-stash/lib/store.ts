import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyId } from "@earendil-works/pi-tui";
import { DEFAULT_STASH_SHORTCUT, normalizeStashShortcut } from "./shortcut.ts";

export interface StashEntry {
	id: number;
	text: string;
	timestamp: number;
}

export interface StashState {
	stashes: StashEntry[];
	nextId: number;
	shortcut: KeyId;
}

function emptyState(): StashState {
	return { stashes: [], nextId: 1, shortcut: DEFAULT_STASH_SHORTCUT };
}

function isStashEntry(value: unknown): value is StashEntry {
	return typeof value === "object" && value !== null
		&& "id" in value && typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0
		&& "text" in value && typeof value.text === "string"
		&& "timestamp" in value && typeof value.timestamp === "number" && Number.isFinite(value.timestamp);
}

// Preserve the original file format, including files written before shortcut configuration existed.
export function loadState(file: string): StashState {
	let content: string;
	try {
		content = readFileSync(file, "utf-8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyState();
		throw error;
	}

	const parsed: unknown = JSON.parse(content);
	if (typeof parsed !== "object" || parsed === null
		|| !("stashes" in parsed) || !Array.isArray(parsed.stashes) || !parsed.stashes.every(isStashEntry)
		|| !("nextId" in parsed) || typeof parsed.nextId !== "number" || !Number.isSafeInteger(parsed.nextId)
		|| parsed.nextId < 1) {
		throw new Error(`Invalid prompt stash file: ${file}. Back it up and repair or remove it before reloading.`);
	}
	const { stashes, nextId } = parsed;
	if (stashes.some((entry) => entry.id >= nextId) || new Set(stashes.map((entry) => entry.id)).size !== stashes.length) {
		throw new Error(`Invalid prompt stash IDs in ${file}. Back it up and repair or remove it before reloading.`);
	}
	return {
		stashes,
		nextId,
		shortcut: normalizeStashShortcut("shortcut" in parsed ? parsed.shortcut : undefined) ?? DEFAULT_STASH_SHORTCUT,
	};
}

// Replace only after a complete write. Failed writes leave the previous stash file intact.
export function saveState(file: string, state: StashState): void {
	mkdirSync(dirname(file), { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
		renameSync(temporary, file);
	} finally {
		rmSync(temporary, { force: true });
	}
}
