import { RangeSetBuilder, StateEffect, Text } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { findNumbatBlocks } from "./numbat-blocks";
import { NumbatKernel } from "./numbat";
import { RechnerPluginSettings } from "./settings";

const EVAL_DEBOUNCE_MS = 250;
// a statement continues on the next line if its line ends with one of these
const CONTINUATION_REGEX =
	/(=|\(|\[|\{|,|\+|-|\*|\/|\^|·|×|÷|->|→|\bwhere)\s*$/;

interface Statement {
	code: string;
	/** offset of the statement's last line within the block */
	lastLineOffset: number;
}

interface InlineResult {
	lineOffset: number;
	/** formatted nodes of the result, cloned into each widget */
	nodes: Node[];
	/** plain text of the full output, also used to compare widgets */
	text: string;
	isError: boolean;
}

const isSkipped = (line: string) =>
	line.trim() === "" || line.trim().startsWith("#");

/**
 * Groups the lines of a block into statements. A statement spans several
 * lines when a line ends with an operator or the next line is indented.
 */
function statementsOf(lines: string[]): Statement[] {
	const statements: Statement[] = [];
	let current: string[] = [];
	let lastOffset = 0;
	const flush = () => {
		if (current.length === 0) return;
		statements.push({
			code: current.join("\n"),
			lastLineOffset: lastOffset,
		});
		current = [];
	};

	lines.forEach((line, offset) => {
		if (isSkipped(line)) {
			flush();
			return;
		}
		current.push(line);
		lastOffset = offset;
		const next = lines[offset + 1];
		const nextIsIndented = next !== undefined && /^\s+\S/.test(next);
		if (!CONTINUATION_REGEX.test(line) && !nextIsIndented) {
			flush();
		}
	});
	flush();
	return statements;
}

/**
 * Condenses a numbat diagnostic into one line, e.g.
 * "unknown identifier (Did you mean 'foot'?)".
 */
function summarizeError(text: string): string {
	const lines = text.split("\n");
	const labels = lines
		.filter((line) => /^\s*│/.test(line))
		.map((line) => line.replace(/^[\s│^\-─]+/, "").trim())
		.filter((label) => label !== "");
	const notes = lines
		.map((line) => line.match(/^\s*=\s*(.+)$/)?.[1]?.trim())
		.filter((note): note is string => !!note);
	const header = lines[0]?.replace(/^error:\s*/, "").trim() || "error";

	const label = labels.reduce<string | undefined>(
		(longest, l) => (longest && longest.length >= l.length ? longest : l),
		undefined,
	);
	const hint = notes.find((note) => note.startsWith("Did you mean"));
	if (label) return hint ? `${label} (${hint})` : label;
	return notes[0] ?? header;
}

/**
 * Picks the parts of the kernel output worth showing inline: printed values
 * and the result. Echoed statements (like `let x = 1`) are left out.
 */
function inlineOutput(
	output: DocumentFragment,
	isError: boolean,
): { nodes: Node[]; text: string } {
	const text = output.textContent?.trim() ?? "";
	if (isError) {
		return { nodes: [document.createTextNode(summarizeError(text))], text };
	}
	const nodes: Node[] = [];
	const parts = output.querySelectorAll(
		".numbat-printed > div, .numbat-result",
	);
	parts.forEach((part, i) => {
		if (i > 0) nodes.push(document.createTextNode(" · "));
		nodes.push(...Array.from(part.childNodes));
	});
	return { nodes, text };
}

class InlineResultWidget extends WidgetType {
	constructor(readonly result: InlineResult) {
		super();
	}

	eq(other: InlineResultWidget): boolean {
		return (
			other.result.text === this.result.text &&
			other.result.isError === this.result.isError
		);
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.addClass("rechner-inline-result");
		if (this.result.isError) {
			el.addClass("rechner-inline-result-error");
			el.setAttribute("aria-label", this.result.text);
			el.setAttribute("data-tooltip-position", "top");
		}
		el.append(...this.result.nodes.map((node) => node.cloneNode(true)));
		return el;
	}
}

const refreshEffect = StateEffect.define<null>();

/**
 * Shows the result of each statement in a numbat code block at the end
 * of the statement's line, while editing.
 */
function inlineEvalExtension(
	numbatKernel: NumbatKernel,
	settings: RechnerPluginSettings,
) {
	// results per block content, shared between editors
	let cache = new Map<string, InlineResult[]>();

	function evaluateBlock(code: string): InlineResult[] {
		const ctx = numbatKernel.fromDefault();
		try {
			const results: InlineResult[] = [];
			for (const statement of statementsOf(code.split("\n"))) {
				const output = ctx.interpretToNode(statement.code);
				const { nodes, text } = inlineOutput(
					output.output,
					output.isError,
				);
				if (nodes.length > 0) {
					results.push({
						lineOffset: statement.lastLineOffset,
						nodes,
						text,
						isError: output.isError,
					});
				}
				output.free();
			}
			return results;
		} finally {
			ctx.free();
		}
	}

	function buildDecorations(doc: Text): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		if (!settings.inlineEval) return builder.finish();

		const nextCache = new Map<string, InlineResult[]>();
		const blocks = findNumbatBlocks(doc.lines, (l) => doc.line(l + 1).text);
		for (const { fenceLine, endLine } of blocks) {
			// CodeMirror lines are 1-based, block lines are 0-based
			const firstCodeLine = fenceLine + 2;
			const lastCodeLine = endLine;
			if (firstCodeLine > lastCodeLine) continue;

			const code = doc.sliceString(
				doc.line(firstCodeLine).from,
				doc.line(lastCodeLine).to,
			);
			const results =
				nextCache.get(code) ?? cache.get(code) ?? evaluateBlock(code);
			nextCache.set(code, results);

			for (const result of results) {
				const line = doc.line(firstCodeLine + result.lineOffset);
				builder.add(
					line.to,
					line.to,
					Decoration.widget({
						widget: new InlineResultWidget(result),
						side: 1,
					}),
				);
			}
		}
		cache = nextCache;
		return builder.finish();
	}

	class InlineEvalPlugin implements PluginValue {
		decorations: DecorationSet;
		private timer?: number;

		constructor(readonly view: EditorView) {
			this.decorations = buildDecorations(view.state.doc);
		}

		update(update: ViewUpdate) {
			const refresh = update.transactions.some((tr) =>
				tr.effects.some((e) => e.is(refreshEffect)),
			);
			if (refresh) {
				this.decorations = buildDecorations(update.state.doc);
			} else if (update.docChanged) {
				// keep the old results in place until the new ones are ready
				this.decorations = this.decorations.map(update.changes);
				this.scheduleRefresh();
			}
		}

		private scheduleRefresh() {
			window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => {
				this.view.dispatch({ effects: refreshEffect.of(null) });
			}, EVAL_DEBOUNCE_MS);
		}

		destroy() {
			window.clearTimeout(this.timer);
		}
	}

	return ViewPlugin.fromClass(InlineEvalPlugin, {
		decorations: (plugin) => plugin.decorations,
	});
}

export { inlineEvalExtension };
