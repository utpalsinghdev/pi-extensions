import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptStashExtension } from "../lib/extension.ts";
import { ompUi } from "../lib/omp-ui.ts";

export default function (pi: ExtensionAPI) {
	promptStashExtension(pi, ompUi);
}
