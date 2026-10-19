import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const projectSchema = Type.Object({
	path: Type.String({ minLength: 1 }),
	lastUsed: Type.Integer({ minimum: 0, maximum: 8_640_000_000_000_000, description: "Last activity, Unix milliseconds." }),
}, { additionalProperties: false });

type ProjectRecord = Static<typeof projectSchema>;
export type Project = ProjectRecord & { name: string };

function filename(path: string): string {
	return `${createHash("sha256").update(path).digest("hex")}.json`;
}

/** One atomic file per canonical path avoids lost projects when several Pi processes write. */
export function recordProject(directory: string, cwd: string): Project {
	const path = realpathSync(cwd);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const record: ProjectRecord = { path, lastUsed: Date.now() };
	const temporary = join(directory, `.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
		renameSync(temporary, join(directory, filename(path)));
	} finally {
		rmSync(temporary, { force: true });
	}
	return { ...record, name: basename(path) || path };
}

/** Reads only the registry, never project contents or Pi session history. */
export function readProjects(directory: string): Project[] {
	let files;
	try {
		files = readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
		throw error;
	}
	return files.filter((file) => file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name)).map((file) => {
		const path = join(directory, file.name);
		let record: unknown;
		try {
			record = JSON.parse(readFileSync(path, "utf8"));
		} catch (error) {
			throw new Error(`Could not read project record: ${path}. Back up and repair or remove that file.`, { cause: error });
		}
		if (!Value.Check(projectSchema, record) || !isAbsolute(record.path) || record.path.includes("\0")
			|| filename(record.path) !== file.name) {
			throw new Error(`Invalid project record: ${path}. Back up and remove that file, then reopen its project.`);
		}
		return { ...record, name: basename(record.path) || record.path };
	}).sort((a, b) => b.lastUsed - a.lastUsed || a.path.localeCompare(b.path));
}

export function searchProjects(projects: Project[], query: string): Project[] {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	return projects.filter((project) => terms.every((term) => project.path.toLowerCase().includes(term)));
}
