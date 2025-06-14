use std::io::ErrorKind;

use codespan_reporting::term::termcolor::{self, ColorSpec};
use numbat::compact_str::CompactString;
use numbat::markup::Markup;
use numbat::{
    compact_str::ToCompactString,
    markup::{FormatType, FormattedString, Formatter},
};
use termcolor::{Color, WriteColor};
use wasm_bindgen::JsValue;
use web_sys::{window, Document, Element};

pub trait CSSClass {
    fn cssclass(&self) -> Option<String>;
}
impl CSSClass for FormatType {
    fn cssclass(&self) -> Option<String> {
        let name = match self {
            // TODO: None?
            FormatType::Whitespace => Some("whitespace"),
            FormatType::Emphasized => Some("emphasized"),
            FormatType::Dimmed => Some("dimmed"),
            // TODO: None?
            FormatType::Text => Some("text"),
            FormatType::String => Some("string"),
            FormatType::Keyword => Some("keyword"),
            FormatType::Value => Some("value"),
            FormatType::Unit => Some("unit"),
            FormatType::Identifier => Some("identifier"),
            FormatType::TypeIdentifier => Some("type-identifier"),
            FormatType::Operator => Some("operator"),
            FormatType::Decorator => Some("decorator"),
        };
        match name {
            Some(name) => Some(format!("numbat-{}", name)),
            None => None,
        }
    }
}

impl CSSClass for ColorSpec {
    fn cssclass(&self) -> Option<String> {
        if self.fg() == Some(&Color::Red) {
            return Some("numbat-diagnostic-red".to_string());
        } else if self.fg() == Some(&Color::Blue) {
            return Some("numbat-diagnostic-blue".to_string());
        } else if self.bold() {
            return Some("numbat-diagnostic-bold".to_string());
        } else {
            return None;
        }
    }
}

pub trait DOMOutput: WriteColor {
    fn output(&self) -> &Element;
}

pub struct NodeFormatter {
    color: Option<termcolor::ColorSpec>,
    pub node: Element,
    document: Document,
}

impl DOMOutput for NodeFormatter {
    fn output(&self) -> &Element {
        return self.node.as_ref();
    }
}

impl Formatter for NodeFormatter {
    fn format_part(&self, part: &FormattedString) -> CompactString {
        part.2.to_compact_string()
    }
    fn format(&self, markup: &Markup, _: bool) -> CompactString {
        let output = CompactString::with_capacity(markup.0.len());

        for part in &markup.0 {
            let formatted = self.format_part(&part);
            let span = self.document.create_element("span").unwrap();
            span.set_text_content(Some(formatted.to_string().as_ref()));
            span.set_class_name(part.1.cssclass().unwrap_or_default().as_ref());
            self.node.append_child(&span).unwrap();
        }
        output
    }
}

impl NodeFormatter {
    pub fn new(node: Element) -> Self {
        let document = window()
            .and_then(|f| f.document())
            .expect("no document found");
        NodeFormatter {
            color: None,
            node: node,
            document: document,
        }
    }
}

#[inline]
pub fn js_to_io(err: JsValue) -> std::io::Error {
    let msg = err.as_string().unwrap_or_else(|| format!("{:?}", err));
    std::io::Error::new(ErrorKind::Other, msg)
}

impl std::io::Write for NodeFormatter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let text = String::from_utf8_lossy(buf);
        let colored = self.document.create_element("span").map_err(js_to_io)?;

        if let Some(c) = &self.color {
            if let Some(clasz) = c.cssclass() {
                colored.set_class_name(clasz.as_ref());
            }
        };

        colored.set_text_content(Some(text.as_ref()));
        self.node.append_child(&colored).map_err(js_to_io)?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl WriteColor for NodeFormatter {
    fn supports_color(&self) -> bool {
        true
    }

    fn set_color(&mut self, spec: &termcolor::ColorSpec) -> std::io::Result<()> {
        self.color = Some(spec.clone());
        Ok(())
    }

    fn reset(&mut self) -> std::io::Result<()> {
        self.color = None;
        Ok(())
    }
}
