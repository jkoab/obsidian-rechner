import {
	bracketMatching,
	foldGutter,
	foldInside,
	foldNodeProp,
	HighlightStyle,
	indentNodeProp,
	LanguageSupport,
	LRLanguage,
	syntaxHighlighting,
	syntaxTree,
} from "@codemirror/language";
import {
	EditorState,
	Extension,
	RangeSet,
	RangeSetBuilder,
	StateEffect,
	StateField,
	Transaction,
} from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	lineNumbers,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { styleTags, tags as t } from "@lezer/highlight";

import {
	MarkdownPostProcessorContext,
	TextFileView,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

import { Numbat } from "@numbat-kernel/numbat_kernel";
import { NumbatKernel } from "./numbat";
import { parser } from "./numbat-lang/NumbatParser";

const numbatParserWithMetaData = parser.configure({
	props: [
		styleTags({
			Identifier: t.variableName,
			Boolean: t.bool,
			String: t.string,
			Comment: t.lineComment,
			Number: t.number,
			Keyword: t.keyword,
			test: t.bracket,
			FunIdentifier: t.function(t.variableName),
			Base_Operator: t.operator,
			"< >": t.angleBracket,
			"( )": t.paren,
		}),
		indentNodeProp.add({
			Application: (context) =>
				context.column(context.node.from) + context.unit,
		}),
		foldNodeProp.add({
			Cell: foldInside,
		}),
	],
});

const numbatLanguage = LRLanguage.define({
	parser: numbatParserWithMetaData,
	languageData: {
		commentTokens: { line: "#" },
	},
});

export const rechnerHighlightStyle = HighlightStyle.define([
	{ tag: t.comment, color: "var(--code-comment)" },
	{ tag: t.keyword, color: "var(--code-keyword)" },
	{
		tag: [t.function(t.variableName), t.labelName],
		color: "var(--code-function)",
	},
	{ tag: [t.string, t.special(t.string)], color: "var(--code-string)" },
	{
		tag: [t.number, t.bool, t.null, t.atom, t.regexp],
		color: "var(--code-value)",
	},
	{ tag: [t.tagName, t.typeName, t.namespace], color: "var(--code-tag)" },
	{ tag: t.propertyName, color: "var(--code-property)" },
	{ tag: t.operator, color: "var(--code-operator)" },
	{ tag: [t.punctuation, t.separator], color: "var(--code-punctuation)" },
	{ tag: [t.modifier, t.invalid], color: "var(--code-important)" },
	{ tag: t.content, color: "var(--code-normal)" },
]);

const rechnerTheme = EditorView.theme({
	"& .cm-scroller .overwrite-cm": {
		"font-family": "var(--font-monospace)",
	},
	"& .cm-gutters ": {
		color: "var(--color-base-70)",
		"background-color": "var(--code-background)",
	},
});
interface CellResultWidgetProps {
	isError?: boolean;
}
class CellResultWidget extends WidgetType {
	resultFragment: DocumentFragment;
	props: CellResultWidgetProps;
	constructor(
		resultFragment: DocumentFragment,
		options: CellResultWidgetProps = { isError: false },
	) {
		super();
		this.resultFragment = resultFragment;
		this.props = options;
	}
	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("div");
		if (this.props.isError) {
			container.addClasses(["rechner-cell-error"]);
		} else {
			container.addClass("rechner-output-cell");
		}
		container.append(this.resultFragment);
		return container;
	}
	ignoreEvent(event: Event): boolean {
		return true;
	}
}

const cellChangedEffect = StateEffect.define<DecorationSet>();

const cellEvalPlugin = StateField.define<DecorationSet>({
	create(state): DecorationSet {
		return RangeSet.empty;
	},

	update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
		for (const e of transaction.effects) {
			if (e.is(cellChangedEffect)) {
				return e.value;
			}
		}

		return oldState;
	},
	provide(field: StateField<DecorationSet>): Extension {
		return EditorView.decorations.from(field);
	},
});
function evalRanges(ctx: Numbat, state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	let cellCounter = 0;
	syntaxTree(state).iterate({
		enter(node) {
			if (node.name == "Cell") {
				const code = state.sliceDoc(node.from, node.to);
				const result = ctx.interpretToNode(code);
				const widget = new CellResultWidget(result.output, {
					isError: result.isError,
				});

				builder.add(
					node.to,
					node.to,
					Decoration.widget({
						widget,
						block: true,
					}),
				);
				result.free();
			}
		},
		leave(node) {
			if (node.name == "Cell") {
				cellCounter += 1;
			}
		},
	});
	return builder.finish();
}

function createNumbatEditorView(
	parent: Element | DocumentFragment | undefined,
	doc: string,
) {
	const editor = new EditorView({
		parent: parent,
		doc: doc,
		extensions: [
			foldGutter(),
			bracketMatching(),
			lineNumbers(),
			EditorView.theme({
				"& .cm-scroller .overwrite-cm": {
					"font-family": "var(--font-monospace)",
				},
			}),
		],
	});
	return editor;
}

const FILE_VIEW_TYPE = "numbat-file-view";
class NumbatFileView extends TextFileView {
	editor: EditorView;
	private numbatKernel: NumbatKernel;

	constructor(leaf: WorkspaceLeaf, numbatKernel: NumbatKernel) {
		super(leaf);
		this.numbatKernel = numbatKernel;
	}

	getViewType(): string {
		return FILE_VIEW_TYPE;
	}

	async onOpen() {
		this.contentEl.empty();
		const editor = this.contentEl.createEl("div", {});
		this.editor = new EditorView({
			parent: editor,
			extensions: [],
		});
	}

	canAcceptExtension(extension: string): boolean {
		return extension === "nbt";
	}

	async dispatchEval(state: EditorState) {
		const dispatchEvalStart = performance.mark("dispatch-start");

		const ctx = this.numbatKernel.fromDefault();
		const evals = evalRanges(ctx, state);
		ctx.free();
		this.editor.dispatch({
			effects: cellChangedEffect.of(evals),
		});

		performance.measure("dispatchEval", {
			start: dispatchEvalStart.startTime,
			end: performance.now(),
		});
		const entries = performance.getEntriesByType("measure");
		for (const entry of entries) {
			console.table(entry.toJSON());
		}
	}
	async onLoadFile(file: TFile): Promise<void> {
		const doc = await file.vault.cachedRead(file);

		this.editor.setState(
			EditorState.create({
				doc: doc,
				extensions: [
					// rechner extensions
					rechnerTheme,
					syntaxHighlighting(rechnerHighlightStyle),
					new LanguageSupport(numbatLanguage),
					cellEvalPlugin.init((state) => {
						const ctx = this.numbatKernel.fromDefault();
						const evals = evalRanges(ctx, state);
						return evals;
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							this.dispatchEval(update.state);
						}
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							this.requestSave();
						}
					}),
					// base extensions
					lineNumbers(),
					foldGutter(),
					bracketMatching(),
				],
			}),
		);
	}
	getViewData(): string {
		return this.editor.state.doc.toString();
	}
	save(clear?: boolean | undefined): Promise<void> {
		if (this.file) {
			return this.file.vault.modify(
				this.file,
				this.editor.state.doc.toString(),
			);
		}
		// TODO: what should I do here?
		return new Promise((resolve) => console.error("no file"));
	}
	setViewData(data: string, clear: boolean): void {
		console.debug({ m: "setViewData", data, clear });
		if (!clear) {
			// TODO: update without changing the cursor
			this.editor.dispatch({
				changes: {
					from: 0,
					to: this.editor.state.doc.length,
					insert: data,
				},
			});
		}
	}
	async onClose() {
		// Nothing to clean up.
		await this.save();
		// this.editor.destroy();
	}
	clear(): void {
		this.editor.setState(
			EditorState.create({
				doc: "",
			}),
		);
	}
}

class BlockViewer {
	async blockHandler(
		source: string,
		container: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) {
		const editor_container = container.createEl("div", {
			cls: "rechner-live-editor",
		});
		const view = createNumbatEditorView(editor_container, source);
	}
}

export { NumbatFileView, FILE_VIEW_TYPE, BlockViewer };
