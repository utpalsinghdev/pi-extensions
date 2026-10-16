import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAnimatedHeader } from "../lib/animated-header.ts";
import { loadHeaderWorkspace } from "../lib/header-workspace.ts";

export default function (pi: ExtensionAPI) {
	let disposeHeader: (() => void) | undefined;
	let generation = 0;

	const cleanup = () => {
		generation++;
		disposeHeader?.();
		disposeHeader = undefined;
	};

	pi.registerFlag("header-static", {
		description: "Disable the custom header's blinking eyes",
		type: "boolean",
		default: false,
	});

	pi.on("session_start", async (_event, ctx) => {
		cleanup();
		if (ctx.mode !== "tui") return;
		const currentGeneration = generation;
		const sessionId = ctx.sessionManager.getSessionId();
		const workspace = await loadHeaderWorkspace({
			cwd: ctx.cwd,
			sessionId,
			sessionDir: ctx.sessionManager.getSessionDir(),
		});
		if (generation !== currentGeneration) return;
		ctx.ui.setHeader((tui, theme) => {
			const header = createAnimatedHeader({
				tui,
				theme,
				workspace,
				animate: pi.getFlag("header-static") !== true,
				getDetails: () => ({
					sessionId,
					model: ctx.model?.name ?? "No model selected",
					provider: ctx.model?.provider ?? "none",
					thinking: pi.getThinkingLevel(),
					tools: pi.getActiveTools().length,
					commands: pi.getCommands().length,
				}),
			});
			disposeHeader = () => header.dispose();
			return header;
		});
	});

	pi.on("session_shutdown", async () => cleanup());

	pi.registerCommand("builtin-header", {
		description: "Restore the built-in startup header",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") return;
			cleanup();
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored. Run /reload to re-enable the custom header.", "info");
		},
	});
}
