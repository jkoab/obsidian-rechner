interface InterpreterOutput {
	isError: boolean;
	output: string;
}

interface CodeCell {
	code: string;
	outputs?: InterpreterOutput;
}

abstract class REPLContext {
	abstract interpret(code: string): InterpreterOutput;
	abstract interpretToNode(node: Node, code: string): void;
	abstract clone(): REPLContext;
}
abstract class Kernel {
	abstract new(): REPLContext;
}
export { Kernel, REPLContext };
export type { InterpreterOutput, CodeCell };
