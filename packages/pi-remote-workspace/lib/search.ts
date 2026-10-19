import type { createFindTool, createGrepTool, createLsTool } from "@earendil-works/pi-coding-agent";
import { posix } from "node:path";
import { shellQuote } from "./config.ts";
import type { RemoteWorkspace } from "./remote-types.ts";

type Input<T extends { execute: (...args: never[]) => unknown }> = Parameters<T["execute"]>[1];
type GrepInput = Input<ReturnType<typeof createGrepTool>>;
type FindInput = Input<ReturnType<typeof createFindTool>>;
type LsInput = Input<ReturnType<typeof createLsTool>>;

function bounded(text: string): string {
	return text.length > 50000 ? `${text.slice(0, 50000)}\n[Output limited to 50 KB.]` : text;
}

function limit(value: number | undefined, fallback: number): number {
	if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 10000)) throw new Error("Limit must be an integer between 1 and 10000.");
	return value ?? fallback;
}

/** Search executes on the server. Native grep's adapter still spawns local rg, so cannot be used here. */
export async function remoteGrep(workspace: RemoteWorkspace, params: GrepInput, signal?: AbortSignal): Promise<string> {
	const maximum = limit(params.limit, 100);
	if (params.context !== undefined && (!Number.isInteger(params.context) || params.context < 0 || params.context > 100)) {
		throw new Error("Context must be between 0 and 100.");
	}
	const flags = `${params.ignoreCase ? " -i" : ""}${params.literal ? " -F" : ""}${params.context ? ` -C ${params.context}` : ""}`;
	const path = shellQuote(params.path ?? workspace.cwd);
	const pattern = shellQuote(params.pattern);
	const script = [
		"{ if command -v rg >/dev/null 2>&1; then",
		`rg --color never --line-number --no-heading --max-columns 2000 --max-columns-preview${flags}${params.glob ? ` --glob ${shellQuote(params.glob)}` : ""} -- ${pattern} ${path}`,
		"else",
		`grep -R -I -nH${params.literal ? "" : " -E"}${flags}${params.glob ? ` --include=${shellQuote(params.glob)}` : ""} --exclude-dir=.git --exclude-dir=node_modules -- ${pattern} ${path}`,
		`fi; } | head -n ${maximum + 1} | head -c 1000000`,
		"status=${PIPESTATUS[0]}",
		`case "$status" in 0|1|141) exit 0;; *) exit "$status";; esac`,
	].join("\n");
	const result = await workspace.run(script, { signal });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString() || "Remote search failed.");
	const lines = result.stdout.toString().trimEnd().split("\n");
	if (!lines[0]) return "No matches found.";
	return bounded(lines.slice(0, maximum).join("\n") + (lines.length > maximum ? `\n[Results limited to ${maximum}.]` : ""));
}

export async function remoteFind(workspace: RemoteWorkspace, params: FindInput, signal?: AbortSignal): Promise<string> {
	const maximum = limit(params.limit, 1000);
	const result = await workspace.run(`find ${shellQuote(params.path ?? workspace.cwd)} -type d \\( -name .git -o -name node_modules \\) -prune -o -type f -print0`, { signal });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString() || "Remote find failed.");
	if (params.pattern.length > 1024) throw new Error("Glob is too long.");
	const root = params.path ?? workspace.cwd;
	const matches = result.stdout.toString().split("\0").filter(Boolean)
		.map((path) => path.slice(root === "/" ? 1 : root.length + 1))
		.filter((path) => posix.matchesGlob(params.pattern.includes("/") ? path : posix.basename(path), params.pattern))
		.sort();
	return bounded(matches.slice(0, maximum).join("\n") + (matches.length > maximum ? `\n[Results limited to ${maximum}.]` : "")) || "No files found.";
}

export async function remoteLs(workspace: RemoteWorkspace, params: LsInput, signal?: AbortSignal): Promise<string> {
	const maximum = limit(params.limit, 500);
	const path = shellQuote(params.path ?? workspace.cwd);
	const result = await workspace.run(`test -d ${path} && find ${path} -mindepth 1 -maxdepth 1 -printf '%f/%y\\0'`, { signal });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString() || "Remote path is not a readable directory.");
	const entries = result.stdout.toString().split("\0").filter(Boolean).map((entry) =>
		entry.endsWith("/d") ? entry.slice(0, -1) : entry.slice(0, -2),
	).sort();
	return bounded(entries.slice(0, maximum).join("\n") + (entries.length > maximum ? `\n[Entries limited to ${maximum}.]` : "")) || "(empty directory)";
}
