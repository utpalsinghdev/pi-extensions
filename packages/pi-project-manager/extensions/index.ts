import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createProjectPicker } from "../lib/picker.ts";
import { projectSchema, readProjects, recordProject, searchProjects } from "../lib/store.ts";
import { openProject } from "../lib/switch.ts";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function projectManagerExtension(pi: ExtensionAPI): void {
	const directory = join(getAgentDir(), "project-manager", "projects");
	let currentPath = "";
	let writeErrorShown = false;

	function record(ctx: ExtensionContext): void {
		try {
			currentPath = recordProject(directory, ctx.cwd).path;
			writeErrorShown = false;
		} catch (error) {
			if (!writeErrorShown) ctx.ui.notify(`Could not record project: ${errorMessage(error)}`, "error");
			writeErrorShown = true;
		}
	}

	pi.on("session_start", (_event, ctx) => record(ctx));
	pi.on("agent_end", (_event, ctx) => record(ctx));

	pi.registerCommand("pm", {
		description: "Search known projects and open a fresh session in the selected folder",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/pm requires interactive mode. Use list_projects for agent lookup.", "error");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current response to finish before switching projects.", "warning");
				return;
			}
			try {
				const projects = readProjects(directory);
				const path = await ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => createProjectPicker({
					projects, currentPath, query: args, theme, keybindings, done,
					getHeight: () => tui.terminal.rows - 2,
					requestRender: () => tui.requestRender(),
				}), { overlay: true, overlayOptions: { width: 96, margin: 1 } });
				if (path) await openProject(path, ctx);
			} catch (error) {
				ctx.ui.notify(`Project manager: ${errorMessage(error)}`, "error");
			}
		},
	});

	pi.registerTool({
		name: "list_projects",
		label: "List projects",
		description: "Find folders previously opened in Pi. Returns project names, absolute paths and last-used timestamps, newest first. Searches only the small local registry, not the filesystem. Does not switch workspace.",
		promptSnippet: "Look up known project paths before inspecting another project.",
		promptGuidelines: [
			"When the user refers to another project, use list_projects to find its path instead of searching the whole filesystem.",
			"Inspect another project's files with absolute paths or bash in that directory. Keep the current workspace and conversation unchanged.",
			"If several projects match, ask which one. If results are truncated, narrow the query.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Case-insensitive words matched against the folder path." })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum results. Default 50." })),
		}),
		outputSchema: Type.Object({
			projects: Type.Array(Type.Object({
				...projectSchema.properties,
				name: Type.String(),
				current: Type.Boolean(),
			})),
			total: Type.Integer(),
			truncated: Type.Boolean(),
		}),
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		async execute(_id, params) {
			const matches = searchProjects(readProjects(directory), params.query ?? "");
			const projects = matches.slice(0, params.limit ?? 50).map((project) => ({
				...project, current: project.path === currentPath,
			}));
			const result = { projects, total: matches.length, truncated: matches.length > projects.length };
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				details: result,
				structuredContent: result,
			};
		},
	});
}
