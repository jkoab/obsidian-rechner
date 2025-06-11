//! Numbat wasm module based of https://github.com/sharkdp/numbat/blob/master/numbat-wasm/src/lib.rs

mod node_formatter;
mod utils;

use codespan_reporting::term::termcolor::WriteColor;
use node_formatter::CSSClass;
use node_formatter::NodeFormatter;

use numbat::markup::text;
use numbat::markup::FormatType;
use numbat::markup::FormattedString;
use std::fmt::Debug;
use std::fmt::Display;
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;
use web_sys::Element;

use numbat::buffered_writer::BufferedWriter;
use numbat::diagnostic::Diagnostic;
use numbat::diagnostic::ErrorDiagnostic;
use numbat::help::help_markup;
use numbat::html_formatter::{HtmlFormatter, HtmlWriter};
use numbat::markup::Formatter;
use numbat::module_importer::BuiltinModuleImporter;
use numbat::resolver::CodeSource;
use numbat::{markup as m, NameResolutionError, NumbatError};
use numbat::{Context, InterpreterSettings};
use thiserror::Error;
use web_sys::{console, window, DocumentFragment, Node};

#[wasm_bindgen]
pub fn setup_panic_hook() {
    utils::set_panic_hook();
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub enum CompletionType {
    Unknown = "Unknown",
    Funtion = "Funtion",
    CommonMetricPrefix = "CommonMetricPrefix",
    Keyword = "Keyword",
    VariableName = "VariableName",
    UnicodeInput = "UnicodeInput",
    FunctionName = "FunctionName",
    DimensionName = "DimensionName",
    UnitRepresentation = "UnitRepresentation",
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct TypedCompletion {
    pub text: String,
    pub ctype: CompletionType,
}

// #[wasm_bindgen]
// #[derive(Debug, Clone, Copy)]
// pub enum FormatType {
//     Html,
// }

#[wasm_bindgen]
pub struct Numbat {
    ctx: Context,
    enable_pretty_printing: bool,
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct InterpreterOutput {
    output: String,
    #[wasm_bindgen(js_name = "isError")]
    pub is_error: bool,
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct InterpreterDetails {
    #[wasm_bindgen(js_name = "isError")]
    pub is_error: bool,
}
impl From<InterpreterOutput> for InterpreterDetails {
    fn from(details: InterpreterOutput) -> Self {
        InterpreterDetails {
            is_error: details.is_error,
        }
    }
}

#[wasm_bindgen]
impl InterpreterOutput {
    #[wasm_bindgen(getter)]
    pub fn output(&self) -> String {
        self.output.clone()
    }
}
#[derive(Debug, Clone, Error)]
pub enum KernelError {
    #[error("DOMError: {0}")]
    DOMError(String),
}

impl ErrorDiagnostic for KernelError {
    fn diagnostics(&self) -> Vec<Diagnostic> {
        vec![Diagnostic::error()]
    }
}

#[wasm_bindgen]
impl Numbat {
    pub fn new(load_prelude: bool, enable_pretty_printing: bool) -> Self {
        let mut ctx = Context::new(BuiltinModuleImporter::default());
        if load_prelude {
            match ctx.interpret("use prelude", CodeSource::Internal) {
                Ok(_) => {}
                Err(e) => {
                    console::error_1(&e.to_string().into());
                }
            }
        }
        ctx.set_terminal_width(Some(84)); // terminal width with current layout
        Numbat {
            ctx,
            enable_pretty_printing,
        }
    }

    #[wasm_bindgen]
    pub fn clone(&self) -> Numbat {
        Numbat {
            ctx: self.ctx.clone(),
            enable_pretty_printing: self.enable_pretty_printing.clone(),
        }
    }

    // #[wasm_bindgen(js_name = "setExchangeRates")]
    // pub fn set_exchange_rates(&mut self, xml_content: &str) {
    //     Context::set_exchange_rates(xml_content);
    //     let _ = self
    //         .ctx
    //         .interpret("use units::currencies", CodeSource::Internal)
    //         .unwrap();
    // }

    fn format(&self, markup: &numbat::markup::Markup, indent: bool) -> String {
        let fmt: Box<dyn Formatter> = Box::new(HtmlFormatter {});
        fmt.format(markup, indent).to_string()
    }
    #[wasm_bindgen(js_name = "interpretToNode")]
    pub fn interpret_to_node(&mut self, node: &Element, code: &str) -> InterpreterDetails {
        let document = match window().and_then(|f| f.document()) {
            Some(doc) => doc,
            None => {
                return self.print_diagnostic(
                    &KernelError::DOMError("document not found".to_string()),
                    node.to_owned(),
                );
            }
        };

        let to_be_printed: Arc<Mutex<Vec<m::Markup>>> = Arc::new(Mutex::new(vec![]));
        let to_be_printed_c = to_be_printed.clone();
        let mut settings = InterpreterSettings {
            print_fn: Box::new(move |s: &m::Markup| {
                to_be_printed_c.lock().unwrap().push(s.clone());
            }),
        };

        match self
            .ctx
            .interpret_with_settings(&mut settings, code, CodeSource::Text)
            .map_err(|b| *b)
        {
            Ok((statements, result)) => {
                let fragment: DocumentFragment = document.create_document_fragment();
                let to_be_printed = to_be_printed.lock().unwrap();
                if !to_be_printed.is_empty() {
                    let print_statements = document.create_element("div").unwrap();
                    print_statements.set_class_name("numbat-printed".as_ref());
                    for content in to_be_printed.iter() {
                        let printed = document.create_element("div").unwrap();
                        let fmt = NodeFormatter::new(printed);
                        fmt.format(content, false);
                        print_statements.append_child(&fmt.node);
                    }
                    fragment.append_child(&print_statements);
                }

                let result_markup = result.to_markup(
                    statements.last(),
                    &self.ctx.dimension_registry().clone(),
                    true,
                    true,
                );
                if (!result_markup.0.is_empty()) {
                    let result_elem = document.create_element("div").unwrap();
                    result_elem.set_class_name("numbat-result");
                    let fmt = NodeFormatter::new(result_elem);
                    fmt.format(&result_markup, false);
                    fragment.append_child(&fmt.node);
                }

                node.append_child(&fragment);
                InterpreterDetails { is_error: false }
            }
            Err(NumbatError::ResolverError(e)) => self.print_diagnostic(&e, node.to_owned()),
            Err(NumbatError::NameResolutionError(
                e @ (NameResolutionError::IdentifierClash { .. }
                | NameResolutionError::ReservedIdentifier(_)),
            )) => self.print_diagnostic(&e, node.to_owned()),
            Err(NumbatError::TypeCheckError(e)) => self.print_diagnostic(&e, node.to_owned()),
            Err(NumbatError::RuntimeError(e)) => self.print_diagnostic(&e, node.to_owned()),
        }
    }

    // pub fn interpret(&mut self, code: &str) -> InterpreterOutput {
    //     let mut output = String::new();

    //     let to_be_printed: Arc<Mutex<Vec<m::Markup>>> = Arc::new(Mutex::new(vec![]));
    //     let to_be_printed_c = to_be_printed.clone();
    //     let mut settings = InterpreterSettings {
    //         print_fn: Box::new(move |s: &m::Markup| {
    //             to_be_printed_c.lock().unwrap().push(s.clone());
    //         }),
    //     };

    //     let nl = &self.format(&numbat::markup::nl(), false);

    //     let enable_indentation = false;

    //     match self
    //         .ctx
    //         .interpret_with_settings(&mut settings, code, CodeSource::Text)
    //         .map_err(|b| *b)
    //     {
    //         Ok((statements, result)) => {
    //             // print(…) and type(…) results
    //             let to_be_printed = to_be_printed.lock().unwrap();
    //             for content in to_be_printed.iter() {
    //                 output.push_str(&self.format(content, enable_indentation));
    //                 output.push_str(nl);
    //             }

    //             let result_markup = result.to_markup(
    //                 statements.last(),
    //                 &self.ctx.dimension_registry().clone(),
    //                 true,
    //                 true,
    //             );
    //             output.push_str(&self.format(&result_markup, enable_indentation));

    //             InterpreterOutput {
    //                 output,
    //                 is_error: false,
    //             }
    //         }
    //         Err(NumbatError::ResolverError(e)) => self.print_diagnostic(&e),
    //         Err(NumbatError::NameResolutionError(
    //             e @ (NameResolutionError::IdentifierClash { .. }
    //             | NameResolutionError::ReservedIdentifier(_)),
    //         )) => self.print_diagnostic(&e),
    //         Err(NumbatError::TypeCheckError(e)) => self.print_diagnostic(&e),
    //         Err(NumbatError::RuntimeError(e)) => self.print_diagnostic(&e),
    //     }
    // }

    pub fn print_environment(&self) -> JsValue {
        self.format(&self.ctx.print_environment(), false).into()
    }

    pub fn print_functions(&self) -> JsValue {
        self.format(&self.ctx.print_functions(), false).into()
    }

    pub fn print_dimensions(&self) -> JsValue {
        self.format(&self.ctx.print_dimensions(), false).into()
    }

    pub fn print_variables(&self) -> JsValue {
        self.format(&self.ctx.print_variables(), false).into()
    }

    pub fn print_units(&self) -> JsValue {
        self.format(&self.ctx.print_units(), false).into()
    }

    pub fn help(&self) -> JsValue {
        self.format(&help_markup(), true).into()
    }

    // pub fn print_info(&mut self, keyword: &str) -> JsValue {
    //     let output = self.ctx.print_info_for_keyword(keyword);
    //     self.format(&output, true).into()
    // }

    #[wasm_bindgen(js_name = "getCompletionsFor")]
    pub fn get_completions_for(&self, input: &str) -> Vec<String> {
        // let suggestions = js_sys::Array::new();
        let completions = self
            .ctx
            .get_completions_for(input, false)
            .map(|s| s.trim().trim_end_matches('(').into())
            .collect();
        completions
    }

    #[wasm_bindgen(js_name = "getTypedCompletionsFor")]
    pub fn get_typed_completions_for(
        &self,
        word_part: &str,
        add_paren: bool,
    ) -> Vec<TypedCompletion> {
        // TODO: add proper types
        let completions = self
            .ctx
            .get_completions_for(word_part, add_paren)
            // .map(|s| s.trim().trim_end_matches('(').into())
            .map(|s| TypedCompletion {
                text: s,
                ctype: CompletionType::Unknown,
            })
            .collect();
        completions
    }

    fn print_diagnostic(&self, error: &dyn ErrorDiagnostic, node: Element) -> InterpreterDetails {
        let document = match window().and_then(|f| f.document()) {
            Some(doc) => Some(doc),
            None => {
                console::error_1(&"node formattter: no document".to_string().into());
                None
            }
        }
        .unwrap();
        use codespan_reporting::term::{self, Config};
        let error_elem = document.create_element("div").unwrap();
        error_elem.set_class_name("rechner-cell-error");
        let fmt = NodeFormatter::new(error_elem);
        node.append_child(&fmt.node);
        let mut writer: Box<dyn WriteColor> = Box::new(fmt);
        let config = Config::default();

        let resolver = self.ctx.resolver();

        for diagnostic in error.diagnostics() {
            term::emit(&mut writer, &config, &resolver.files, &diagnostic).unwrap();
        }

        InterpreterDetails { is_error: true }
    }
}
