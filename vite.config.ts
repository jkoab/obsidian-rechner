import builtinModules from "builtin-modules";
import * as fs from "fs";
import * as path from "path";
import { defineConfig, Plugin, UserConfig } from "vite";
import Inspect from "vite-plugin-inspect";
const prod = process.env.NODE_ENV === "production";
/**
 * Location of the test vault plugin directory
 */
const devOutDir = "./test-vault-numbat/.obsidian/plugins/rechner-obsidian";
const finalOutDir = prod ? "dist" : devOutDir;

function hotReloadFilePlugin(): Plugin {
	return {
		name: "hotreload-file",
		generateBundle() {
			if (prod) return;
			this.emitFile({
				type: "asset",
				fileName: ".hotreload",
				source: "",
			});
		},
	};
}

function includeJSON(options: { files: Array<string> }): Plugin {
	return {
		name: "obsidian-plugin-files",
		buildStart() {
			options.files.forEach((file) => {
				this.addWatchFile(file);
			});
		},
		generateBundle() {
			options.files.map((file) => {
				this.emitFile({
					type: "asset",
					fileName: path.basename(file),
					source: fs.readFileSync(file),
				});
			});
		},
	};
}

/**
 * Inlines `*.wasm?binary` imports as a Uint8Array, so the wasm-bindgen glue can be
 * initialized without `new URL(..., import.meta.url)`, which breaks in CJS output.
 */
function wasmBinary(): Plugin {
	return {
		name: "wasm-binary",
		enforce: "pre",
		async load(id) {
			if (!id.endsWith(".wasm?binary")) return;
			const file = id.slice(0, -"?binary".length);
			const b64 = (await fs.promises.readFile(file)).toString("base64");
			return `export default Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0));`;
		},
	};
}

export default defineConfig(async ({ mode }) => {
	const { resolve } = path;
	const prod = mode === "production";

	return {
		devtools: {
			apply: "serve",
		},
		plugins: [
			wasmBinary(),
			Inspect(),
			hotReloadFilePlugin(),
			includeJSON({
				files: ["versions.json", "manifest.json"],
			}),
		],
		build: {
			lib: {
				entry: resolve(__dirname, "src/main.ts"),
				name: "main",
				fileName: () => "main.js",
				formats: ["cjs"],
			},
			minify: prod,
			sourcemap: prod ? false : "inline",
			outDir: finalOutDir,
			cssCodeSplit: false,
			emptyOutDir: false,
			rollupOptions: {
				input: {
					main: resolve(__dirname, "src/main.ts"),
				},
				output: {
					format: "cjs",
					exports: "default",
					inlineDynamicImports: true,
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtinModules,
				],
			},
		},
	} as UserConfig;
});
