import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER, Input, decodeKittyPrintable, isKeyRelease, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { validateConnection, type AskPass, type AuthPrompt, type ConnectionSpec } from "./config.ts";

function safeText(value: string): string {
	return stripTerminalSequences(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

function addText(value: string, data: string): string {
	const printable = decodeKittyPrintable(data);
	if (printable !== undefined) return value + safeText(printable);
	if (data.startsWith("\x1b[200~")) return value + safeText(data.slice(6).replace(/\x1b\[201~$/, "")).replace(/[\r\n]/g, "");
	return data.startsWith("\x1b") ? value : value + safeText(data).replace(/[\r\n]/g, "");
}

/** Collects SSH details and authentication prompts without passing credentials through Pi's editor. */
export async function login<T>(
	ctx: ExtensionContext,
	connect: (spec: ConnectionSpec, ask: AskPass, signal: AbortSignal) => Promise<T>,
	signal?: AbortSignal,
): Promise<T | undefined> {
	if (signal?.aborted) return undefined;
	const controller = new AbortController();
	let cancelPrompt: ((value: string | undefined) => void) | undefined;
	let finish!: (value: T | undefined) => void;
	let dismiss: (() => void) | undefined;
	let settled = false;
	const result = new Promise<T | undefined>((resolve) => { finish = resolve; });
	const settle = (value: T | undefined) => {
		if (settled) return;
		settled = true;
		controller.abort();
		cancelPrompt?.(undefined);
		finish(value);
		dismiss?.();
	};
	const onAbort = () => settle(undefined);
	signal?.addEventListener("abort", onAbort, { once: true });

	const uiResult = ctx.ui.custom<T | undefined>((tui, theme, _keys, done) => {
		dismiss = () => done(undefined);
		const labels = ["Host or SSH alias", "Username", "Port", "Remote directory"];
		const hints = ["Enter the server IP, hostname or SSH alias.", "Enter your SSH username before connecting.", "Optional. Uses your SSH config, otherwise 22.", "Starts in your remote home directory (~)."];
		const placeholders = ["e.g. XXX.XXX.XXX.XXX", "Required", "SSH config / 22", "~"];
		const fields = placeholders.map((placeholder) => new Input({
			prompt: "", placeholder, placeholderStyle: (text) => theme.fg("muted", text),
		}));
		fields[3]?.handleInput("~");
		let focus = 0;
		let error = "";
		let progress = "";
		let prompt: AuthPrompt | undefined;
		let secret = "";
		let promptResolve: ((value: string | undefined) => void) | undefined;
		let closed = false;
		let fieldRows: number[] = [];
		let fieldColumns: number[] = [];
		let actionRow = -1;
		let acceptRow = -1;
		let rejectRow = -1;
		let usable = true;
		const requestRender = () => tui.requestRender();
		const cancel = () => { closed = true; settle(undefined); };
		const clearPrompt = (answer: string | undefined) => {
			secret = "";
			prompt = undefined;
			const resolve = promptResolve;
			promptResolve = undefined;
			cancelPrompt = undefined;
			resolve?.(answer);
			requestRender();
		};
		const ask: AskPass = (next) => new Promise((resolve) => {
			if (closed || controller.signal.aborted) return resolve(undefined);
			prompt = { ...next, text: safeText(next.text) };
			secret = "";
			promptResolve = resolve;
			cancelPrompt = clearPrompt;
			requestRender();
		});
		const requireField = (index: number) => {
			if (fields[index]?.getValue().trim()) return true;
			focus = index;
			error = index === 0 ? "Enter a host or SSH alias." : "Enter your SSH username before connecting.";
			requestRender();
			return false;
		};
		const submit = () => {
			if (closed || progress || !usable || !requireField(0) || !requireField(1)) return;
			try {
				const port = fields[2]?.getValue().trim();
				const spec = validateConnection({ host: fields[0]?.getValue() ?? "", user: fields[1]?.getValue(), port: port ? Number(port) : undefined, directory: fields[3]?.getValue() ?? "~" });
				error = "";
				progress = `Connecting to ${spec.host}…`;
				requestRender();
				void connect(spec, ask, controller.signal).then((value) => {
					if (!closed && !controller.signal.aborted) { closed = true; done(value); }
				}, (caught: unknown) => {
					if (!closed && !controller.signal.aborted) {
						progress = "";
						// Transport errors are deliberately sanitized before they reach this private UI.
						error = caught instanceof Error ? safeText(caught.message) : "Connection failed. Check host, SSH configuration, and network.";
						requestRender();
					}
				});
			} catch (caught) {
				error = caught instanceof Error ? safeText(caught.message) : "Invalid connection details.";
				requestRender();
			}
		};
		const component: Component & { focused: boolean; dispose(): void } = {
			focused: true,
			render(width) {
				const height = Math.max(1, tui.terminal.rows - 2);
				const inner = Math.max(1, width - 4);
				const lines: string[] = [];
				const line = (text: string) => lines.push(truncateToWidth(text, inner, "…", true));
				const wrap = (text: string) => { for (const part of wrapTextWithAnsi(text, inner)) line(part); };
				fieldRows = [];
				fieldColumns = [];
				actionRow = acceptRow = rejectRow = -1;
				const cursor = component.focused ? CURSOR_MARKER + (tui.getShowHardwareCursor() ? "" : "\x1b[7m \x1b[27m") : "";
				if (prompt) {
					line(theme.bold(prompt.kind === "confirm" ? "Confirm SSH host key" : "SSH authentication"));
					lines.push("");
					for (const text of prompt.text.split("\n")) wrap(text);
					lines.push("");
					if (prompt.kind === "secret") line("Response: " + "•".repeat(Math.min([...secret].length, Math.max(1, inner - 11))) + cursor);
					else {
						acceptRow = lines.length + 1;
						line(theme.fg("accent", "[Y] Accept host key"));
						rejectRow = lines.length + 1;
						line("[N] Reject");
					}
					lines.push("");
					line(theme.fg("muted", "Esc cancels login"));
				} else {
					wrap("Connect Pi to your remote workspace.");
					lines.push("");
					for (const [i, field] of fields.entries()) {
						field.focused = component.focused && focus === i && !progress;
						const labelText = `${field.focused ? "> " : "  "}${labels[i] ?? ""}`;
						const label = field.focused ? theme.fg("accent", theme.bold(labelText)) : labelText;
						const stacked = inner < 44;
						if (stacked) line(label);
						const prefix = stacked ? "  " : label + " ".repeat(Math.max(1, 21 - visibleWidth(label)));
						fieldRows.push(lines.length + 1);
						fieldColumns.push(2 + visibleWidth(prefix));
						const inputWidth = Math.max(1, inner - visibleWidth(prefix));
						// Input renders a fake cursor even when unfocused; only render the active editor.
						const value = field.focused ? field.render(inputWidth)[0] ?? ""
							: truncateToWidth(field.getValue() || theme.fg("muted", placeholders[i] ?? ""), inputWidth, "…");
						line(prefix + value);
						if (!stacked && i < fields.length - 1) lines.push("");
					}
					lines.push("");
					if (error) wrap(theme.fg("error", error));
					else wrap(theme.fg("muted", progress || hints[focus] || "Ready to connect. Keys and SSH agent work automatically."));
					lines.push("");
					const button = (text: string, index: number) => component.focused && focus === index && !progress
						? theme.fg("accent", theme.bold(`\x1b[4m${text}\x1b[24m`)) : text;
					actionRow = lines.length + 1;
					line(progress ? theme.fg("muted", "Connecting…  Esc cancels") : `${button("[Connect]", 4)}   ${button("[Cancel]", 5)}`);
					lines.push("");
					wrap(theme.fg("muted", focus < 4 ? "Enter next · Tab move · Esc cancel" : "Enter select · Tab move · Esc cancel"));
				}
				usable = width >= 28 && lines.length + 2 <= height;
				if (!usable) lines.splice(0, lines.length, "Resize terminal to continue.", "Esc cancels login.");
				const border = (text: string) => theme.fg("border", text);
				const edge = (left: string, right: string, title = "") => {
					const content = truncateToWidth(title, Math.max(0, width - 2), "");
					return border(left + content + "─".repeat(Math.max(0, width - 2 - visibleWidth(content))) + right);
				};
				const output = [edge("╭", "╮", "─ SSH connection "), ...lines.map((text) => border("│") + " " + text + " ".repeat(Math.max(0, inner - visibleWidth(text))) + " " + border("│")), edge("╰", "╯")];
				return output.slice(0, height).map((text) => theme.bg("userMessageBg", theme.fg("text", truncateToWidth(text, width, ""))));
			},
			invalidate() { for (const field of fields) field.invalidate(); },
			handleMouse(event) {
				if (closed || event.type !== "press" || event.button !== "left" || !usable) return;
				if (prompt?.kind === "confirm") {
					if (event.y === acceptRow) clearPrompt("yes");
					else if (event.y === rejectRow) clearPrompt("no");
					return { handled: true, render: true };
				}
				if (prompt || progress) return;
				const index = fieldRows.indexOf(event.y);
				if (index >= 0) {
					focus = index;
					fields[index]?.handleMouse({ ...event, x: Math.max(0, event.x - (fieldColumns[index] ?? 0)), y: 0 });
					requestRender();
					return { handled: true, focus: true, render: true };
				}
				if (event.y === actionRow) {
					if (event.x >= 2 && event.x < 11) submit();
					else if (event.x >= 14 && event.x < 22) cancel();
					return { handled: true, render: true };
				}
			},
			handleInput(data) {
				if (closed || isKeyRelease(data)) return;
				if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { cancel(); return; }
				if (prompt?.kind === "confirm" && matchesKey(data, "n")) { clearPrompt("no"); return; }
				if (!usable) return;
				if (prompt?.kind === "confirm") {
					if (matchesKey(data, "y")) clearPrompt("yes");
				} else if (prompt?.kind === "secret") {
					if (matchesKey(data, "enter")) clearPrompt(secret);
					else if (matchesKey(data, "backspace")) secret = [...secret].slice(0, -1).join("");
					else if (matchesKey(data, "ctrl+u")) secret = "";
					else secret = addText(secret, data);
					requestRender();
				} else if (!progress) {
					if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
						focus = (focus + (matchesKey(data, "shift+tab") ? 5 : 1)) % 6;
					} else if (matchesKey(data, "enter")) {
						if (focus === 4) submit();
						else if (focus === 5) cancel();
						else if (focus > 1 || requireField(focus)) { focus++; error = ""; }
					} else if (focus < fields.length) {
						const field = fields[focus];
						field?.handleInput(data);
						if (field) {
							const value = field.getValue();
							const safe = safeText(value).replace(/[\r\n\t]/g, "");
							if (value !== safe) field.setValue(safe);
						}
						error = "";
					}
					requestRender();
				}
			},
			dispose() {
				closed = true;
				secret = "";
				for (const field of fields) field.setValue("");
				if (promptResolve) clearPrompt(undefined);
				controller.abort();
				signal?.removeEventListener("abort", onAbort);
			},
		};
		return component;
	}, { overlay: true, overlayOptions: { width: 76, anchor: "center", margin: 1 } });

	void uiResult.then((value) => { if (!settled && value !== undefined) settle(value); }, () => settle(undefined));
	const value = await Promise.race([result, uiResult]);
	if (!settled) settle(value);
	signal?.removeEventListener("abort", onAbort);
	return value;
}
