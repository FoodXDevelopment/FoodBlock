//! A small backtracking regular expression engine for the grammar in protocol.json (`grammar`). The grammar is data
//! the caller may replace, so it is compiled at runtime, not written as code. It knows what the grammar uses:
//! anchors, literals, `.`, classes (`[0-9a-f]`), groups `( )`, `(?: )`, lookahead `(?= )`, alternation, and the
//! quantifiers `? * + {n} {n,} {n,m}`. Like JavaScript's `test`, a match may start anywhere.
use crate::error::{Error, Result};
use crate::prelude::*;

#[derive(Debug, Clone)]
enum Node {
    Char(char),
    Any,
    Class(Vec<(char, char)>, bool),
    Start,
    End,
    Group(Vec<Vec<Node>>),
    Ahead(Vec<Vec<Node>>),
    Repeat(Box<Node>, usize, Option<usize>),
}

#[derive(Debug, Clone)]
pub struct Regex {
    source: String,
    branches: Vec<Vec<Node>>,
}

struct Parser<'a> {
    chars: Vec<char>,
    at: usize,
    source: &'a str,
}

impl<'a> Parser<'a> {
    fn fail<T>(&self, why: &str) -> Result<T> {
        Err(Error::new(format!(
            "grammar: cannot read /{}/: {}",
            self.source, why
        )))
    }
    fn peek(&self) -> Option<char> {
        self.chars.get(self.at).copied()
    }
    fn alt(&mut self) -> Result<Vec<Vec<Node>>> {
        let mut branches = vec![self.seq()?];
        while self.peek() == Some('|') {
            self.at += 1;
            branches.push(self.seq()?);
        }
        Ok(branches)
    }
    fn seq(&mut self) -> Result<Vec<Node>> {
        let mut nodes = Vec::new();
        while let Some(c) = self.peek() {
            if c == '|' || c == ')' {
                break;
            }
            let atom = self.atom()?;
            nodes.push(self.quantified(atom)?);
        }
        Ok(nodes)
    }
    fn number(&mut self) -> Option<usize> {
        let start = self.at;
        while matches!(self.peek(), Some('0'..='9')) {
            self.at += 1;
        }
        if start == self.at {
            return None;
        }
        self.chars[start..self.at]
            .iter()
            .collect::<String>()
            .parse()
            .ok()
    }
    fn quantified(&mut self, atom: Node) -> Result<Node> {
        let (min, max) = match self.peek() {
            Some('?') => (0, Some(1)),
            Some('*') => (0, None),
            Some('+') => (1, None),
            Some('{') => {
                let save = self.at;
                self.at += 1;
                let Some(min) = self.number() else {
                    self.at = save;
                    return Ok(atom);
                };
                let max = if self.peek() == Some(',') {
                    self.at += 1;
                    self.number()
                } else {
                    Some(min)
                };
                if self.peek() != Some('}') {
                    return self.fail("an unclosed {");
                }
                (min, max)
            }
            _ => return Ok(atom),
        };
        self.at += 1;
        if matches!(atom, Node::Start | Node::End | Node::Ahead(_)) {
            return self.fail("a quantifier on an anchor");
        }
        Ok(Node::Repeat(Box::new(atom), min, max))
    }
    fn escape(&mut self) -> Result<Node> {
        let Some(c) = self.peek() else {
            return self.fail("a trailing \\");
        };
        self.at += 1;
        Ok(match c {
            'd' => Node::Class(vec![('0', '9')], false),
            'D' => Node::Class(vec![('0', '9')], true),
            'w' => Node::Class(vec![('a', 'z'), ('A', 'Z'), ('0', '9'), ('_', '_')], false),
            's' => Node::Class(vec![(' ', ' '), ('\t', '\r')], false),
            'n' => Node::Char('\n'),
            't' => Node::Char('\t'),
            other => Node::Char(other),
        })
    }
    fn class(&mut self) -> Result<Node> {
        let negated = self.peek() == Some('^');
        if negated {
            self.at += 1;
        }
        let mut ranges = Vec::new();
        loop {
            let Some(mut c) = self.peek() else {
                return self.fail("an unclosed [");
            };
            self.at += 1;
            if c == ']' && !ranges.is_empty() {
                break;
            }
            if c == '\\' {
                match self.escape()? {
                    Node::Char(e) => c = e,
                    Node::Class(r, false) => {
                        ranges.extend(r);
                        continue;
                    }
                    _ => return self.fail("a negated class inside a class"),
                }
            }
            if self.peek() == Some('-') && self.chars.get(self.at + 1).is_some_and(|n| *n != ']') {
                self.at += 1;
                let mut end = self.peek().unwrap();
                self.at += 1;
                if end == '\\' {
                    match self.escape()? {
                        Node::Char(e) => end = e,
                        _ => return self.fail("a class range ending in a class"),
                    }
                }
                ranges.push((c, end));
            } else {
                ranges.push((c, c));
            }
        }
        Ok(Node::Class(ranges, negated))
    }
    fn atom(&mut self) -> Result<Node> {
        let c = self.peek().unwrap();
        self.at += 1;
        Ok(match c {
            '^' => Node::Start,
            '$' => Node::End,
            '.' => Node::Any,
            '\\' => self.escape()?,
            '[' => self.class()?,
            '(' => {
                let ahead = if self.peek() == Some('?') {
                    self.at += 1;
                    match self.peek() {
                        Some('=') => {
                            self.at += 1;
                            true
                        }
                        Some(':') => {
                            self.at += 1;
                            false
                        }
                        _ => return self.fail("only (?: ) and (?= ) groups"),
                    }
                } else {
                    false
                };
                let inner = self.alt()?;
                if self.peek() != Some(')') {
                    return self.fail("an unclosed (");
                }
                self.at += 1;
                if ahead {
                    Node::Ahead(inner)
                } else {
                    Node::Group(inner)
                }
            }
            '*' | '+' | '?' => return self.fail("a quantifier with nothing before it"),
            other => Node::Char(other),
        })
    }
}

impl Regex {
    pub fn new(source: &str) -> Result<Regex> {
        let mut parser = Parser {
            chars: source.chars().collect(),
            at: 0,
            source,
        };
        let branches = parser.alt()?;
        if parser.at != parser.chars.len() {
            return parser.fail("an unmatched )");
        }
        Ok(Regex {
            source: source.to_string(),
            branches,
        })
    }
    pub fn source(&self) -> &str {
        &self.source
    }
    /// Whether the text matches anywhere (JavaScript `RegExp.prototype.test`).
    pub fn test(&self, text: &str) -> bool {
        let s: Vec<char> = text.chars().collect();
        (0..=s.len()).any(|start| alt(&self.branches, &s, start, &|_| true))
    }
}

fn alt(branches: &[Vec<Node>], s: &[char], i: usize, k: &dyn Fn(usize) -> bool) -> bool {
    branches.iter().any(|branch| seq(branch, s, i, k))
}
fn seq(nodes: &[Node], s: &[char], i: usize, k: &dyn Fn(usize) -> bool) -> bool {
    match nodes.split_first() {
        None => k(i),
        Some((node, rest)) => one(node, s, i, &|j| seq(rest, s, j, k)),
    }
}
fn one(node: &Node, s: &[char], i: usize, k: &dyn Fn(usize) -> bool) -> bool {
    match node {
        Node::Char(c) => s.get(i) == Some(c) && k(i + 1),
        Node::Any => s.get(i).is_some_and(|c| *c != '\n' && *c != '\r') && k(i + 1),
        Node::Class(ranges, negated) => {
            s.get(i)
                .is_some_and(|c| ranges.iter().any(|(a, b)| a <= c && c <= b) != *negated)
                && k(i + 1)
        }
        Node::Start => i == 0 && k(i),
        Node::End => i == s.len() && k(i),
        Node::Group(branches) => alt(branches, s, i, k),
        Node::Ahead(branches) => alt(branches, s, i, &|_| true) && k(i),
        Node::Repeat(inner, min, max) => repeat(inner, *min, *max, 0, s, i, k),
    }
}
fn repeat(
    node: &Node,
    min: usize,
    max: Option<usize>,
    count: usize,
    s: &[char],
    i: usize,
    k: &dyn Fn(usize) -> bool,
) -> bool {
    // Greedy: one more if allowed, else stop here once the minimum is met. A step that consumes nothing ends the loop.
    if max.is_none_or(|m| count < m)
        && one(node, s, i, &|j| {
            if j == i {
                count + 1 >= min && k(j)
            } else {
                repeat(node, min, max, count + 1, s, j, k)
            }
        })
    {
        return true;
    }
    count >= min && k(i)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_grammar() {
        let duration = Regex::new("^P(?=[0-9]|T[0-9])([0-9]+Y)?([0-9]+M)?([0-9]+W)?([0-9]+D)?(T(?=[0-9])([0-9]+H)?([0-9]+M)?([0-9]+S)?)?$").unwrap();
        for ok in ["P30D", "PT5M", "P1Y2M3DT4H5M6S", "P2W"] {
            assert!(duration.test(ok), "{ok}");
        }
        for bad in ["P", "PT", "P1DT", "30D", "P1H"] {
            assert!(!duration.test(bad), "{bad}");
        }
        let decimal = Regex::new("^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$").unwrap();
        assert!(
            decimal.test("0.8")
                && decimal.test("-12")
                && !decimal.test("007")
                && !decimal.test("1.")
                && !decimal.test("")
        );
        let confidence = Regex::new("^(0(\\.[0-9]+)?|1(\\.0+)?)$").unwrap();
        assert!(confidence.test("0.75") && confidence.test("1.00") && !confidence.test("1.5"));
        let role = Regex::new("^[0-9a-f]{64}#.+$").unwrap();
        assert!(
            role.test(&format!("{}#admin", "a".repeat(64)))
                && !role.test(&format!("{}#", "a".repeat(64)))
        );
        assert!(Regex::new("b").unwrap().test("abc"));
    }
}
