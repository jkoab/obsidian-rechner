import { FileView, TFile } from "obsidian";

const FILE_VIEW_TYPE = "numbat-file-view";
class NumbatFileView extends FileView {
	getViewType(): string {
		return FILE_VIEW_TYPE;
	}
	async onOpen() {}
	canAcceptExtension(extension: string): boolean {
		return extension === "nbt";
	}
	async onLoadFile(file: TFile): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("pre", {
			text: await file.vault.cachedRead(file),
		});
	}

	async onClose() {
		// Nothing to clean up.
	}
}

export { NumbatFileView, FILE_VIEW_TYPE };
