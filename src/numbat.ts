// import { requestUrl } from "obsidian";
import init, { Numbat, setup_panic_hook } from "@numbat-kernel/numbat_kernel";
import { RechnerPluginSettings } from "./settings";

import "./numbat.css";
import { InterpreterOutput, Kernel, REPLContext } from "./kernel";

// async function getExchangeRates() {
// 	const response = await requestUrl(
// 		"https://numbat.dev/ecb-exchange-rates.php",
// 	).text;
// 	return response;
// }

class NumbatREPLContext implements REPLContext {
	ctx: Numbat;

	clone() {
		return new NumbatREPLContext(this.ctx.clone());
	}

	constructor(ctx: Numbat) {
		this.ctx = ctx;
	}
	interpret(code: string): InterpreterOutput {
		return this.ctx.interpret(code);
	}

	interpretToNode(node: Node, code: string) {
		this.ctx.interpretToNode(node, code);
	}
}

class NumbatKernel implements Kernel {
	constructor(settings: RechnerPluginSettings) {}
	async init() {
		await init();
		setup_panic_hook();
	}

	new(): NumbatREPLContext {
		const numbat = Numbat.new(true, false);
		return new NumbatREPLContext(numbat);
	}
}

export { NumbatKernel };
