enum Kernel {
	NUMBAT,
	FEND,
}

interface RechnerPluginSettings {
	locale: string;
	activeKernels: Map<Kernel, boolean>;
	autoSuggest: boolean;
}

function kernelDefaults(): Map<Kernel, boolean> {
	const defaultMap = new Map();
	defaultMap.set(Kernel.NUMBAT, true);
	return defaultMap;
}

const DEFAULT_SETTINGS: RechnerPluginSettings = {
	locale: "default",
	activeKernels: kernelDefaults(),
	autoSuggest: false,
};

export type { Kernel, RechnerPluginSettings };
export { DEFAULT_SETTINGS };
