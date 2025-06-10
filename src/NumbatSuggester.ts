import {
	EditorSuggest,
	EditorSuggestContext,
	Editor,
	EditorPosition,
	EditorSuggestTriggerInfo,
	App,
} from "obsidian";
import { Numbat, TypedCompletion } from "@numbat-kernel/numbat_kernel";
import { RechnerPluginSettings } from "./settings";

// TODO: implement suggestions
class NumbatSuggester extends EditorSuggest<TypedCompletion> {
	editor: Editor;
	ctx: Numbat;
	currQuery: string;

	constructor(app: App, settings: RechnerPluginSettings, ctx: Numbat) {
		super(app);
		this.app = app;
		this.ctx = ctx;
	}

	findEndcapuslatingBlock() {
		const { line } = this.editor.getCursor();
		const text = this.editor.getLine(line);
		/^```nbt/.test(text);
		/^```/.test(text);
	}
	getSuggestions(
		context: EditorSuggestContext,
	): TypedCompletion[] | Promise<TypedCompletion[]> {
		const completions = this.ctx.getTypedCompletionsFor(
			context.query,
			true,
		);
		return completions;
	}
	renderSuggestion(value: TypedCompletion, el: HTMLElement): void {
		const suggestion = el.createDiv({
			cls: "rechner-suggestions-container",
		});
		suggestion.createEl("div", {
			text: value.text,
			cls: "rechner-suggestions-name",
		});
		suggestion.createEl("div", {
			text: value.ctype,
			cls: "rechner-suggestions-type",
		});
	}
	selectSuggestion(
		value: TypedCompletion,
		// evt: MouseEvent | KeyboardEvent,
	): void {
		const cursor = this.editor.getCursor();
		const lineText = this.editor.getLine(cursor.line);
		const from: EditorPosition = {
			ch:
				cursor.ch -
				(lineText.substring(0, cursor.ch).match(/(\w+)$/)?.[0]
					?.length || 0),
			line: cursor.line,
		};
		this.editor.replaceRange(value.text, from, this.editor.getCursor());
	}
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		// file: TFile | null,
	): EditorSuggestTriggerInfo | null {
		this.editor = editor;
		const lineText = editor.getLine(cursor.line);
		const from: EditorPosition = {
			ch:
				cursor.ch -
				(lineText.substring(0, cursor.ch).match(/(\w+)$/)?.[0]
					?.length || 0),
			line: cursor.line,
		};
		if (cursor.ch - from.ch <= 0) {
			return null;
		} else {
			const query = this.editor.getRange(from, cursor);
			return {
				query: query,
				start: from,
				end: cursor,
			};
		}
	}
}

export { NumbatSuggester };
