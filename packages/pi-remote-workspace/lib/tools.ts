import {
	createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createRemoteTools } from "./operations.ts";
import type { RemoteWorkspace } from "./remote-types.ts";

export const WORKSPACE_TOOL_MARKER = "\n[pi-remote-workspace workspace routing]";
export const REMOTE_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"];

export function localTools(cwd: string) {
	return {
		read: createReadTool(cwd), write: createWriteTool(cwd), edit: createEditTool(cwd), bash: createBashTool(cwd),
		grep: createGrepTool(cwd), find: createFindTool(cwd), ls: createLsTool(cwd),
	};
}

/** Select a backend at execution time. getWorkspace throws while switching; undefined means local. */
export function registerWorkspaceTools(pi: ExtensionAPI, getWorkspace: () => RemoteWorkspace | undefined): void {
	const definitions = localTools(process.cwd());
	const tools = (cwd: string) => {
		const workspace = getWorkspace();
		return workspace ? createRemoteTools(workspace) : localTools(cwd);
	};
	pi.registerTool({ ...definitions.read, description: definitions.read.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).read.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.write, description: definitions.write.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).write.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.edit, description: definitions.edit.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).edit.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.bash, description: definitions.bash.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).bash.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.grep, description: definitions.grep.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).grep.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.find, description: definitions.find.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).find.execute(id, args, signal, update) });
	pi.registerTool({ ...definitions.ls, description: definitions.ls.description + WORKSPACE_TOOL_MARKER, defaultActive: false, execute: (id, args, signal, update, ctx) => tools(ctx.cwd).ls.execute(id, args, signal, update) });
}
