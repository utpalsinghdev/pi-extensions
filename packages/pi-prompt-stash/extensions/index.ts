import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { promptStashExtension } from "../lib/extension.ts";
import { piUi } from "../lib/pi-ui.ts";

export default function (pi: ExtensionAPI) {
	promptStashExtension(pi, piUi);
}
