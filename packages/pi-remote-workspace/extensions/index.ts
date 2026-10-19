import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { login } from "../lib/login.ts";
import { createRemoteBashOperations } from "../lib/operations.ts";
import { WORKSPACE_ROUTING_POLICY, workspaceNotice } from "../lib/prompt.ts";
import { REMOTE_TOOLS, registerWorkspaceTools, WORKSPACE_TOOL_MARKER } from "../lib/tools.ts";
import { SshWorkspace } from "../lib/workspace.ts";

type Mode = { kind: "local" } | { kind: "connecting"; controller: AbortController } |
	{ kind: "remote"; workspace: SshWorkspace } | { kind: "stopping" };

export default function remoteWorkspaceExtension(pi: ExtensionAPI): void {
	let mode: Mode = { kind: "local" };
	const runtimeId = randomUUID();
	let generation = 0;
	let pendingConnection: Promise<SshWorkspace> | undefined;

	function status(ctx: ExtensionContext): void {
		const text = mode.kind === "remote" ? (mode.workspace.connected ? `Remote workspace · ${mode.workspace.cwd} · /remote stop` : "Remote disconnected · /remote stop")
			: mode.kind === "connecting" ? "SSH login · private" : mode.kind === "stopping" ? "Leaving remote workspace…" : undefined;
		ctx.ui.setStatus("pi-remote-workspace", text);
	}

	function workspace() {
		if (mode.kind === "remote") return mode.workspace;
		if (mode.kind !== "local") throw new Error("Workspace is switching. No operation ran locally. Wait for connection or /remote stop.");
		return undefined;
	}

	async function stop(ctx: ExtensionContext, command?: ExtensionCommandContext): Promise<void> {
		if (command && mode.kind !== "local" && ctx.hasPendingMessages()) {
			ctx.abort();
			ctx.ui.notify("Clear queued agent messages before switching workspace, then retry /remote stop. Remote mode has not switched to local.", "warning");
			return;
		}
		generation++;
		const previous = mode;
		if (previous.kind === "local") {
			if (command) ctx.ui.notify("Already in your local workspace.", "info");
			return;
		}
		if (previous.kind === "stopping") return;
		mode = { kind: "stopping" };
		status(ctx);
		if (previous.kind === "connecting") {
			previous.controller.abort();
			await pendingConnection?.then((remote) => remote.close(), () => {});
		}
		if (command) ctx.abort();
		if (previous.kind === "remote") await previous.workspace.close();
		if (command) await command.waitForIdle();
		mode = { kind: "local" };
		status(ctx);
		if (command) ctx.ui.notify("Back in your local workspace. Remote input and changes already applied are not undone.", "info");
	}

	pi.registerCommand("remote", {
		description: "Connect your coding workspace to SSH; /remote stop returns to local",
		getArgumentCompletions: (prefix) => prefix && prefix !== "stop" && "stop".startsWith(prefix) ? [{ value: "stop", label: "stop: return to local" }] : null,
		handler: async (args, ctx) => {
			if (args.trim() === "stop") return stop(ctx, ctx);
			if (args.trim()) return ctx.ui.notify("Use /remote to connect, or /remote stop to return local.", "warning");
			if (ctx.mode !== "tui") return ctx.ui.notify("Private SSH login requires interactive Pi.", "error");
			if (mode.kind !== "local") return ctx.ui.notify("Already connecting or remote. Use /remote stop before switching servers.", "info");
			if (!ctx.isIdle() || ctx.hasPendingMessages()) return ctx.ui.notify("Stop the current agent turn and clear queued messages before connecting to a server.", "warning");
			const conflicts = REMOTE_TOOLS.filter((name) => !pi.getAllTools().find((tool) => tool.name === name)?.description.endsWith(WORKSPACE_TOOL_MARKER));
			if (conflicts.length) return ctx.ui.notify(`Other extensions own these tools: ${conflicts.join(", ")}. Start Pi with this extension only before connecting.`, "error");
			const current = ++generation;
			const controller = new AbortController();
			mode = { kind: "connecting", controller };
			status(ctx);
			try {
				const connected = await login(ctx, async (spec, ask, signal) => {
					pendingConnection = SshWorkspace.connect(spec, ask, signal, () => {
						if (mode.kind !== "remote") return;
						status(ctx);
						ctx.ui.notify("SSH connection lost. Tools remain remote and blocked. Use /remote stop to return local.", "warning");
					});
					const remote = await pendingConnection;
					pendingConnection = undefined;
					if (signal.aborted || current !== generation) {
						await remote.close();
						throw new Error("SSH login cancelled.");
					}
					return remote;
				}, controller.signal);
				if (current !== generation) { await connected?.close(); return; }
				if (!connected) {
					await pendingConnection?.then((remote) => remote.close(), () => {});
					pendingConnection = undefined;
					if (current !== generation) return;
					mode = { kind: "local" };
				} else {
					mode = { kind: "remote", workspace: connected };
					ctx.ui.notify(`Remote workspace connected: ${connected.cwd}. Use /remote stop to return local.`, "info");
				}
			} catch {
				if (current === generation) {
					mode = { kind: "local" };
					ctx.ui.notify("Could not open SSH login. No workspace switch occurred.", "error");
				}
			} finally { if (current === generation) status(ctx); }
		},
	});

	registerWorkspaceTools(pi, workspace);

	pi.on("tool_call", (event) => {
		if (mode.kind === "local") return;
		if (mode.kind !== "remote" || !REMOTE_TOOLS.includes(event.toolName)) {
			return { block: true, reason: "Only remote coding tools are available in SSH workspace mode. Use /remote stop to restore local tools." };
		}
		const definition = pi.getAllTools().find((tool) => tool.name === event.toolName);
		if (!definition?.description.endsWith(WORKSPACE_TOOL_MARKER)) {
			return { block: true, reason: "Another extension replaced this tool's workspace backend. Execution is blocked rather than risking a local operation. Use /remote stop." };
		}
		if (!mode.workspace.connected) return { block: true, reason: "Remote workspace disconnected. Use /remote stop; no local fallback is allowed." };
	});

	pi.on("before_agent_start", (event, ctx) => {
		// This section is identical in every mode. Workspace changes append a small notice instead.
		event.systemPromptOptions.sections.workspace_routing = WORKSPACE_ROUTING_POLICY;
		const key = `${runtimeId}:${generation}:${mode.kind}:${mode.kind === "remote" && mode.workspace.connected}`;
		for (const entry of ctx.sessionManager.buildContextEntries().reverse()) {
			if (entry.type !== "custom_message" || entry.customType !== "remote-workspace-state") continue;
			const details = entry.details;
			if (details && typeof details === "object" && "key" in details && details.key === key) return;
			break;
		}
		return {
			message: {
				customType: "remote-workspace-state",
				content: workspaceNotice(mode.kind === "local" ? { kind: "local", cwd: ctx.cwd } : mode),
				display: false,
				details: { key },
			},
		};
	});

	pi.on("user_bash", () => {
		const remote = workspace();
		if (remote) return { operations: createRemoteBashOperations(remote) };
	});

	pi.on("session_shutdown", async (_event, ctx) => { await stop(ctx); });
}
