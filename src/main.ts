import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownPostProcessorContext,
	Editor,
	MarkdownView,
	requestUrl,
} from "obsidian";

import "./index.css";
import "./rechner.css";
import { NumbatKernel } from "./numbat";
import { DEFAULT_SETTINGS, RechnerPluginSettings } from "./settings";
import init, { setup_panic_hook, Numbat } from "@numbat-kernel/numbat_kernel";
import { BlockViewer, FILE_VIEW_TYPE, NumbatFileView } from "./EditorPlugin";
import { ExchangeRateSource } from "./exchange-rates";

// one day = 24h * 60min * 60s * 1000ms
const MS_MAX_AGE_EXCHANGE_RATES = 86_400_000;

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
				console.debug({ codecell });
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
				evalEl.appendChild(resultDetails.output);

				if (resultDetails.isError) {
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

	async fetchExchangeRates(settings: RechnerPluginSettings) {
		const fetchtime = Date.now();
		if (
			fetchtime - (settings.exchangeData?.fetchtime || 0) >
			MS_MAX_AGE_EXCHANGE_RATES
		) {
			const source = new ExchangeRateSource();
			const rates = await requestUrl(source.url);
			settings.exchangeData = {
				exchangeRates: rates.text,
				fetchtime,
			};
			return this.saveData(settings);
		}
	}

	settings: RechnerPluginSettings;
	async onload(): Promise<void> {
		const settings = await this.loadSettings();
		this.addSettingTab(new RechnerPluginSettingsTab(this.app, this));

		await this.fetchExchangeRates(settings);
		this.numbatKernel = new NumbatKernel();
		this.numbatKernel.settings = settings;

		await init();
		setup_panic_hook();

		for (const codeblockname of ["numbat", "nbt"]) {
			this.registerMarkdownCodeBlockProcessor(
				codeblockname,
				this.blockHandler.bind(this),
				100,
			);
		}

		// this is just the live viewer for testing
		this.registerMarkdownCodeBlockProcessor(
			"nbtl",
			new BlockViewer().blockHandler.bind(this),
		);
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

		this.registerView(
			FILE_VIEW_TYPE,
			(leaf) => new NumbatFileView(leaf, this.numbatKernel),
		);
		this.registerExtensions(["nbt"], FILE_VIEW_TYPE);
		this.addCommand({
			id: "add-numbat-code",
			name: "Add numbat code",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectionText = editor.getSelection() || "";
				const snippetPre = "```nbt\n";
				const codeSnippet = `${snippetPre}${selectionText}\n\`\`\``;
				const cursor = editor.getCursor();
				if (editor.somethingSelected()) {
					editor.replaceSelection(codeSnippet);
				} else {
					editor.replaceRange(codeSnippet, cursor);
				}
				editor.setCursor(cursor.line, cursor.ch + snippetPre.length);
			},
		});
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
