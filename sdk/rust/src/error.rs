//! One error: a plain sentence saying what is wrong. A write the check refuses carries every refusal, each a code from
//! protocol.json `refusals.codes` and free text for people; an error of a known kind carries its code.
use crate::prelude::*;
use core::fmt;

/// One refusal: a code from protocol.json `refusals.codes` (it carries the meaning) and free text for people.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refusal {
    pub code: String,
    pub detail: String,
}

impl Refusal {
    pub fn new(code: impl Into<String>, detail: impl Into<String>) -> Self {
        Refusal {
            code: code.into(),
            detail: detail.into(),
        }
    }
    /// `{ code, detail }`.
    pub fn to_json(&self) -> Value {
        json!({ "code": self.code, "detail": self.detail })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub message: String,
    /// The code from protocol.json `refusals.codes`, when the error is one (`size_limit` for a sealed copy too large).
    pub code: Option<String>,
    /// Every refusal the write check gave, when it refused.
    pub refusals: Vec<Refusal>,
    /// Their details alone, in the same order.
    pub reasons: Vec<String>,
}

impl Error {
    pub fn new(message: impl Into<String>) -> Self {
        Error {
            message: message.into(),
            code: None,
            refusals: Vec::new(),
            reasons: Vec::new(),
        }
    }
    /// An error with a code from protocol.json `refusals.codes`.
    pub fn coded(code: &str, message: impl Into<String>) -> Self {
        Error {
            code: Some(code.to_string()),
            ..Error::new(message)
        }
    }
    /// A write the check refused: `write: refused: code: detail; ...`.
    pub fn refused(refusals: Vec<Refusal>) -> Self {
        Error {
            message: format!(
                "write: refused: {}",
                refusals
                    .iter()
                    .map(|r| format!("{}: {}", r.code, r.detail))
                    .collect::<Vec<_>>()
                    .join("; ")
            ),
            code: None,
            reasons: refusals.iter().map(|r| r.detail.clone()).collect(),
            refusals,
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

#[cfg(feature = "std")]
impl std::error::Error for Error {}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::new(format!("json: {e}"))
    }
}

pub type Result<T> = core::result::Result<T, Error>;
