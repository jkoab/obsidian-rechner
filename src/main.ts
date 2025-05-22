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

interface NumbatCodeblockSettings {
	locale: string;
}

const DEFAULT_SETTINGS: NumbatCodeblockSettings = {
	locale: "default",
};

import "./index.css";

class NumbatPluginSettingsTab extends PluginSettingTab {
	plugin: NumbatPlugin;

	constructor(app: App, plugin: NumbatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Settings")
			.setDesc("General settings")
			.addText((text) =>
				text
					.setPlaceholder("Locale")
					.setValue(this.plugin.settings.locale)
					.onChange(async (value) => {
						this.plugin.settings.locale = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

interface Evals {
	codeBlock: string;
	evaluation?: InterpreterOutput;
}

function renderError(error: InterpreterOutput): Element {
	const pre = document.createElement("pre");
	pre.classList.add(
		...["numbat-code", "numbat-code-error", "bg-red-200", "p-2"],
	);
	pre.innerHTML = error.output as string;
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

		if (evaluation?.is_error) {
			const errEl = renderError(evaluation);
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
import init, {
	Numbat,
	InterpreterOutput,
	setup_panic_hook,
	FormatType,
} from "@numbat-wasm/numbat_wasm.js";
import { evalLine } from "types/nbcodeblock.module.d.css";
// import * as numbatwasm from "../numbat/pkg/numbat_wasm";
// import numbatinit from "../numbat/pkg/numbat_wasm_bg.wasm?init";
// import { InterpreterOutput } from "../numbat/pkg/numbat_wasm";

async function getExchangeRates() {
	const response = await requestUrl(
		"https://numbat.dev/ecb-exchange-rates.php",
	).text;
	return response;
}

function instrument(spanName: string, fun: () => void) {
	const start = performance.now();
	fun();
	const end = performance.now();
	const timing = end - start;
	const logmessage = `${spanName}: ${timing} ms`;
	if (timing > 30) {
		console.warn(logmessage);
	} else {
		console.log(logmessage);
	}
}

export default class NumbatPlugin extends Plugin {
	settings: NumbatCodeblockSettings;
	async onload(): Promise<void> {
		console.log("loading plugin");
		// TODO: await in paralell
		await this.loadSettings();
		await init();
		setup_panic_hook();
		// const exchangeRates = await getExchangeRates();

		// console.dir(numbatwasm);

		this.addSettingTab(new NumbatPluginSettingsTab(this.app, this));

		const handler = (
			source: string,
			el: HTMLElement,
			ctx: MarkdownPostProcessorContext,
		) => {
			try {
				const numbat = Numbat.new(true, false, FormatType.Html);
				// numbat.set_exchange_rates(exchangeRates);
				const statementsTable = el.createEl("div", {
					cls: ["border", "border-gray-100", "rounded-sm"],
				});
				const evalBlocks = source.split("\n\n");
				instrument(
					`evaluate-block-${ctx.sourcePath || "none"}-${ctx.docId}`,
					() => {
						const evals: Array<Evals> = evalBlocks.map(
							(evalBlock) => {
								let interpretOutput:
									| InterpreterOutput
									| undefined = undefined;
								if (evalBlock.trim() !== "") {
									interpretOutput =
										numbat.interpret(evalBlock);
								}
								return {
									codeBlock: evalBlock,
									evaluation: interpretOutput,
								};
							},
						);
						renderEvals(statementsTable, evals);
					},
				);
			} catch (error) {
				console.error(error);
				el.createEl("div", { text: error });
			}
		};
		["numbat", "nbt"].map((codeblockname) =>
			this.registerMarkdownCodeBlockProcessor(codeblockname, handler),
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		console.log(`settings saved: ${JSON.stringify(this.settings)}`);
	}
}
