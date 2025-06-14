#!/bin/bash

set -euo pipefail

rm -rf ./pkg
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' wasm-pack build --target=web --release

echo "$(date -Iseconds),$(stat -f%z pkg/numbat_kernel_bg.wasm)" >> wasm_size_log.csv
