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
import { NumbatKernel } from "./numbat";
import { DEFAULT_SETTINGS, RechnerPluginSettings } from "./settings";
import { FILE_VIEW_TYPE, NumbatFileView } from "./numbatviewer";
import init, { setup_panic_hook, Numbat } from "@numbat-kernel/numbat_kernel";

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
	numbatKernel: NumbatKernel;

	async blockHandler(
		source: string,
		container: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		let blockctx: Numbat | undefined = undefined;
		try {
			const rawCodeCells = source.split("\n\n");

			container.addClasses(["rechner-code-block"]);

			const createReplStart = performance.mark("create-repl-start");
			blockctx = this.numbatKernel.fromDefault();
			const createReplStop = performance.mark("create-repl-stop");
			performance.measure("create-repl", {
				start: createReplStart.startTime,
				end: performance.now(),
			});
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
				});
				const evalEl = codeCellContainer.createEl("div", {
					cls: ["rechner-output-cell"],
				});
				evalEl.createEl("div", { cls: ["rechner-output-spacer"] });

				const replstart = performance.mark("interpret-repl-start");
				const resultDetails = blockctx.interpretToNode(codecell);
				evalEl.appendChild(resultDetails);

				if (
					evalEl.children.item(1)?.className === "rechner-cell-error"
				) {
					codeCellContainer.addClass("rechner-cell-error-container");
					evalEl.addClass("rechner-cell-error");
				}

				performance.measure("interpret-node", {
					start: replstart.startTime,
					end: performance.now(),
				});

				// TODO: find a better solution for this?
				if (!evalEl.textContent) {
					evalEl.remove();
				}
			}

			performance.measure("block", {
				start: createReplStop.startTime,
				end: performance.now(),
			});
			// const entries = performance.getEntriesByType("measure");
			// for (const entry of entries) {
			// console.table(entry.toJSON());
			// }
			performance.clearMarks();
			performance.clearMeasures();
		} catch (error) {
			console.error(error);
			if (error instanceof Error) {
				container.createEl("div", { text: error.message });
			}
		} finally {
			blockctx?.free();
		}
	}

	settings: RechnerPluginSettings;
	async onload(): Promise<void> {
		const settings = await this.loadSettings();
		this.addSettingTab(new RechnerPluginSettingsTab(this.app, this));

		this.numbatKernel = new NumbatKernel(settings);

		await init();
		setup_panic_hook();

		for (const codeblockname of ["numbat", "nbt"]) {
			this.registerMarkdownCodeBlockProcessor(
				codeblockname,
				this.blockHandler.bind(this),
				100,
			);
		}
		if (settings.autoSuggest) {
			// const numbatSuggester = new NumbatSuggester(
			// 	this.app,
			// 	this.settings,
			// 	await (
			// 		await this.numbatKernel.fromDefault()
			// 	).ctx,
			// );
			// this.registerEditorSuggest(numbatSuggester);
		}

		this.registerView(FILE_VIEW_TYPE, (leaf) => new NumbatFileView(leaf));
		this.registerExtensions(["nbt"], FILE_VIEW_TYPE);
		this.addCommand({
			id: "add-numbat-code",
			name: "Add numbat code",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				editor.replaceRange("```nbt\n```", cursor);
				editor.setCursor(cursor.line, cursor.ch + 6);
			},
		});

		// this.registerEditorExtension([examplePlugin]);
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
