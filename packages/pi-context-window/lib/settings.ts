import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SETTINGS_FILE = "context-window.json";

export interface ContextWindowSettings {
	thresholdPercent: number | null;
}

export function settingsPath(agentDir: string): string {
	return join(agentDir, SETTINGS_FILE);
}

export function isThresholdPercent(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;
}

export function loadSettings(file: string): ContextWindowSettings {
	let content: string;
	try {
		content = readFileSync(file, "utf-8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return { thresholdPercent: null };
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw invalidFile(file);
	}
	if (!isSettings(parsed)) throw invalidFile(file);
	return { thresholdPercent: parsed.thresholdPercent };
}

export function readThreshold(file: string): { thresholdPercent: number | null; error: string | null } {
	try {
		return { thresholdPercent: loadSettings(file).thresholdPercent, error: null };
	} catch (error) {
		return {
			thresholdPercent: null,
			error: error instanceof Error ? error.message : "Could not read the context threshold file.",
		};
	}
}

export function saveSettings(file: string, settings: ContextWindowSettings): void {
	mkdirSync(dirname(file), { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporary, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 0o600 });
		renameSync(temporary, file);
	} finally {
		rmSync(temporary, { force: true });
	}
}

function isSettings(value: unknown): value is ContextWindowSettings {
	return typeof value === "object" && value !== null && "thresholdPercent" in value
		&& (value.thresholdPercent === null || isThresholdPercent(value.thresholdPercent));
}

function invalidFile(file: string): Error {
	return new Error(`Invalid context threshold file: ${file}. Back it up and repair or remove it before reloading.`);
}
