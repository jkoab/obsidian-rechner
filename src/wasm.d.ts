declare module "*.wasm?binary" {
	const bytes: Uint8Array;
	export default bytes;
}
