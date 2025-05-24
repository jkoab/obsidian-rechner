import { REPLServer } from "repl";

interface InterpreterOutput {
	isError: boolean;
	output: string;
}

interface Evals {
	codeBlock: string;
	evaluation?: InterpreterOutput;
}

abstract class REPLContext {
	abstract interpret(code: string): InterpreterOutput;
	abstract clone(): REPLContext;
}
abstract class Kernel {
	abstract new(): REPLContext;
}
export { Kernel, REPLContext };
export type { InterpreterOutput, Evals };
