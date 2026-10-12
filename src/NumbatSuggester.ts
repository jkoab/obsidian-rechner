import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
} from "obsidian";
import { Numbat } from "numbat-kernel/numbat_kernel";
import { NumbatKernel } from "./numbat";
import { RechnerPluginSettings } from "./settings";

const NUMBAT_BLOCK_LANGUAGES = ["nbt", "numbat"];
const FENCE_REGEX = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;
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

/**
 * Returns the line of the opening fence if the cursor is inside a numbat
 * code block, otherwise null.
 */
function findNumbatBlockStart(
	editor: Editor,
	cursor: EditorPosition,
): number | null {
	let open: { fence: string; lang: string; line: number } | null = null;
	for (let line = 0; line < cursor.line; line++) {
		const match = editor.getLine(line).match(FENCE_REGEX);
		if (!match) continue;
		const fence = match[1] ?? "";
		const lang = match[2] ?? "";
		if (open === null) {
			open = { fence, lang: lang.toLowerCase(), line };
		} else if (
			fence[0] === open.fence[0] &&
			fence.length >= open.fence.length &&
			lang === ""
		) {
			open = null;
		}
	}
	if (open && NUMBAT_BLOCK_LANGUAGES.includes(open.lang)) {
		return open.line;
	}
	return null;
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

		if (findNumbatBlockStart(editor, cursor) === null) return null;

		return {
			query: word,
			start: { line: cursor.line, ch: cursor.ch - word.length },
			end: cursor,
		};
	}

	getSuggestions(context: EditorSuggestContext): NumbatCompletion[] {
		const blockStart = findNumbatBlockStart(context.editor, context.start);
		if (blockStart === null) return [];

		const precedingCode = context.editor.getRange(
			{ line: blockStart + 1, ch: 0 },
			{ line: context.start.line, ch: 0 },
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
