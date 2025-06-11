// import { requestUrl } from "obsidian";
import { Numbat } from "@numbat-kernel/numbat_kernel";
import { RechnerPluginSettings } from "./settings";

import "./numbat.css";

// async function getExchangeRates() {
// 	const response = await requestUrl(
// 		"https://numbat.dev/ecb-exchange-rates.php",
// 	).text;
// 	return response;
// }
//
class NumbatRepl {
	ctx: Numbat;
	constructor() {
		this.ctx = Numbat.new(true, false);
	}

	clone() {
		const cloned = new NumbatRepl();
		cloned.ctx = this.ctx.clone();
		return cloned;
	}
}

class NumbatKernel {
	isInitialized = false;
	defaultCtx?: NumbatRepl;

	constructor(settings: RechnerPluginSettings) {}
	async init() {}

	async fromDefault(): Promise<NumbatRepl> {
		if (this.defaultCtx === undefined) {
			this.defaultCtx = new NumbatRepl();
		}
		return this.defaultCtx.clone();
	}
}

export { NumbatKernel, NumbatRepl };
