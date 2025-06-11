use codespan_reporting::term::termcolor::{self, ColorSpec};
use numbat::compact_str::CompactString;
use numbat::markup::{Markup, OutputType};
use numbat::{
    compact_str::ToCompactString,
    markup::{FormatType, FormattedString, Formatter},
};
use termcolor::{Color, WriteColor};
use wasm_bindgen::{JsValue, UnwrapThrowExt};
use web_sys::{console, window, Document, Element, Node};

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
        if let color = self {
            if color.fg() == Some(&Color::Red) {
                return Some("numbat-diagnostic-red".to_string());
            } else if color.fg() == Some(&Color::Blue) {
                return Some("numbat-diagnostic-blue".to_string());
            } else if color.bold() {
                return Some("numbat-diagnostic-bold".to_string());
            } else {
                return None;
            }
        } else {
            return None;
        }
    }
}

pub struct NodeFormatter {
    color: Option<termcolor::ColorSpec>,
    pub node: Element,
    doc: Option<Document>,
}

impl Formatter for NodeFormatter {
    fn format_part(&self, part: &FormattedString) -> CompactString {
        part.2.to_compact_string()
    }
    fn format(&self, markup: &Markup, indent: bool) -> CompactString {
        let mut output = CompactString::with_capacity(markup.0.len());

        for part in &markup.0 {
            let formatted = self.format_part(&part);
            let span = self.doc.as_ref().unwrap().create_element("span").unwrap();
            span.set_text_content(Some(formatted.to_string().as_ref()));
            span.set_class_name(part.1.cssclass().unwrap_or_default().as_ref());
            self.node.append_child(&span);
        }
        output
    }
}

impl NodeFormatter {
    pub fn new(node: Element) -> Self {
        let document = match window().and_then(|f| f.document()) {
            Some(doc) => Some(doc),
            None => {
                console::error_1(&"node formattter: no document".to_string().into());
                None
            }
        };
        NodeFormatter {
            color: None,
            node: node,
            doc: document,
        }
    }
}

impl std::io::Write for NodeFormatter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let text = String::from_utf8_lossy(buf);
        let colored = self.doc.as_ref().unwrap().create_element("span").unwrap();
        colored.set_text_content(Some(text.as_ref()));
        match &self.color {
            Some(c) => {
                colored.set_class_name(c.cssclass().unwrap_or_default().as_ref());
            }
            None => {}
        }
        self.node.append_child(&colored);
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
