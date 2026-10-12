const NUMBAT_BLOCK_LANGUAGES = ["nbt", "numbat"];
const FENCE_REGEX = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;

interface NumbatBlock {
	/** 0-based line of the opening fence */
	fenceLine: number;
	/** 0-based line of the closing fence, or the line count if unclosed */
	endLine: number;
}

/**
 * Finds all fenced numbat code blocks in a markdown document.
 */
function findNumbatBlocks(
	lineCount: number,
	getLine: (line: number) => string,
): NumbatBlock[] {
	const blocks: NumbatBlock[] = [];
	let open: { fence: string; lang: string; line: number } | null = null;
	for (let line = 0; line < lineCount; line++) {
		const match = getLine(line).match(FENCE_REGEX);
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
			if (NUMBAT_BLOCK_LANGUAGES.includes(open.lang)) {
				blocks.push({ fenceLine: open.line, endLine: line });
			}
			open = null;
		}
	}
	if (open && NUMBAT_BLOCK_LANGUAGES.includes(open.lang)) {
		blocks.push({ fenceLine: open.line, endLine: lineCount });
	}
	return blocks;
}

/**
 * Returns the block containing `line` (excluding its fences), if any.
 */
function numbatBlockAt(
	line: number,
	getLine: (line: number) => string,
): NumbatBlock | null {
	// blocks after the cursor are irrelevant, so only scan up to it
	const blocks = findNumbatBlocks(line + 1, getLine);
	const last = blocks[blocks.length - 1];
	return last && last.fenceLine < line && last.endLine > line ? last : null;
}

export { findNumbatBlocks, numbatBlockAt };
export type { NumbatBlock };
