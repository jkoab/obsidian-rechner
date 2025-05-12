import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

interface NumbatCodeblockSettings {
	locale: string;
}

const DEFAULT_SETTINGS: NumbatCodeblockSettings = {
	locale: "default",
};

export class MyPlugin extends Plugin {
	settings: NumbatCodeblockSettings;

	async onload() {
		// print debug loading message
		console.log("loading plugin");
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Sample Plugin",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				new Notice(JSON.stringify(evt));
				new Notice("testing 123");
			},
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("clicking ", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000),
		);
	}

	onunload() {}
}

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
	line: string;
	evaluation?: string;
}

import styles from "./nbcodeblock.module.css";

function renderEvals(element: Element, evals: Array<Evals>): void {
	for (const [idx, { line, evaluation }] of evals.entries()) {
		const row = element.createEl("div", { cls: styles.evalLine });
		// row.createEl("div", { cls: "", text: idx.toString() });
		row.createEl("div", { cls: styles.codeLine, text: line });
		row.createEl("div", {
			text: evaluation,
			cls: styles.CodeEval,
		});
	}
}

export default class NumbatPlugin extends Plugin {
	settings: NumbatCodeblockSettings;
	async onload(): Promise<void> {
		console.log("loading plugin");
		await this.loadSettings();
		this.addSettingTab(new NumbatPluginSettingsTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("numbat", (source, el, ctx) => {
			const statementsTable = el.createEl("div", {
				cls: styles.codeBlocks,
			});
			const lines = source.split("\n");
			// TODO: evaluate
			const evals: Array<Evals> = lines.map((line) => {
				let evaluation: string | undefined = undefined;
				if (line.trim() !== "") {
					evaluation = "TODO: evala";
				}
				console.log({ line, evaluation });
				return { line, evaluation };
			});
			renderEvals(statementsTable, evals);
		});
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
