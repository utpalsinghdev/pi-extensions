import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
	type FocusOptions,
	installFocusAdapter,
} from "../lib/render-adapter.ts";

const STATE_KEY = "pi-focus-mode";
const DEFAULT_OPTIONS: FocusOptions = { enabled: true, thinking: false };
const EMPTY_COMPONENT: Component = { render: () => [], invalidate: () => {} };
const ARGUMENTS = ["on", "off", "thinking", "thinking on", "thinking off"];

function parseOptions(value: unknown): FocusOptions | undefined {
	if (
		typeof value === "object" &&
		value !== null &&
		"enabled" in value &&
		typeof value.enabled === "boolean" &&
		"thinking" in value &&
		typeof value.thinking === "boolean"
	) {
		return { enabled: value.enabled, thinking: value.thinking };
	}
	return undefined;
}

function readOptions(ctx: ExtensionContext): FocusOptions {
	let options = DEFAULT_OPTIONS;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === STATE_KEY) {
			options = parseOptions(entry.data) ?? options;
		}
	}
	return options;
}

export default function focusMode(pi: ExtensionAPI): void {
	let options = DEFAULT_OPTIONS;
	let tui: TUI | undefined;
	let disposeAdapter: (() => void) | undefined;

	function redraw(ctx: ExtensionContext): void {
		ctx.ui.setStatus(
			STATE_KEY,
			options.enabled
				? ctx.ui.theme.fg(
						"accent",
						options.thinking ? "focus + thinking" : "focus",
					)
				: undefined,
		);
		tui?.invalidate();
		tui?.requestRender();
	}

	function cleanup(ctx: ExtensionContext): void {
		if (!disposeAdapter) return;
		disposeAdapter();
		disposeAdapter = undefined;
		tui = undefined;
		ctx.ui.setWidget(STATE_KEY, undefined);
		ctx.ui.setStatus(STATE_KEY, undefined);
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		cleanup(ctx);
		options = readOptions(ctx);
		try {
			disposeAdapter = installFocusAdapter({
				getOptions: () => options,
				onUnsupportedLayout: () => {
					options = { ...options, enabled: false };
					cleanup(ctx);
					ctx.ui.notify(
						"Focus mode disabled: this Pi assistant layout is unsupported. Update pi-focus-mode before enabling it.",
						"warning",
					);
				},
			});
		} catch (error) {
			ctx.ui.notify(
				error instanceof Error
					? error.message
					: "Focus mode could not attach to Pi's UI.",
				"warning",
			);
			return;
		}
		ctx.ui.setWidget(
			STATE_KEY,
			(ui) => {
				tui = ui;
				return EMPTY_COMPONENT;
			},
			{ placement: "belowEditor" },
		);
		redraw(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		if (!disposeAdapter) return;
		options = readOptions(ctx);
		redraw(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => cleanup(ctx));
	pi.registerEntryRenderer(STATE_KEY, () => undefined);

	pi.registerCommand("focus", {
		description: "Toggle focus mode. Use on, off, or thinking on/off.",
		getArgumentCompletions: (prefix) =>
			ARGUMENTS.includes(prefix)
				? null
				: ARGUMENTS.filter((value) => value.startsWith(prefix)).map(
						(value) => ({
							value,
							label: value,
						}),
					),
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui" || !disposeAdapter) {
				if (ctx.hasUI)
					ctx.ui.notify(
						"Focus mode requires a supported interactive Pi terminal.",
						"warning",
					);
				return;
			}
			switch (args.trim().toLowerCase().replace(/\s+/g, " ")) {
				case "":
					options = { ...options, enabled: !options.enabled };
					break;
				case "on":
					options = { ...options, enabled: true };
					break;
				case "off":
					options = { ...options, enabled: false };
					break;
				case "thinking":
					options = { ...options, thinking: !options.thinking };
					break;
				case "thinking on":
					options = { ...options, thinking: true };
					break;
				case "thinking off":
					options = { ...options, thinking: false };
					break;
				default:
					ctx.ui.notify("Usage: /focus [on|off|thinking [on|off]]", "warning");
					return;
			}
			pi.appendEntry(STATE_KEY, options);
			redraw(ctx);
		},
	});
}
