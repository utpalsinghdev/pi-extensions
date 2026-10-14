import {
	AssistantMessageComponent,
	ToolExecutionComponent,
	VERSION,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Container,
	Markdown,
	MouseRegion,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";

export type FocusOptions = Readonly<{ enabled: boolean; thinking: boolean }>;

type AdapterOptions = {
	getOptions: () => FocusOptions;
	onUnsupportedLayout: () => void;
};

// Pi renders inline tool images outside renderCall/renderResult. Filter the whole
// component instead, without replacing tools or changing conversation messages.
export function installFocusAdapter({
	getOptions,
	onUnsupportedLayout,
}: AdapterOptions): () => void {
	if (
		!/^1\.[012]\.\d+$/.test(VERSION) ||
		VERSION === "1.0.0" ||
		VERSION === "1.0.1"
	) {
		throw new Error(
			`Pi ${VERSION} is not supported. Focus mode supports Pi 1.0.2 through 1.2.x.`,
		);
	}

	const toolPrototype = ToolExecutionComponent.prototype;
	const assistantPrototype = AssistantMessageComponent.prototype;
	const originalToolRender = toolPrototype.render;
	const originalToolMouse = toolPrototype.handleMouse;
	const originalAssistantRender = assistantPrototype.render;
	let disposed = false;

	const toolRender: ToolExecutionComponent["render"] = function (
		this: ToolExecutionComponent,
		width,
	) {
		return !disposed && getOptions().enabled
			? []
			: originalToolRender.call(this, width);
	};
	const toolMouse: ToolExecutionComponent["handleMouse"] = function (
		this: ToolExecutionComponent,
		event,
	) {
		return !disposed && getOptions().enabled
			? undefined
			: originalToolMouse.call(this, event);
	};
	const assistantRender: AssistantMessageComponent["render"] = function (
		this: AssistantMessageComponent,
		width,
	) {
		const options = getOptions();
		if (disposed || !options.enabled || options.thinking) {
			return originalAssistantRender.call(this, width);
		}

		// In the supported Pi layout, only thinking uses MouseRegion inside this
		// container. Keep native Markdown and error rendering, including OSC markers.
		const content = this.children[0];
		if (
			this.children.length !== 1 ||
			!(content instanceof Container) ||
			!content.children.every(
				(child) =>
					child instanceof Spacer ||
					child instanceof Markdown ||
					child instanceof MouseRegion ||
					child instanceof Text,
			)
		) {
			onUnsupportedLayout();
			return originalAssistantRender.call(this, width);
		}

		const originalChildren = content.children;
		const visibleChildren: Component[] = [];
		for (const child of originalChildren) {
			if (child instanceof MouseRegion) continue;
			if (child instanceof Spacer && visibleChildren.at(-1) instanceof Spacer)
				continue;
			visibleChildren.push(child);
		}
		while (visibleChildren.at(-1) instanceof Spacer) visibleChildren.pop();
		if (visibleChildren.length === 0) return [];

		content.children = visibleChildren;
		try {
			return originalAssistantRender.call(this, width);
		} finally {
			content.children = originalChildren;
		}
	};

	toolPrototype.render = toolRender;
	toolPrototype.handleMouse = toolMouse;
	assistantPrototype.render = assistantRender;

	return () => {
		if (disposed) return;
		disposed = true;
		// Do not overwrite wrappers another extension installed after ours.
		if (toolPrototype.render === toolRender)
			toolPrototype.render = originalToolRender;
		if (toolPrototype.handleMouse === toolMouse)
			toolPrototype.handleMouse = originalToolMouse;
		if (assistantPrototype.render === assistantRender)
			assistantPrototype.render = originalAssistantRender;
	};
}
