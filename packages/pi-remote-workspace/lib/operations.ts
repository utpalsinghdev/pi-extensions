import {
	createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool,
	type BashOperations, type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import { posix } from "node:path";
import { shellQuote } from "./config.ts";
import type { RemoteWorkspace } from "./remote-types.ts";
import { remoteFind, remoteGrep, remoteLs } from "./search.ts";

/** Resolve paths before native tools can expand '~' against the client's home directory. */
export function remotePath(path: string, workspace: RemoteWorkspace): string {
	if (path.includes("\0")) throw new Error("NUL is not allowed in paths.");
	const expanded = path === "~" ? workspace.home : path.startsWith("~/") ? posix.join(workspace.home, path.slice(2)) : path;
	return posix.resolve(workspace.cwd, expanded);
}

async function checked(workspace: RemoteWorkspace, command: string, signal?: AbortSignal, input?: string): Promise<Buffer> {
	const result = await workspace.run(command, { signal, input });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString() || `Remote operation exited with code ${result.exitCode}.`);
	return result.stdout;
}

function readOperations(workspace: RemoteWorkspace, signal?: AbortSignal): ReadOperations {
	return {
		readFile: (path) => checked(workspace, `cat -- ${shellQuote(path)}`, signal),
		access: async (path) => { await checked(workspace, `test -r ${shellQuote(path)}`, signal); },
		detectImageMimeType: async (path) => {
			const result = await workspace.run(`file --mime-type -b -- ${shellQuote(path)}`, { signal });
			const mime = result.stdout.toString().trim();
			return result.exitCode === 0 && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"].includes(mime) ? mime : null;
		},
	};
}

/** User ! commands use the same connection and cwd, without forwarding local Pi environment. */
export function createRemoteBashOperations(workspace: RemoteWorkspace): BashOperations {
	return {
		exec: async (command, _cwd, options) => {
			const result = await workspace.run(command, { signal: options.signal, timeout: options.timeout, onData: options.onData });
			return { exitCode: result.exitCode };
		},
	};
}

/** Preserve each host version's schema/rendering, replacing every filesystem and shell operation. */
export function createRemoteTools(workspace: RemoteWorkspace) {
	const read = createReadTool(workspace.cwd);
	read.execute = (id, params, signal, update) => createReadTool(workspace.cwd, { operations: readOperations(workspace, signal) })
		.execute(id, { ...params, path: remotePath(params.path, workspace) }, signal, update);

	const write = createWriteTool(workspace.cwd);
	write.execute = (id, params, signal, update) => createWriteTool(workspace.cwd, {
		operations: {
			mkdir: async (path) => { await checked(workspace, `mkdir -p -- ${shellQuote(path)}`, signal); },
			writeFile: async (path, content) => { await checked(workspace, `cat > ${shellQuote(path)}`, signal, content); },
		},
	}).execute(id, { ...params, path: remotePath(params.path, workspace) }, signal, update);

	const edit = createEditTool(workspace.cwd);
	edit.execute = (id, params, signal, update) => createEditTool(workspace.cwd, {
		operations: {
			readFile: (path) => checked(workspace, `cat -- ${shellQuote(path)}`, signal),
			access: async (path) => { await checked(workspace, `test -r ${shellQuote(path)} && test -w ${shellQuote(path)}`, signal); },
			writeFile: async (path, content) => { await checked(workspace, `cat > ${shellQuote(path)}`, signal, content); },
		},
	}).execute(id, { ...params, path: remotePath(params.path, workspace) }, signal, update);

	const bash = createBashTool(workspace.cwd, { exposeSessionEnvironment: false });
	bash.execute = async (_id, params, signal, update) => {
		let tail = Buffer.alloc(0);
		let truncated = false;
		const started = performance.now();
		const result = await workspace.run(params.command, {
			signal, timeout: params.timeout,
			onData: (data) => {
				tail = Buffer.concat([tail, data]);
				if (tail.length > 50000) { tail = tail.subarray(-50000); truncated = true; }
				update?.({ content: [{ type: "text", text: tail.toString() }], details: undefined });
			},
		});
		let output = tail.toString();
		if (truncated) output = `[Output limited to the last 50 KB; redirect to a REMOTE file to inspect more.]\n${output}`;
		if (result.exitCode !== 0) output += `\nCommand exited with code ${result.exitCode}.`;
		return {
			content: [{ type: "text", text: output || "(no output)" }], details: undefined,
			structuredContent: { output, truncated, exit_code: result.exitCode, wall_time_seconds: (performance.now() - started) / 1000 },
		};
	};

	const grep = createGrepTool(workspace.cwd);
	grep.execute = async (_id, params, signal) => ({
		content: [{ type: "text", text: await remoteGrep(workspace, { ...params, path: remotePath(params.path ?? ".", workspace) }, signal) }], details: undefined,
	});
	const find = createFindTool(workspace.cwd);
	find.execute = async (_id, params, signal) => ({
		content: [{ type: "text", text: await remoteFind(workspace, { ...params, path: remotePath(params.path ?? ".", workspace) }, signal) }], details: undefined,
	});
	const ls = createLsTool(workspace.cwd);
	ls.execute = async (_id, params, signal) => ({
		content: [{ type: "text", text: await remoteLs(workspace, { ...params, path: remotePath(params.path ?? ".", workspace) }, signal) }], details: undefined,
	});
	return { read, write, edit, bash, grep, find, ls };
}
