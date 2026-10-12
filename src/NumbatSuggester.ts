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

type CompletionKind =
	"function" | "unit" | "variable" | "dimension" | "keyword";

const KIND_BADGES: Record<CompletionKind, string> = {
	function: "f",
	unit: "u",
	variable: "v",
	dimension: "d",
	keyword: "k",
};

const METRIC_PREFIXES = [
	// long
	"quecto",
	"ronto",
	"yocto",
	"zepto",
	"atto",
	"femto",
	"pico",
	"nano",
	"micro",
	"milli",
	"centi",
	"deci",
	"deca",
	"deka",
	"hecto",
	"kilo",
	"mega",
	"giga",
	"tera",
	"peta",
	"exa",
	"zetta",
	"yotta",
	"ronna",
	"quetta",
	"kibi",
	"mebi",
	"gibi",
	"tebi",
	"pebi",
	"exbi",
	"zebi",
	"yobi",
	// short
	"Ki",
	"Mi",
	"Gi",
	"Ti",
	"Pi",
	"Ei",
	"Zi",
	"Yi",
	"da",
	"q",
	"r",
	"y",
	"z",
	"a",
	"f",
	"p",
	"n",
	"µ",
	"u",
	"m",
	"c",
	"d",
	"h",
	"k",
	"M",
	"G",
	"T",
	"P",
	"E",
	"Z",
	"Y",
	"R",
	"Q",
];

interface NumbatCompletion {
	text: string;
	kind?: CompletionKind;
}

/** Names known to a numbat context, grouped by kind. */
interface NumbatNames {
	units: Set<string>;
	variables: Set<string>;
	dimensions: Set<string>;
}

function spanContents(html: string, cls: string): Set<string> {
	const names = new Set<string>();
	const regex = new RegExp(`<span class="${cls}">([^<]*)</span>`, "g");
	for (const match of html.matchAll(regex)) {
		if (match[1]) names.add(match[1]);
	}
	return names;
}

function collectNames(ctx: Numbat): NumbatNames {
	return {
		units: spanContents(ctx.print_units(), "numbat-unit"),
		variables: spanContents(ctx.print_variables(), "numbat-identifier"),
		dimensions: spanContents(
			ctx.print_dimensions(),
			"numbat-type-identifier",
		),
	};
}

function isPrefixedUnit(text: string, units: Set<string>): boolean {
	return METRIC_PREFIXES.some(
		(prefix) =>
			text.startsWith(prefix) && units.has(text.slice(prefix.length)),
	);
}

/** The kernel does not report completion types (yet), so infer them. */
function classify(
	text: string,
	names: NumbatNames,
): CompletionKind | undefined {
	if (text.endsWith("(")) return "function";
	if (text.endsWith(" ")) return "keyword";
	if (names.dimensions.has(text)) return "dimension";
	if (names.variables.has(text)) return "variable";
	if (names.units.has(text) || isPrefixedUnit(text, names.units)) {
		return "unit";
	}
	return undefined;
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
	private cached?: { code: string; ctx: Numbat; names: NumbatNames };

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
	private contextFor(code: string): { ctx: Numbat; names: NumbatNames } {
		if (this.cached?.code === code) {
			return this.cached;
		}
		this.cached?.ctx.free();
		const ctx = this.numbatKernel.fromDefault();
		for (const cell of code.split("\n\n")) {
			if (cell.trim()) {
				ctx.interpretToNode(cell).free();
			}
		}
		this.cached = { code, ctx, names: collectNames(ctx) };
		return this.cached;
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
		const { ctx, names } = this.contextFor(precedingCode);

		return ctx
			.getTypedCompletionsFor(context.query, true)
			.map((completion) => {
				const text = completion.text;
				completion.free();
				return { text, kind: classify(text, names) };
			})
			.filter(({ text }) => text !== context.query);
	}

	renderSuggestion(value: NumbatCompletion, el: HTMLElement): void {
		const suggestion = el.createDiv({
			cls: "rechner-suggestion",
		});
		const badge = suggestion.createDiv({
			cls: "rechner-suggestion-badge",
			text: value.kind ? KIND_BADGES[value.kind] : "",
		});
		if (value.kind) {
			suggestion.addClass(`rechner-suggestion-${value.kind}`);
			badge.setAttribute("aria-label", value.kind);
		}
		const name = suggestion.createDiv({ cls: "rechner-suggestion-name" });
		if (value.kind === "function") {
			name.createSpan({ text: value.text.slice(0, -1) });
			name.createSpan({ cls: "rechner-suggestion-parens", text: "()" });
		} else {
			name.setText(value.text.trimEnd());
		}
		if (value.kind) {
			suggestion.createDiv({
				cls: "rechner-suggestion-kind",
				text: value.kind,
			});
		}
	}

	selectSuggestion(value: NumbatCompletion): void {
		if (!this.context) return;
		this.context.editor.replaceRange(
			value.text,
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
