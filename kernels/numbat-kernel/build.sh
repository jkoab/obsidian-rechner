#!/bin/bash

set -euo pipefail

rm -rf ./pkg

wasm-pack --verbose build --target=web --release
echo "$(date -Iseconds),$(stat -f%z pkg/numbat_kernel_bg.wasm)" >> wasm_size_log.csv
