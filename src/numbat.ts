// import { requestUrl } from "obsidian";
import { Numbat } from "numbat-kernel/numbat_kernel";
import { RechnerPluginSettings } from "./settings";

import "./numbat.css";

class NumbatKernel {
	defaultCtx?: Numbat;
	exchangeRates?: string;

	public set settings(settings: RechnerPluginSettings) {
		this.exchangeRates = settings.exchangeData?.exchangeRates;
		if (this.defaultCtx) {
			// invalidate default kernel
			this.defaultCtx = undefined;
		}
	}

	fromDefault(): Numbat {
		if (this.defaultCtx === undefined) {
			this.defaultCtx = Numbat.new(true, false);
			if (this.exchangeRates) {
				this.defaultCtx.setExchangeRates(this.exchangeRates);
			}
		}
		return this.defaultCtx.clone();
	}
}

export { NumbatKernel };
