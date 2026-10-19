import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { stream as captureResponses } from "@earendil-works/pi-ai/api/openai-responses";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { appendFileSync, writeFileSync } from "node:fs";

export default function fixture(pi: ExtensionAPI): void {
	const trace = (value: unknown) => appendFileSync(process.env.REMOTE_TRACE!, JSON.stringify(value) + "\n");
	pi.registerTool({
		name: "local_probe", label: "Local probe", description: "Verification-only local tool.", parameters: Type.Object({}),
		async execute() { writeFileSync(process.env.LOCAL_PROBE_MARKER!, "EXECUTED"); return { content: [{ type: "text", text: "local probe ran" }], details: undefined }; },
	});
	pi.on("before_agent_start", (event) => {
		trace({ active: pi.getActiveTools(), userPrompt: "prompt" in event ? event.prompt : null });
	});
	pi.registerProvider("remote-fixture", {
		baseUrl: "http://unused.invalid", apiKey: "fixture-not-a-secret", api: "remote-fixture-api",
		models: [{ id: "fixture", name: "Remote fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 2000 }],
		streamSimple(model, context) {
			const stream = createAssistantMessageEventStream();
			queueMicrotask(async () => {
				// Capture the real Responses serializer output, then stop before any network request.
				for (const supportsMidConvoSystemMessages of [false, true]) {
					await captureResponses({ ...model, api: "openai-responses", compat: { supportsMidConvoSystemMessages } }, context, {
						apiKey: "fixture-not-a-secret",
						onPayload(payload) {
							trace({ request: payload, supportsMidConvoSystemMessages });
							throw new Error("Fixture captured payload; do not send it.");
						},
					}).result();
				}
				const last = context.messages.at(-1);
				const user = [...context.messages].reverse().find((message) => {
					if (message.role !== "user") return false;
					const text = typeof message.content === "string" ? message.content : message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
					return !text.startsWith("<workspace_update>");
				});
				const text = typeof user?.content === "string" ? user.content : user?.content.filter((block) => block.type === "text").map((block) => block.text).join("") ?? "";
				let call: Extract<AssistantMessage["content"][number], { type: "toolCall" }> | undefined;
				if (last?.role === "user") {
					if (text.includes("remote-file")) call = { type: "toolCall", id: `f-${Date.now()}`, name: "write", arguments: { path: "remote-only.txt", content: "REMOTE_FILE_CREATED" } };
					else if (text.includes("remote-sleep")) call = { type: "toolCall", id: `f-${Date.now()}`, name: "bash", arguments: { command: "printf '%s' \"$$\" > remote-sleep.pid; printf REMOTE_SHELL_SLEEP_READY; exec sleep 30" } };
					else if (text.includes("try-local-tool")) call = { type: "toolCall", id: `f-${Date.now()}`, name: "local_probe", arguments: {} };
					else call = { type: "toolCall", id: `f-${Date.now()}`, name: "bash", arguments: { command: "pwd" } };
				} else if (last?.role === "toolResult" && last.toolName === "write") {
					call = { type: "toolCall", id: `f-${Date.now()}`, name: "read", arguments: { path: "remote-only.txt" } };
				}
				const output: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), content: [], stopReason: "pending", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
				stream.push({ type: "start", partial: output });
				if (call) {
					output.content.push(call); stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
					stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: output }); output.stopReason = "toolUse";
				} else {
					const answer = "WORKSPACE_PROBE_DONE";
					output.content.push({ type: "text", text: answer }); stream.push({ type: "text_start", contentIndex: 0, partial: output });
					stream.push({ type: "text_delta", contentIndex: 0, delta: answer, partial: output });
					stream.push({ type: "text_end", contentIndex: 0, content: answer, partial: output }); output.stopReason = "stop";
				}
				trace({ output: output.content, lastTool: last?.role === "toolResult" ? last : null });
				stream.push({ type: "done", reason: output.stopReason, message: output }); stream.end();
			});
			return stream;
		},
	});
}
