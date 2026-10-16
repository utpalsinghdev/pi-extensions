import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { handleThresholdCommand } from "../lib/command.ts";
import { loadReport, structuredReport } from "../lib/report.ts";
import { settingsPath } from "../lib/settings.ts";

const outputSchema = Type.Object({
	available: Type.Boolean(),
	usageKnown: Type.Boolean(),
	contextWindow: Type.Union([Type.Number(), Type.Null()]),
	usedTokens: Type.Union([Type.Number(), Type.Null()]),
	usedPercent: Type.Union([Type.Number(), Type.Null()]),
	remainingTokens: Type.Union([Type.Number(), Type.Null()]),
	remainingPercent: Type.Union([Type.Number(), Type.Null()]),
	thresholdPercent: Type.Union([Type.Number(), Type.Null()]),
	thresholdReached: Type.Union([Type.Boolean(), Type.Null()]),
	tokensUntilThreshold: Type.Union([Type.Number(), Type.Null()]),
	percentPointsUntilThreshold: Type.Union([Type.Number(), Type.Null()]),
	thresholdError: Type.Union([Type.String(), Type.Null()]),
});

export default function contextWindowExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "context_window",
		label: "Context window",
		description:
			"Report the active context window size, tokens used, tokens remaining, and the planning threshold from /context-threshold. Usage can be unknown until the next model response. Reaching the threshold does not change the session.",
		promptSnippet: "Check context window size, usage, remaining capacity, and the configured planning threshold.",
		promptGuidelines: [
			"Call context_window during a long task and before deciding whether to continue or hand off.",
			"The report lists used percent, tokens remaining, the threshold percent from /context-threshold, and the percent still left under that threshold.",
			"If the report says threshold reached, stop and write the handoff the user asked for instead of starting more work in this session.",
			"If the report says threshold not set or threshold unavailable, do not invent a limit.",
			"If the report says unknown used, do not assume the session is under the threshold.",
			"Trust threshold reached or the percent until threshold. Do not recompute the limit from the rounded used percent.",
		],
		parameters: Type.Object({}),
		outputSchema,
		annotations: { readOnlyHint: true },
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const report = loadReport(settingsPath(getAgentDir()), {
				usage: ctx.getContextUsage(),
				modelContextWindow: ctx.model?.contextWindow,
			});
			return {
				content: [{ type: "text", text: report.text }],
				details: report.details,
				structuredContent: structuredReport(report.details),
			};
		},
	});

	pi.registerCommand("context-threshold", {
		description: "Show, set, or clear the context planning threshold",
		getArgumentCompletions: (prefix) => {
			if (prefix === "clear") return null;
			const items = [{ value: "clear", label: "clear", description: "Remove the planning threshold" }]
				.filter((item) => item.value.startsWith(prefix));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			handleThresholdCommand(args, {
				usage: ctx.getContextUsage(),
				modelContextWindow: ctx.model?.contextWindow,
				notify: (message, type) => {
					ctx.ui.notify(message, type);
				},
			}, settingsPath(getAgentDir()));
		},
	});
}
