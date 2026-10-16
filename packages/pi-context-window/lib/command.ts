import { loadReport, type ContextSnapshot } from "./report.ts";
import { isThresholdTokens, saveSettings } from "./settings.ts";

export type ThresholdMode = "percent" | "static";

export type ThresholdCommand =
	| { kind: "show" }
	| { kind: "set"; percent: number }
	| { kind: "set-static"; tokens: number }
	| { kind: "clear" }
	| { kind: "invalid" };

export interface ThresholdCommandHost {
	usage: ContextSnapshot | undefined;
	modelContextWindow: number | undefined;
	notify(message: string, type: "info" | "warning" | "error"): void;
}

const USAGE = {
	percent: "Usage: /context-threshold [percent|clear]. Percent must be an integer from 1 to 99.",
	static: "Usage: /context-threshold-static [tokens|clear]. Use a positive whole token count, such as 200000 or 200k.",
};

export function parseThresholdCommand(args: string, mode: ThresholdMode = "percent"): ThresholdCommand {
	const trimmed = args.trim().toLowerCase();
	if (trimmed === "") return { kind: "show" };
	if (trimmed === "clear" || trimmed === "off") return { kind: "clear" };
	if (mode === "static") {
		const match = /^(\d+)(k)?$/.exec(trimmed);
		if (!match) return { kind: "invalid" };
		const tokens = Number(match[1]) * (match[2] ? 1_000 : 1);
		return isThresholdTokens(tokens) ? { kind: "set-static", tokens } : { kind: "invalid" };
	}
	const match = /^(\d{1,2})%?$/.exec(trimmed);
	const digits = match?.[1];
	if (!digits) return { kind: "invalid" };
	const percent = Number(digits);
	if (percent < 1 || percent > 99) return { kind: "invalid" };
	return { kind: "set", percent };
}

export function handleThresholdCommand(
	args: string,
	host: ThresholdCommandHost,
	file: string,
	mode: ThresholdMode = "percent",
): void {
	const parsed = parseThresholdCommand(args, mode);
	if (parsed.kind === "invalid") {
		host.notify(USAGE[mode], "warning");
		return;
	}
	if (parsed.kind !== "show") {
		try {
			saveSettings(file, parsed.kind === "set-static"
				? { thresholdPercent: null, thresholdTokens: parsed.tokens }
				: { thresholdPercent: parsed.kind === "set" ? parsed.percent : null });
		} catch {
			host.notify("Could not save the context threshold. Nothing was changed.", "error");
			return;
		}
	}

	const report = loadReport(file, { usage: host.usage, modelContextWindow: host.modelContextWindow });
	if (parsed.kind === "set" || parsed.kind === "set-static") {
		const value = parsed.kind === "set" ? `${parsed.percent}%` : `${parsed.tokens} tokens`;
		host.notify(
			`Context threshold set to ${value}. ${report.text}`,
			report.details.thresholdReached ? "warning" : "info",
		);
		return;
	}
	if (parsed.kind === "clear") {
		host.notify(`Context threshold cleared. ${report.text}`, "info");
		return;
	}
	const label = report.details.thresholdError
		? "Could not read the context threshold."
		: report.details.thresholdTokens !== null
			? `Context threshold: ${report.details.thresholdTokens} tokens.`
			: report.details.thresholdPercent === null
				? "Context threshold is not set."
				: `Context threshold: ${report.details.thresholdPercent}%.`;
	host.notify(`${label} ${report.text}`, report.details.thresholdError ? "error" : "info");
}
