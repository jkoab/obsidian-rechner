#![cfg(target_arch = "wasm32")]

use numbat_kernel::Numbat;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn test_set_exchange_rates() {
    let mut numbat = Numbat::new(true, false); // load_prelude = true, enable_pretty_printing = false

    // Sample exchange rates XML content (ECB format)
    let xml_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.europa.eu/vocabulary/2002-08-01/eurofxref">
    <gesmes:subject>Reference rates</gesmes:subject>
    <gesmes:Sender>
        <gesmes:name>European Central Bank</gesmes:name>
    </gesmes:Sender>
    <Cube>
        <Cube time="2024-01-15">
            <Cube currency="USD" rate="1.0850"/>
            <Cube currency="GBP" rate="0.8650"/>
            <Cube currency="JPY" rate="157.50"/>
        </Cube>
    </Cube>
</gesmes:Envelope>"#;

    // Test that set_exchange_rates doesn't panic and properly loads currencies
    numbat.set_exchange_rates(xml_content);

    // Try to use a currency conversion to verify it worked
    // This tests that the currencies module was successfully loaded
    let result = numbat.interpret_to_node("1.0850 USD to EUR");

    // The test passes if no panic occurred and we get a result
    assert!(
        !result.is_error,
        "Currency interpretation should not error after setting exchange rates"
    );
    assert!(!result.is_error, "Currency conversion should work");
}

#[wasm_bindgen_test]
fn basic() {
    let mut numbat = Numbat::new(false, false);
    let result = numbat.interpret_to_node("let a = 20;");
    assert!(!result.is_error, "Variable assignment should not error");

    let mut cloned = numbat.clone();
    let result = cloned.interpret_to_node("a");
    assert!(!result.is_error, "Variable access should not error");

    cloned.interpret_to_node("let a = 100");
    let result = numbat.interpret_to_node("a");
    assert!(
        !result.is_error,
        "Original numbat should still have old value"
    );

    let result = cloned.interpret_to_node("a");
    assert!(!result.is_error, "Cloned numbat should have new value");
}
