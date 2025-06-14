import builtinModules from "builtin-modules";
import * as fs from "fs";
import * as path from "path";
import { defineConfig, Plugin, UserConfig } from "vite";
import wasm from "vite-plugin-wasm";

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

export default defineConfig(async ({ mode }) => {
	const { resolve } = path;
	const prod = mode === "production";

	return {
		plugins: [
			wasm(),
			hotReloadFilePlugin(),
			includeJSON({
				files: ["versions.json", "manifest.json"],
			}),
		],
		resolve: {
			alias: {
				"@numbat-kernel": path.resolve(
					__dirname,
					"./kernels/numbat-kernel/pkg/",
				),
			},
		},
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
