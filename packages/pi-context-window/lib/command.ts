import { loadReport, type ContextSnapshot } from "./report.ts";
import { saveSettings } from "./settings.ts";

export type ThresholdCommand =
	| { kind: "show" }
	| { kind: "set"; percent: number }
	| { kind: "clear" }
	| { kind: "invalid" };

export interface ThresholdCommandHost {
	usage: ContextSnapshot | undefined;
	modelContextWindow: number | undefined;
	notify(message: string, type: "info" | "warning" | "error"): void;
}

const USAGE = "Usage: /context-threshold [percent|clear]. Percent must be an integer from 1 to 99.";

export function parseThresholdCommand(args: string): ThresholdCommand {
	const trimmed = args.trim().toLowerCase();
	if (trimmed === "") return { kind: "show" };
	if (trimmed === "clear" || trimmed === "off") return { kind: "clear" };
	const match = /^(\d{1,2})%?$/.exec(trimmed);
	const digits = match?.[1];
	if (!digits) return { kind: "invalid" };
	const percent = Number(digits);
	if (percent < 1 || percent > 99) return { kind: "invalid" };
	return { kind: "set", percent };
}

export function handleThresholdCommand(args: string, host: ThresholdCommandHost, file: string): void {
	const parsed = parseThresholdCommand(args);
	if (parsed.kind === "invalid") {
		host.notify(USAGE, "warning");
		return;
	}
	if (parsed.kind === "set" || parsed.kind === "clear") {
		try {
			saveSettings(file, { thresholdPercent: parsed.kind === "set" ? parsed.percent : null });
		} catch {
			host.notify("Could not save the context threshold. Nothing was changed.", "error");
			return;
		}
	}

	const report = loadReport(file, { usage: host.usage, modelContextWindow: host.modelContextWindow });
	if (parsed.kind === "set") {
		host.notify(
			`Context threshold set to ${parsed.percent}%. ${report.text}`,
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
		: report.details.thresholdPercent === null
			? "Context threshold is not set."
			: `Context threshold: ${report.details.thresholdPercent}%.`;
	host.notify(`${label} ${report.text}`, report.details.thresholdError ? "error" : "info");
}
