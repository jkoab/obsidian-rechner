use numbat::{
    compact_str::ToCompactString,
    markup::{FormatType, FormattedString, Formatter},
};

use codespan_reporting::term::termcolor;
use termcolor::{Color, WriteColor};
use wasm_bindgen::JsValue;
use web_sys::{console, Element};

trait CSSClass {
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

pub struct NodeFormatter {
    color: Option<termcolor::ColorSpec>,
    pub node: Element,
}

impl Formatter for NodeFormatter {
    fn format_part(&self, part: &FormattedString) -> numbat::compact_str::CompactString {
        self.node
            .insert_adjacent_text("beforeend", part.2.clone().as_ref());
        part.2.to_compact_string()
    }
}

impl NodeFormatter {
    pub fn new(node: Element) -> Self {
        NodeFormatter {
            color: None,
            node: node,
        }
    }
}

impl std::io::Write for NodeFormatter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let text: String = String::from_utf8_lossy(buf).into();
        self.node.insert_adjacent_text("beforeend", text.as_str());
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
