import builtinModules from "builtin-modules";
import * as fs from "fs";
import * as path from "path";
import { defineConfig, Plugin, UserConfig } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

const prod = process.env.NODE_ENV === "production";
const devOutDir = "./test-vault-numbat/.obsidian/plugins/numbat-obsidian";
const finalOutDir = prod ? "dist" : devOutDir;

console.dir({ prod, node: process.env.NODE_ENV });
function hotReloadFilePlugin({ filePath }: { filePath: string }): Plugin {
	return {
		name: "hotreload-file",
		writeBundle() {
			if (prod) return;
			fs.writeFileSync(filePath, "");
			console.log(`Created .hotreload file at ${filePath}`);
		},
	};
}

export default defineConfig(async ({ mode }) => {
	const { resolve } = path;
	const prod = mode === "production";

	return {
		plugins: [
			wasmPack(["./numbat/numbat-wasm/"]),
			hotReloadFilePlugin({
				filePath: path.join(finalOutDir, ".hotreload"),
			}),
		],
		resolve: {
			alias: {
				"@numbat-wasm": path.resolve(
					__dirname,
					"./numbat/numbat-wasm/pkg/",
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
