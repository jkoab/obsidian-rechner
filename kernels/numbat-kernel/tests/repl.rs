#![cfg(target_arch = "wasm32")]

use numbat_kernel::{FormatType, Numbat};
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn basic() {
    let mut numbat = Numbat::new(false, false, FormatType::Html);
    numbat.interpret("let a = 20");
    let mut cloned = numbat.clone();
    assert_eq!(
        cloned.interpret("a").output().trim(),
        r#"<span class="numbat-operator">=</span> <span class="numbat-value">20</span>"#
    );
    cloned.interpret("let a = 100");
    assert_eq!(
        numbat.interpret("a").output().trim(),
        r#"<span class="numbat-operator">=</span> <span class="numbat-value">20</span>"#
    );
    assert_eq!(
        cloned.interpret("a").output().trim(),
        r#"<span class="numbat-operator">=</span> <span class="numbat-value">100</span>"#
    );
}
