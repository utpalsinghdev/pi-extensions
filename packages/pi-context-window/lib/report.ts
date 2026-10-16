import { readThreshold } from "./settings.ts";

export interface ContextSnapshot {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface ContextReportInput {
	usage: ContextSnapshot | undefined;
	modelContextWindow: number | undefined;
	thresholdPercent: number | null;
	thresholdError: string | null;
}

export interface ContextReportDetails {
	available: boolean;
	usageKnown: boolean;
	contextWindow: number | null;
	usedTokens: number | null;
	usedPercent: number | null;
	remainingTokens: number | null;
	remainingPercent: number | null;
	thresholdPercent: number | null;
	thresholdReached: boolean | null;
	tokensUntilThreshold: number | null;
	percentPointsUntilThreshold: number | null;
	thresholdError: string | null;
}

export interface ContextReport {
	text: string;
	details: ContextReportDetails;
}

export function structuredReport(details: ContextReportDetails): Record<string, string | number | boolean | null> {
	return {
		available: details.available,
		usageKnown: details.usageKnown,
		contextWindow: details.contextWindow,
		usedTokens: details.usedTokens,
		usedPercent: details.usedPercent,
		remainingTokens: details.remainingTokens,
		remainingPercent: details.remainingPercent,
		thresholdPercent: details.thresholdPercent,
		thresholdReached: details.thresholdReached,
		tokensUntilThreshold: details.tokensUntilThreshold,
		percentPointsUntilThreshold: details.percentPointsUntilThreshold,
		thresholdError: details.thresholdError,
	};
}

export function loadReport(
	file: string,
	input: { usage: ContextSnapshot | undefined; modelContextWindow: number | undefined },
): ContextReport {
	const threshold = readThreshold(file);
	return buildContextReport({
		usage: input.usage,
		modelContextWindow: input.modelContextWindow,
		thresholdPercent: threshold.thresholdPercent,
		thresholdError: threshold.error,
	});
}

export function buildContextReport(input: ContextReportInput): ContextReport {
	const windowTokens = positive(input.usage?.contextWindow) ?? positive(input.modelContextWindow);
	const thresholdPercent = input.thresholdError ? null : input.thresholdPercent;
	if (windowTokens === undefined) {
		const details = detailsFrom({
			available: false,
			usageKnown: false,
			thresholdPercent,
			thresholdError: input.thresholdError,
		});
		return { text: line("unknown used", "unknown tokens remaining", details), details };
	}

	const usedTokens = input.usage?.tokens;
	if (usedTokens == null || !Number.isFinite(usedTokens)) {
		const details = detailsFrom({
			available: true,
			usageKnown: false,
			contextWindow: windowTokens,
			thresholdPercent,
			thresholdError: input.thresholdError,
		});
		return { text: line("unknown used", `${windowTokens} token window | unknown tokens remaining`, details), details };
	}

	const usedPercent = (usedTokens / windowTokens) * 100;
	const remainingTokens = Math.max(0, windowTokens - usedTokens);
	const remainingPercent = Math.max(0, 100 - usedPercent);
	const thresholdReached = thresholdPercent === null ? null : usedTokens * 100 >= windowTokens * thresholdPercent;
	const tokensUntilThreshold = thresholdPercent === null || thresholdReached === null
		? null
		: thresholdReached
			? 0
			: Math.ceil((windowTokens * thresholdPercent - usedTokens * 100) / 100);
	const percentPointsUntilThreshold = thresholdPercent === null ? null : Math.max(0, thresholdPercent - usedPercent);
	const details = detailsFrom({
		available: true,
		usageKnown: true,
		contextWindow: windowTokens,
		usedTokens,
		usedPercent,
		remainingTokens,
		remainingPercent,
		thresholdPercent,
		thresholdReached,
		tokensUntilThreshold,
		percentPointsUntilThreshold,
		thresholdError: input.thresholdError,
	});
	const used = `${formatPercent(usedPercent)}% used | ${usedTokens}/${windowTokens} tokens`;
	return { text: line(used, `${remainingTokens} remaining`, details), details };
}

function positive(value: number | undefined): number | undefined {
	return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function detailsFrom(
	partial: Partial<ContextReportDetails> & Pick<ContextReportDetails, "available" | "usageKnown">,
): ContextReportDetails {
	return {
		available: partial.available,
		usageKnown: partial.usageKnown,
		contextWindow: partial.contextWindow ?? null,
		usedTokens: partial.usedTokens ?? null,
		usedPercent: partial.usedPercent ?? null,
		remainingTokens: partial.remainingTokens ?? null,
		remainingPercent: partial.remainingPercent ?? null,
		thresholdPercent: partial.thresholdPercent ?? null,
		thresholdReached: partial.thresholdReached ?? null,
		tokensUntilThreshold: partial.tokensUntilThreshold ?? null,
		percentPointsUntilThreshold: partial.percentPointsUntilThreshold ?? null,
		thresholdError: partial.thresholdError ?? null,
	};
}

function line(used: string, remaining: string, details: ContextReportDetails): string {
	return `Context: ${used} | ${remaining} | ${thresholdText(details)}`;
}

function thresholdText(details: ContextReportDetails): string {
	if (details.thresholdError) return "threshold unavailable";
	if (details.thresholdPercent === null) return "threshold not set";
	if (details.thresholdReached === null) return `threshold ${details.thresholdPercent}%`;
	if (details.thresholdReached) return `threshold ${details.thresholdPercent}% | threshold reached`;
	const points = details.percentPointsUntilThreshold ?? 0;
	const rounded = Math.round(points * 10) / 10;
	if (rounded === 0) return `threshold ${details.thresholdPercent}% | under 0.1% until threshold`;
	return `threshold ${details.thresholdPercent}% | ${formatPercent(points)}% until threshold`;
}

function formatPercent(percent: number): string {
	return String(Math.round(percent * 10) / 10);
}
