enum Kernel {
	NUMBAT,
	FEND,
}

interface ExchangeRateData {
	exchangeRates: string;
	fetchtime: number;
}

interface RechnerPluginSettings {
	locale: string;
	activeKernels: Map<Kernel, boolean>;
	autoSuggest: boolean;
	inlineEval: boolean;
	exchangeData?: ExchangeRateData;
}

function kernelDefaults(): Map<Kernel, boolean> {
	const defaultMap: Map<Kernel, boolean> = new Map();
	defaultMap.set(Kernel.NUMBAT, true);
	return defaultMap;
}

const DEFAULT_SETTINGS: RechnerPluginSettings = {
	locale: "default",
	activeKernels: kernelDefaults(),
	autoSuggest: false,
	inlineEval: true,
};

export type { Kernel, RechnerPluginSettings };
export { DEFAULT_SETTINGS };
