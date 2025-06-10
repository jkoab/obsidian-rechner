import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownPostProcessorContext,
	Editor,
	MarkdownView,
} from "obsidian";

import "./index.css";
import "./rechner.css";
import { REPLContext } from "./kernel";
import { NumbatKernel } from "./numbat";
import { NumbatSuggester } from "./NumbatSuggester";
import { DEFAULT_SETTINGS, RechnerPluginSettings } from "./settings";
import { FILE_VIEW_TYPE, NumbatFileView } from "./numbatviewer";

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
			// const evaluatedCodeCells: Array<CodeCell> = rawCodeCells.map(
			// 	(codecell) => {
			// 		if (codecell.trim() !== "") {
			// 			return {
			// 				code: codecell,
			// 				outputs: blockREPL?.interpret(codecell),
			// 			};
			// 		} else {
			// 			return {
			// 				code: codecell,
			// 			};
			// 		}
			// 	},
			// );
			for (const [idx, codecell] of rawCodeCells.entries()) {
				const codeCellContainer = container.createEl(
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
					text: codecell,
					cls: [""],
				});
				const evalEl = codeCellContainer.createEl("div", {
					cls: ["rechner-output-cell"],
				});
				evalEl.createEl("div", { cls: ["rechner-output-spacer"] });

				const blockREPL = this.blankREPL.clone();
				blockREPL.interpretToNode(evalEl, codecell);
				// TODO: find a better solution for this?
				// if (!evalEl.textContent) {
				// 	evalEl.remove();
				// }
			}
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

		this.registerView(FILE_VIEW_TYPE, (leaf) => new NumbatFileView(leaf));
		this.registerExtensions(["nbt"], FILE_VIEW_TYPE);
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
