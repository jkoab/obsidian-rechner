import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownPostProcessorContext,
} from "obsidian";

import "./index.css";
import "./rechner.css";
import { REPLContext, CodeCell } from "./kernel";
import { NumbatKernel } from "./numbat";
import { NumbatSuggester } from "./NumbatSuggester";
import { DEFAULT_SETTINGS, RechnerPluginSettings } from "./settings";

class RechnerPluginSettingsTab extends PluginSettingTab {
	plugin: RechnerPlugin;

	constructor(app: App, plugin: RechnerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Locale")
			.setDesc("Locale settings")
			.addText((text) =>
				text
					.setPlaceholder("en")
					.setValue(this.plugin.settings.locale)
					.onChange(async (value) => {
						this.plugin.settings.locale = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Suggestions")
			.setDesc("Turn on code suggestions")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.autoSuggest)
					.onChange(async (v) => {
						this.plugin.settings.autoSuggest = v;
						await this.plugin.saveSettings();
					}),
			);
	}
}

function renderError(error: string): Element {
	const pre = document.createElement("div");
	pre.classList.add(...["rechner-output-cell", "rechner-cell-error"]);
	const errorspan = pre.createEl("span", { text: "" });
	errorspan.innerHTML = error;
	return pre;
}

function renderCodeCells(element: Element, evals: Array<CodeCell>): void {
	for (const [idx, codeCell] of evals.entries()) {
		const codeCellContainer = element.createEl(
			"div",
			{
				cls: ["rechner-cell"],
			},
			(container) => {
				container.id = `code-cell-${idx}`;
			},
		);

		const codeCellCodeNode = codeCellContainer.createEl("div", {
			cls: ["rechner-cell-code"],
		});
		codeCellCodeNode.createEl("span", {
			text: codeCell.code,
			cls: [""],
		});
		// flex spacer
		// codeCellContainer.createEl("div", {
		// 	cls: ["flex-shrink", "border"],
		// });

		if (codeCell.outputs?.isError) {
			codeCellContainer.addClass("rechner-cell-error-container");
			const errEl = renderError(codeCell.outputs.output);
			codeCellContainer.appendChild(errEl);
		} else {
			if (codeCell.outputs?.output) {
				codeCellContainer.addClass("rechner-cell-eval-ok-border");
				const evalEl = codeCellContainer.createEl("div", {
					cls: ["rechner-output-cell"],
				});
				const evalLine = evalEl.createEl("div", {
					// cls: ["justify-normal"],
				});
				evalLine.innerHTML = codeCell.outputs.output.trim() as string;
			}
		}
	}
}

// function instrument(spanName: string, fun: () => void) {
// 	const start = performance.now();
// 	fun();
// 	const end = performance.now();
// 	const timing = end - start;
// 	const logmessage = `${spanName}: ${timing} ms`;
// 	if (timing > 30) {
// 		console.warn(logmessage);
// 	} else {
// 		console.log(logmessage);
// 	}
// }

export default class RechnerPlugin extends Plugin {
	private blankREPL: REPLContext;

	async blockHandler(
		source: string,
		container: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		try {
			container.addClasses(["rechner-code-block"]);

			const blockREPL = this.blankREPL.clone();
			const rawCodeCells = source.split("\n\n");
			const evaluatedCodeCells: Array<CodeCell> = rawCodeCells.map(
				(codecell) => {
					if (codecell.trim() !== "") {
						return {
							code: codecell,
							outputs: blockREPL?.interpret(codecell),
						};
					} else {
						return {
							code: codecell,
						};
					}
				},
			);
			renderCodeCells(container, evaluatedCodeCells);
		} catch (error) {
			console.error(error);
			if (error instanceof Error) {
				container.createEl("div", { text: error.message });
			}
		}
	}

	settings: RechnerPluginSettings;
	async onload(): Promise<void> {
		const settings = await this.loadSettings();
		this.addSettingTab(new RechnerPluginSettingsTab(this.app, this));

		const numbatKernel: NumbatKernel = new NumbatKernel(settings);
		await numbatKernel.init();
		this.blankREPL = numbatKernel.new();

		for (const codeblockname of ["numbat", "nbt"]) {
			this.registerMarkdownCodeBlockProcessor(
				codeblockname,
				this.blockHandler.bind(this),
				100,
			);
		}
		if (settings.autoSuggest) {
			const numbatSuggester = new NumbatSuggester(
				this.app,
				this.settings,
				numbatKernel.new().ctx,
			);
			this.registerEditorSuggest(numbatSuggester);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		return this.settings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		console.debug(`settings saved: ${JSON.stringify(this.settings)}`);
	}
}
