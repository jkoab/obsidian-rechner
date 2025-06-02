import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownPostProcessorContext,
	requestUrl,
} from "obsidian";

import "./index.css";
import { Evals, InterpreterOutput, REPLContext } from "./kernel";
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
	const pre = document.createElement("pre");
	pre.classList.add(
		...["numbat-code", "numbat-code-error", "bg-red-200", "p-2"],
	);
	pre.innerHTML = error;
	return pre;
}

function renderEvals(element: Element, evals: Array<Evals>): void {
	for (const [idx, { codeBlock, evaluation }] of evals.entries()) {
		const evaluatedBlock = element.createEl("div", {
			cls: ["flex", "border", "border-y", "border-gray-100"],
		});

		const codeBlockContainer = evaluatedBlock.createEl("div", {
			cls: [
				"numbat-code",
				"flex",
				"font-mono",
				"p-2",
				"flex-col",
				"w-2/3",
			],
		});
		codeBlockContainer.createEl("pre", {
			text: codeBlock,
			cls: [""],
		});

		if (evaluation?.isError) {
			const errEl = renderError(evaluation.output);
			evaluatedBlock.appendChild(errEl);
		} else {
			const evalEl = evaluatedBlock.createEl("pre", {
				cls: [
					"numbat-code",
					"whitespace-pre",
					"w-1/3",
					"bg-green-50",
					"p-2",
					"flex",
					"font-mono",
					"flex-col",
					"justify-end",
				],
			});
			const evalLine = evalEl.createEl("div", {
				cls: ["justify-normal"],
			});
			if (evaluation) {
				evalLine.innerHTML = evaluation.output.trim() as string;
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
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		try {
			const blockREPL = this.blankREPL.clone();
			const evalBlocks = source.split("\n\n");

			// numbat.set_exchange_rates(exchangeRates);
			const statementsTable = el.createEl("div", {
				cls: ["border", "border-gray-100", "rounded-sm"],
			});
			const evals: Array<Evals> = evalBlocks.map((evalBlock) => {
				let interpretOutput: InterpreterOutput | undefined = undefined;
				if (evalBlock.trim() !== "") {
					interpretOutput = blockREPL?.interpret(evalBlock);
				}
				return {
					codeBlock: evalBlock,
					evaluation: interpretOutput,
				};
			});
			renderEvals(statementsTable, evals);

			const wasmplc = statementsTable.createEl("div", {}, (el) => {
				el.id = "wasm";
			});
			blockREPL.interpretToNode(wasmplc, "2+2");
		} catch (error) {
			console.error(error);
			if (error instanceof Error) {
				el.createEl("div", { text: error.message });
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
