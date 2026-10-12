import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
} from "obsidian";
import { Numbat } from "numbat-kernel/numbat_kernel";
import { numbatBlockAt } from "./numbat-blocks";
import { NumbatKernel } from "./numbat";
import { RechnerPluginSettings } from "./settings";

// numbat identifiers may contain unicode letters (e.g. µ, °)
const WORD_BEFORE_CURSOR_REGEX = /[\p{L}\p{N}_]+$/u;

// mirrors the kernel's `CompletionType`, which wasm-bindgen does not export
type CompletionKind =
	"Keyword" | "UnicodeInput" | "Variable" | "Function" | "Dimension" | "Unit";

const KIND_BADGES: Record<CompletionKind, string> = {
	Function: "f",
	Unit: "u",
	Variable: "v",
	Dimension: "d",
	Keyword: "k",
	UnicodeInput: "α",
};

interface NumbatCompletion {
	text: string;
	kind: CompletionKind;
	/** function signature, dimension of a unit or a unicode symbol */
	detail?: string;
}

class NumbatSuggester extends EditorSuggest<NumbatCompletion> {
	private numbatKernel: NumbatKernel;
	private settings: RechnerPluginSettings;
	// context with the block code above the cursor already evaluated
	private cached?: { code: string; ctx: Numbat };

	constructor(
		app: App,
		settings: RechnerPluginSettings,
		numbatKernel: NumbatKernel,
	) {
		super(app);
		this.settings = settings;
		this.numbatKernel = numbatKernel;
	}

	/**
	 * Evaluates the code preceding the cursor so user defined
	 * variables, functions and units show up in the suggestions.
	 */
	private contextFor(code: string): Numbat {
		if (this.cached?.code === code) {
			return this.cached.ctx;
		}
		this.cached?.ctx.free();
		const ctx = this.numbatKernel.fromDefault();
		for (const cell of code.split("\n\n")) {
			if (cell.trim()) {
				ctx.interpretToNode(cell).free();
			}
		}
		this.cached = { code, ctx };
		return ctx;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
	): EditorSuggestTriggerInfo | null {
		if (!this.settings.autoSuggest) return null;

		const lineText = editor.getLine(cursor.line);
		const word =
			lineText
				.substring(0, cursor.ch)
				.match(WORD_BEFORE_CURSOR_REGEX)?.[0] ?? "";
		if (word.length === 0) return null;

		if (numbatBlockAt(cursor.line, (l) => editor.getLine(l)) === null) {
			return null;
		}

		return {
			query: word,
			start: { line: cursor.line, ch: cursor.ch - word.length },
			end: cursor,
		};
	}

	getSuggestions(context: EditorSuggestContext): NumbatCompletion[] {
		const { editor, start } = context;
		const block = numbatBlockAt(start.line, (l) => editor.getLine(l));
		if (block === null) return [];

		const precedingCode = editor.getRange(
			{ line: block.fenceLine + 1, ch: 0 },
			{ line: start.line, ch: 0 },
		);
		const ctx = this.contextFor(precedingCode);

		return ctx
			.getTypedCompletionsFor(context.query, true)
			.map((completion) => {
				const { text, ctype, detail } = completion;
				completion.free();
				return { text, kind: ctype, detail };
			})
			.filter(({ text }) => text !== context.query);
	}

	renderSuggestion(value: NumbatCompletion, el: HTMLElement): void {
		const suggestion = el.createDiv({
			cls: [
				"rechner-suggestion",
				`rechner-suggestion-${value.kind.toLowerCase()}`,
			],
		});
		suggestion.createDiv({
			cls: "rechner-suggestion-badge",
			text: KIND_BADGES[value.kind],
			attr: { "aria-label": value.kind },
		});
		const name = suggestion.createDiv({ cls: "rechner-suggestion-name" });
		if (value.kind === "Function") {
			const fnName = value.text.replace(/\(\)?$/, "");
			name.createSpan({ text: fnName });
			name.createSpan({ cls: "rechner-suggestion-parens", text: "()" });
		} else {
			name.setText(value.text.trimEnd());
		}
		if (value.detail) {
			suggestion.createDiv({
				cls: "rechner-suggestion-detail",
				text: value.detail,
			});
		}
	}

	selectSuggestion(value: NumbatCompletion): void {
		if (!this.context) return;
		// unicode inputs like `pm` are replaced by their symbol (±)
		const text =
			value.kind === "UnicodeInput" && value.detail
				? value.detail
				: value.text;
		this.context.editor.replaceRange(
			text,
			this.context.start,
			this.context.end,
		);
	}

	free() {
		this.cached?.ctx.free();
		this.cached = undefined;
	}
}

export { NumbatSuggester };
