//! Exact decimals (core.md §3) and the one amount shape (encoding.md, Shapes): the decimal strings and whole numbers the protocol writes,
//! compared, added and divided exactly at any size, with no float, no cap and no fixed-width integer that could overflow. A value outside
//! the grammar (`grammar.decimal`: no leading zero, no `+`, no exponent) is not a decimal, and every operation on it is None.
use crate::prelude::*;
use core::cmp::Ordering;

/// An exact figure (encoding.md, A sum): a signed fraction of two whole numbers in lowest terms, `num / den` (digits most significant first, no leading
/// zeros, `num` empty for zero, `den` never empty). Every figure a block signs is a decimal; a fold's sum, product or quotient of them is
/// exact, and prints as the shortest decimal where it has one, else as `n/d` (encoding.md, A sum).
#[derive(Clone, Debug, Default)]
pub struct Dec {
    neg: bool,
    num: Vec<u8>,
    den: Vec<u8>,
}

fn trim(mut d: Vec<u8>) -> Vec<u8> {
    let lead = d.iter().take_while(|x| **x == 0).count();
    d.drain(..lead);
    d
}

fn mag_cmp(a: &[u8], b: &[u8]) -> Ordering {
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

fn mag_add(a: &[u8], b: &[u8]) -> Vec<u8> {
    let (mut out, mut carry) = (Vec::with_capacity(a.len().max(b.len()) + 1), 0u8);
    let (mut i, mut j) = (a.len(), b.len());
    while i > 0 || j > 0 || carry > 0 {
        let x = if i > 0 { i -= 1; a[i] } else { 0 };
        let y = if j > 0 { j -= 1; b[j] } else { 0 };
        let s = x + y + carry;
        out.push(s % 10);
        carry = s / 10;
    }
    out.reverse();
    trim(out)
}

// a - b, with a >= b.
fn mag_sub(a: &[u8], b: &[u8]) -> Vec<u8> {
    let (mut out, mut borrow) = (Vec::with_capacity(a.len()), 0i8);
    let (mut i, mut j) = (a.len(), b.len());
    while i > 0 {
        i -= 1;
        let y = if j > 0 { j -= 1; b[j] as i8 } else { 0 };
        let mut s = a[i] as i8 - y - borrow;
        borrow = 0;
        if s < 0 {
            s += 10;
            borrow = 1;
        }
        out.push(s as u8);
    }
    out.reverse();
    trim(out)
}

fn mag_mul(a: &[u8], b: &[u8]) -> Vec<u8> {
    if a.is_empty() || b.is_empty() {
        return Vec::new();
    }
    let mut acc = vec![0u32; a.len() + b.len()];
    for (i, x) in a.iter().enumerate().rev() {
        for (j, y) in b.iter().enumerate().rev() {
            acc[i + j + 1] += (*x as u32) * (*y as u32);
        }
    }
    for k in (1..acc.len()).rev() {
        let carry = acc[k] / 10;
        acc[k] %= 10;
        acc[k - 1] += carry;
    }
    trim(acc.into_iter().map(|d| d as u8).collect())
}

fn shift(a: &[u8], places: usize) -> Vec<u8> {
    if a.is_empty() {
        return Vec::new();
    }
    let mut out = a.to_vec();
    out.extend(core::iter::repeat_n(0, places));
    out
}

// The whole part of a / b (b not zero), by long division.
fn mag_div(a: &[u8], b: &[u8]) -> Vec<u8> {
    let (mut q, mut rem): (Vec<u8>, Vec<u8>) = (Vec::with_capacity(a.len()), Vec::new());
    for d in a {
        rem.push(*d);
        rem = trim(rem);
        let mut n = 0u8;
        while mag_cmp(&rem, b) != Ordering::Less {
            rem = mag_sub(&rem, b);
            n += 1;
        }
        q.push(n);
    }
    trim(q)
}

fn digits_of(s: &str) -> Vec<u8> {
    trim(s.bytes().map(|b| b - b'0').collect())
}


// a mod b (b not zero)
fn mag_rem(a: &[u8], b: &[u8]) -> Vec<u8> {
    let q = mag_div(a, b);
    mag_sub(a, &mag_mul(&q, b))
}

fn mag_gcd(a: &[u8], b: &[u8]) -> Vec<u8> {
    let (mut x, mut y) = (trim(a.to_vec()), trim(b.to_vec()));
    while !y.is_empty() {
        let r = mag_rem(&x, &y);
        x = y;
        y = r;
    }
    x
}

fn one() -> Vec<u8> {
    vec![1]
}

impl Dec {
    fn make(neg: bool, num: Vec<u8>, den: Vec<u8>) -> Dec {
        let (num, den) = (trim(num), trim(den));
        if num.is_empty() {
            return Dec { neg: false, num, den: one() };
        }
        let g = mag_gcd(&num, &den);
        let (num, den) = if g == one() { (num, den) } else { (mag_div(&num, &g), mag_div(&den, &g)) };
        Dec { neg, num, den }
    }
    fn den(&self) -> Vec<u8> {
        if self.den.is_empty() { one() } else { self.den.clone() }
    }
    /// A decimal from JSON: a whole number within ±(2^53 - 1), or a string in `grammar.decimal`.
    pub fn of(value: Option<&Value>) -> Option<Dec> {
        match value? {
            Value::Number(n) => {
                let i = n.as_i64().filter(|i| i.unsigned_abs() <= 9_007_199_254_740_991)?;
                Some(Dec::make(i < 0, digits_of(&i.unsigned_abs().to_string()), one()))
            }
            Value::String(t) => Dec::parse(t),
            _ => None,
        }
    }
    /// A decimal from text in `grammar.decimal` (a fraction `n/d` is printed by a fold, never signed, so never read).
    pub fn parse(t: &str) -> Option<Dec> {
        if !crate::spec().is("decimal", t) {
            return None;
        }
        let (neg, body) = t.strip_prefix('-').map_or((false, t), |r| (true, r));
        let (whole, frac) = body.split_once('.').unwrap_or((body, ""));
        Some(Dec::make(neg, digits_of(&format!("{whole}{frac}")), shift(&one(), frac.len())))
    }
    pub fn zero() -> Dec {
        Dec { neg: false, num: Vec::new(), den: one() }
    }
    /// The exact order of two figures.
    pub fn cmp(&self, other: &Dec) -> Ordering {
        let (a, b) = (mag_mul(&self.num, &other.den()), mag_mul(&other.num, &self.den()));
        match (self.neg && !self.num.is_empty(), other.neg && !other.num.is_empty()) {
            (false, true) => Ordering::Greater,
            (true, false) => Ordering::Less,
            (false, false) => mag_cmp(&a, &b),
            (true, true) => mag_cmp(&b, &a),
        }
    }
    /// The exact sum.
    pub fn add(&self, other: &Dec) -> Dec {
        let den = mag_mul(&self.den(), &other.den());
        let (a, b) = (mag_mul(&self.num, &other.den()), mag_mul(&other.num, &self.den()));
        let (neg, num) = if self.neg == other.neg {
            (self.neg, mag_add(&a, &b))
        } else if mag_cmp(&a, &b) != Ordering::Less {
            (self.neg, mag_sub(&a, &b))
        } else {
            (other.neg, mag_sub(&b, &a))
        };
        Dec::make(neg, num, den)
    }
    /// The exact product.
    pub fn mul(&self, other: &Dec) -> Dec {
        Dec::make(self.neg ^ other.neg, mag_mul(&self.num, &other.num), mag_mul(&self.den(), &other.den()))
    }
    /// The exact difference.
    pub fn sub(&self, other: &Dec) -> Dec {
        self.add(&Dec { neg: !other.neg && !other.num.is_empty(), ..other.clone() })
    }
    /// Whether it has a decimal form (its lowest-terms denominator has no prime factor but 2 and 5), and that form's digits and places.
    fn decimal(&self) -> Option<(Vec<u8>, usize)> {
        let mut d = self.den();
        let (mut twos, mut fives) = (0usize, 0usize);
        let two = vec![2u8];
        let five = vec![5u8];
        while d != one() && mag_rem(&d, &two).is_empty() {
            d = mag_div(&d, &two);
            twos += 1;
        }
        while d != one() && mag_rem(&d, &five).is_empty() {
            d = mag_div(&d, &five);
            fives += 1;
        }
        if d != one() {
            return None;
        }
        let places = twos.max(fives);
        // num / den = num * (10^places / den) / 10^places
        let factor = mag_div(&shift(&one(), places), &self.den());
        Some((mag_mul(&self.num, &factor), places))
    }
    /// The one printed form of a figure (encoding.md, A sum): the shortest decimal text, of any length, where it has one (no
    /// exponent, no leading zero but a single `0` before the point, no trailing zero after it, `0` for nothing, never `-0`); else `n/d`, two
    /// whole numbers in lowest terms, which no block may sign.
    pub fn text(&self) -> String {
        if self.num.is_empty() {
            return "0".into();
        }
        let sign = if self.neg { "-" } else { "" };
        let Some((mut digits, mut scale)) = self.decimal() else {
            let t = |v: &[u8]| v.iter().map(|d| (b'0' + d) as char).collect::<String>();
            return format!("{sign}{}/{}", t(&self.num), t(&self.den()));
        };
        while scale > 0 && digits.last() == Some(&0) {
            digits.pop();
            scale -= 1;
        }
        let mut s: String = digits.iter().map(|d| (b'0' + d) as char).collect();
        if s.len() <= scale {
            s = format!("{}{s}", "0".repeat(scale + 1 - s.len()));
        }
        let (whole, frac) = s.split_at(s.len() - scale);
        if frac.is_empty() { format!("{sign}{whole}") } else { format!("{sign}{whole}.{frac}") }
    }
    /// Whether it is zero.
    pub fn is_zero(&self) -> bool {
        self.num.is_empty()
    }
    /// Whether it is above zero.
    pub fn is_pos(&self) -> bool {
        !self.neg && !self.num.is_empty()
    }
    /// The exact quotient; None only when `other` is zero (no cap; a quotient that never ends is a fraction). Nothing is rounded.
    pub fn div(&self, other: &Dec) -> Option<Dec> {
        if other.num.is_empty() {
            return None;
        }
        Some(Dec::make(self.neg ^ other.neg, mag_mul(&self.num, &other.den()), mag_mul(&self.den(), &other.num)))
    }
    /// The least whole number of steps at or above this figure, times the step (`step`): None for a step not above zero.
    pub fn up_to_step(&self, step: &Dec) -> Option<Dec> {
        if !step.is_pos() {
            return None;
        }
        let q = self.div(step)?;
        // the whole part of q, then one more where q is not whole and not negative
        let whole = Dec::make(q.neg, mag_div(&q.num, &q.den()), one());
        let n = if whole.cmp(&q) == Ordering::Less { whole.add(&Dec::make(false, one(), one())) } else { whole };
        Some(n.mul(step))
    }
}

/// An amount (encoding.md, Shapes): this much of a good, `{ value, unit }` or `{ value, unit, of }`. `value` a decimal, `unit` its author's own
/// text, `of` the id of the kind it is an amount of. Money is an amount: there is no other shape for it.
#[derive(Clone, Debug)]
pub struct Amount {
    pub value: Dec,
    pub kind: Kind,
}

/// The kind an amount is of: its `unit` text and its `of`. Two amounts are of one kind when the unit is the same text, byte for byte, and
/// `of` the same id, or neither has one. The one kind test: nothing is converted, and amounts of two kinds are never added or compared.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Kind {
    pub unit: String,
    pub of: Option<String>,
}

impl Kind {
    /// `{ unit, of }`, as a fold reports a kind (`of` null when it has none).
    pub fn json(&self) -> Value {
        json!({ "unit": self.unit, "of": self.of })
    }
    /// An amount of this kind, as a fold prints a sum: the one printed form (encoding.md, Shapes), `of` only when it has one.
    pub fn amount(&self, d: &Dec) -> Value {
        let mut m = Map::new();
        m.insert("value".into(), Value::String(d.text()));
        m.insert("unit".into(), Value::String(self.unit.clone()));
        if let Some(of) = &self.of {
            m.insert("of".into(), Value::String(of.clone()));
        }
        Value::Object(m)
    }
}

impl Amount {
    /// An amount read from a value: an object whose `value` is a decimal string and whose `unit` is text, with an optional `of` (text).
    /// None for anything else (a fold reads only what the shape check let through; it never guesses).
    pub fn of(v: Option<&Value>) -> Option<Amount> {
        let o = v?.as_object()?;
        if o.keys().any(|k| k != "value" && k != "unit" && k != "of") {
            return None;
        }
        let value = match o.get("value")? {
            Value::String(t) => Dec::parse(t)?,
            _ => return None,
        };
        let unit = o.get("unit")?.as_str()?.to_string();
        let of = match o.get("of") {
            None => None,
            Some(Value::String(t)) => Some(t.clone()),
            Some(_) => return None,
        };
        Some(Amount { value, kind: Kind { unit, of } })
    }
    /// The amount as a fold prints it.
    pub fn json(&self) -> Value {
        self.kind.amount(&self.value)
    }
}

/// Two decimals compared exactly (None when either is not one).
pub fn compare(a: Option<&Value>, b: Option<&Value>) -> Option<Ordering> {
    Some(Dec::of(a)?.cmp(&Dec::of(b)?))
}

/// The sum of decimal strings, exactly, written with no trailing zeros; None when one is not a decimal.
pub fn sum(values: &[&str]) -> Option<String> {
    let mut total = Dec::zero();
    for v in values {
        total = total.add(&Dec::parse(v)?);
    }
    Some(total.text())
}
