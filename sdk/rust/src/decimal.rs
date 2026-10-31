//! Exact decimals (core.md §3): the decimal strings and whole numbers the protocol writes, compared, added and divided
//! exactly at any size, with no float and no fixed-width integer that could overflow. A value outside the grammar
//! (`grammar.decimal`: no leading zero, no `+`, no exponent) is not a decimal, and every operation on it is None.
use crate::prelude::*;
use core::cmp::Ordering;

/// A decimal: its digits as one whole number (most significant first, no leading zeros, empty for zero), the number of
/// those digits after the point, and its sign.
#[derive(Clone, Debug)]
pub struct Dec {
    neg: bool,
    digits: Vec<u8>,
    scale: usize,
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

impl Dec {
    /// A decimal from JSON: a whole number within ±(2^53 - 1), or a string in `grammar.decimal`.
    pub fn of(value: Option<&Value>) -> Option<Dec> {
        match value? {
            Value::Number(n) => {
                let i = n.as_i64().filter(|i| i.unsigned_abs() <= 9_007_199_254_740_991)?;
                Some(Dec { neg: i < 0, digits: digits_of(&i.unsigned_abs().to_string()), scale: 0 })
            }
            Value::String(t) => Dec::parse(t),
            _ => None,
        }
    }
    /// A decimal from text in `grammar.decimal`.
    pub fn parse(t: &str) -> Option<Dec> {
        if !crate::spec().is("decimal", t) {
            return None;
        }
        let (neg, body) = t.strip_prefix('-').map_or((false, t), |r| (true, r));
        let (whole, frac) = body.split_once('.').unwrap_or((body, ""));
        let digits = digits_of(&format!("{whole}{frac}"));
        Some(Dec { neg: neg && !digits.is_empty(), digits, scale: frac.len() })
    }
    pub fn zero() -> Dec {
        Dec { neg: false, digits: Vec::new(), scale: 0 }
    }
    // The digits scaled up to `scale` places.
    fn at(&self, scale: usize) -> Vec<u8> {
        shift(&self.digits, scale - self.scale)
    }
    /// The exact order of two decimals.
    pub fn cmp(&self, other: &Dec) -> Ordering {
        let s = self.scale.max(other.scale);
        let (a, b) = (self.at(s), other.at(s));
        match (self.neg, other.neg) {
            (false, true) => Ordering::Greater,
            (true, false) => Ordering::Less,
            (false, false) => mag_cmp(&a, &b),
            (true, true) => mag_cmp(&b, &a),
        }
    }
    /// The exact sum.
    pub fn add(&self, other: &Dec) -> Dec {
        let s = self.scale.max(other.scale);
        let (a, b) = (self.at(s), other.at(s));
        let (neg, digits) = if self.neg == other.neg {
            (self.neg, mag_add(&a, &b))
        } else if mag_cmp(&a, &b) != Ordering::Less {
            (self.neg, mag_sub(&a, &b))
        } else {
            (other.neg, mag_sub(&b, &a))
        };
        Dec { neg: neg && !digits.is_empty(), digits, scale: s }
    }
    /// The exact product.
    pub fn mul(&self, other: &Dec) -> Dec {
        let digits = mag_mul(&self.digits, &other.digits);
        Dec { neg: (self.neg ^ other.neg) && !digits.is_empty(), digits, scale: self.scale + other.scale }
    }
    /// The exact difference.
    pub fn sub(&self, other: &Dec) -> Dec {
        self.add(&Dec { neg: !other.neg && !other.digits.is_empty(), ..other.clone() })
    }
    /// The decimal written with no trailing zeros after the point ("4", "4.25", "-0.5").
    pub fn text(&self) -> String {
        let mut digits: Vec<u8> = self.digits.clone();
        let mut scale = self.scale;
        while scale > 0 && digits.last() == Some(&0) {
            digits.pop();
            scale -= 1;
        }
        let mut s: String = digits.iter().map(|d| (b'0' + d) as char).collect();
        if s.len() <= scale {
            s = format!("{}{s}", "0".repeat(scale + 1 - s.len()));
        }
        let (whole, frac) = s.split_at(s.len() - scale);
        let sign = if self.neg && !self.digits.is_empty() { "-" } else { "" };
        if frac.is_empty() { format!("{sign}{whole}") } else { format!("{sign}{whole}.{frac}") }
    }
    /// A sum of minor units as a fold reports it: a number within ±(2^53 - 1), else its exact decimal text (a JavaScript number would
    /// round it).
    pub fn minor_json(&self) -> Value {
        let max = Dec { neg: false, digits: digits_of("9007199254740991"), scale: 0 };
        if (Dec { neg: false, ..self.clone() }).cmp(&max) == Ordering::Greater {
            Value::String(self.text())
        } else {
            self.text().parse::<i64>().map_or_else(|_| crate::js::num(self.to_f64()), Value::from)
        }
    }
    /// The nearest float, for a number a fold reports (not for comparing).
    pub fn to_f64(&self) -> f64 {
        self.text().parse::<f64>().unwrap_or(f64::NAN)
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

/// `minor` times `quantity` over `per`, rounded to the nearest whole number, halves up (toward +infinity): floor((2n + d) / 2d)
/// for the exact fraction n / d. None when a part is not a decimal or `per` is zero.
pub fn per_unit(minor: &Dec, quantity: &Dec, per: &Dec) -> Option<Dec> {
    if per.digits.is_empty() {
        return None;
    }
    // n / d = minor * (q / 10^qs) / (p / 10^ps) = minor * q * 10^ps / (p * 10^qs)
    let n = shift(&mag_mul(&minor.digits, &quantity.digits), per.scale);
    let d = shift(&per.digits, quantity.scale);
    let neg = (minor.neg ^ quantity.neg ^ per.neg) && !n.is_empty();
    let two_d = mag_add(&d, &d);
    let two_n = mag_add(&n, &n);
    let digits = if !neg {
        mag_div(&mag_add(&two_n, &d), &two_d)
    } else {
        // floor((d - 2n) / 2d) for a negative n: minus the ceiling of (2n - d) / 2d
        if mag_cmp(&two_n, &d) != Ordering::Greater {
            Vec::new()
        } else {
            let top = mag_sub(&two_n, &d);
            let q = mag_div(&top, &two_d);
            if mag_cmp(&mag_mul(&q, &two_d), &top) == Ordering::Equal { q } else { mag_add(&q, &[1]) }
        }
    };
    let negative = neg && !digits.is_empty();
    Some(Dec { neg: negative, digits, scale: 0 })
}
