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

class NumbatKernel {
	defaultCtx?: Numbat;

	constructor(settings: RechnerPluginSettings) {}

	fromDefault(): Numbat {
		if (this.defaultCtx === undefined) {
			this.defaultCtx = Numbat.new(true, false);
		}
		return this.defaultCtx.clone();
	}
}

export { NumbatKernel };
