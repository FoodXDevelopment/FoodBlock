//! Times and durations (protocol.md, Encoding). A time is UTC ISO 8601 with milliseconds; a duration is ISO 8601
//! (`P30D`). Durations add months and years by the UTC calendar (a day past a month's end rolls over, as JavaScript's
//! `setUTCFullYear` does). A time or date must be a real calendar value (protocol.md, Encoding: no 30 February, no
//! hour 24), so every SDK agrees on which are valid.
use crate::prelude::*;

const DAY_MS: i64 = 86_400_000;

/// Days since 1970-01-01 of a proleptic Gregorian date (month 1..12, any day: it rolls over).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = month;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468 + (day - 1)
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn digits(s: &[u8], at: usize, n: usize) -> Option<i64> {
    let part = s.get(at..at + n)?;
    if !part.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(
        part.iter()
            .fold(0i64, |acc, d| acc * 10 + (d - b'0') as i64),
    )
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Milliseconds since the epoch of ISO text: `YYYY-MM-DD`, or with `THH:MM`, `:SS`, `.sss` and a zone (`Z` or
/// `±HH:MM`). None unless it is a real calendar value. Text without a zone is read as UTC.
pub fn parse(text: &str) -> Option<i64> {
    let s = text.as_bytes();
    let (year, mut at) = match s.first()? {
        b'+' | b'-' => {
            let y = digits(s, 1, 6)?;
            if s[0] == b'-' && y == 0 {
                return None;
            }
            (if s[0] == b'-' { -y } else { y }, 7)
        }
        _ => (digits(s, 0, 4)?, 4),
    };
    let (mut month, mut day) = (1, 1);
    if s.get(at) == Some(&b'-') {
        month = digits(s, at + 1, 2)?;
        at += 3;
        if s.get(at) == Some(&b'-') {
            day = digits(s, at + 1, 2)?;
            at += 3;
        }
    }
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    let (mut hour, mut minute, mut second, mut ms, mut offset) = (0, 0, 0, 0, 0);
    if at < s.len() {
        if s[at] != b'T' && s[at] != b't' {
            return None;
        }
        hour = digits(s, at + 1, 2)?;
        if s.get(at + 3) != Some(&b':') {
            return None;
        }
        minute = digits(s, at + 4, 2)?;
        at += 6;
        if s.get(at) == Some(&b':') {
            second = digits(s, at + 1, 2)?;
            at += 3;
            if s.get(at) == Some(&b'.') {
                let start = at + 1;
                let mut end = start;
                while end < s.len() && s[end].is_ascii_digit() {
                    end += 1;
                }
                if end == start {
                    return None;
                }
                let frac = &text[start..end];
                let three: String = frac
                    .chars()
                    .chain(core::iter::repeat('0'))
                    .take(3)
                    .collect();
                ms = three.parse::<i64>().ok()?;
                at = end;
            }
        }
        match s.get(at) {
            None => {}
            Some(b'Z') | Some(b'z') if at + 1 == s.len() => {}
            Some(sign @ (b'+' | b'-')) => {
                let oh = digits(s, at + 1, 2)?;
                if s.get(at + 3) != Some(&b':') || at + 6 != s.len() {
                    return None;
                }
                let om = digits(s, at + 4, 2)?;
                if oh > 23 || om > 59 {
                    return None;
                }
                offset = (oh * 60 + om) * 60_000 * if *sign == b'+' { 1 } else { -1 };
            }
            _ => return None,
        }
        if hour > 23 || minute > 59 || second > 59 {
            return None;
        }
    }
    let days = days_from_civil(year, month, day);
    let t = days * DAY_MS + hour * 3_600_000 + minute * 60_000 + second * 1000 + ms - offset;
    if t.abs() > 8_640_000_000_000_000 {
        return None;
    }
    Some(t)
}

/// A time as `Date.prototype.toISOString` writes it.
pub fn iso(ms: i64) -> String {
    let days = ms.div_euclid(DAY_MS);
    let rest = ms.rem_euclid(DAY_MS);
    let (y, m, d) = civil_from_days(days);
    let year = if (0..=9999).contains(&y) {
        format!("{y:04}")
    } else if y < 0 {
        format!("-{:06}", -y)
    } else {
        format!("+{y:06}")
    };
    format!(
        "{year}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        rest / 3_600_000,
        rest / 60_000 % 60,
        rest / 1000 % 60,
        rest % 1000
    )
}

/// Now, on this device's clock (std only).
#[cfg(all(feature = "std", not(all(feature = "wasm", target_arch = "wasm32"))))]
pub fn now() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    iso(ms)
}

/// Now, on the host's clock (the WebAssembly build has none of its own).
#[cfg(all(feature = "std", feature = "wasm", target_arch = "wasm32"))]
pub fn now() -> String {
    iso(crate::wasm::now_ms())
}

/// The parts of an ISO 8601 duration: years, months, days (weeks as 7), and the time part in ms.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Duration {
    pub years: i64,
    pub months: i64,
    pub days: i64,
    pub ms: i64,
}

/// Read a duration that the grammar's `duration` rule accepts.
pub fn parse_duration(text: &str) -> Option<Duration> {
    if !crate::spec().is("duration", text) {
        return None;
    }
    let mut d = Duration {
        years: 0,
        months: 0,
        days: 0,
        ms: 0,
    };
    let mut number: i64 = 0;
    let mut in_time = false;
    for c in text.chars().skip(1) {
        match c {
            '0'..='9' => {
                number = number
                    .saturating_mul(10)
                    .saturating_add(c as i64 - '0' as i64)
            }
            'T' => in_time = true,
            'Y' => d.years = number,
            'M' if !in_time => d.months = number,
            'W' => d.days += number * 7,
            'D' => d.days += number,
            'H' => d.ms += number * 3_600_000,
            'M' => d.ms += number * 60_000,
            'S' => d.ms += number * 1000,
            _ => return None,
        }
        if !c.is_ascii_digit() {
            number = 0;
        }
    }
    Some(d)
}

/// A time moved by a duration (`sign` -1 goes back), months and years by the UTC calendar, as JavaScript's
/// `setUTCFullYear(y, m, d)` does: a day past the month's end rolls over.
pub fn add_duration(time: &str, duration: &str, sign: i64) -> Option<String> {
    let parts = parse_duration(duration)?;
    let t = parse(time)?;
    let days = t.div_euclid(DAY_MS);
    let in_day = t.rem_euclid(DAY_MS);
    let (y, m, d) = civil_from_days(days);
    let month0 = (m - 1) + sign * parts.months;
    let year = y + sign * parts.years + month0.div_euclid(12);
    let month = month0.rem_euclid(12) + 1;
    let day_number = days_from_civil(year, month, 1) + (d - 1) + sign * parts.days;
    let moved = day_number * DAY_MS + in_day + sign * parts.ms;
    if moved.abs() > 8_640_000_000_000_000 {
        return None;
    }
    Some(iso(moved))
}

/// Two durations compared by adding both to one instant (protocol.md §7): -1, 0 or 1, or None if either cannot be read.
pub fn compare_durations(a: &str, b: &str, from: &str) -> Option<i32> {
    let x = parse(&add_duration(from, a, 1)?)?;
    let y = parse(&add_duration(from, b, 1)?)?;
    Some((x - y).signum() as i32)
}

/// A UTC time exactly `YYYY-MM-DDTHH:MM:SS.sssZ` that `Date.parse` reads.
pub fn is_time(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::String(s)) if crate::spec().is("time", s) && parse(s).is_some())
}
/// A date `YYYY-MM-DD` that `Date.parse` reads.
pub fn is_date(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::String(s)) if crate::spec().is("date", s) && parse(s).is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_calendar_values() {
        assert_eq!(parse("2026-02-30T00:00:00.000Z"), None);
        assert_eq!(parse("2026-02-29"), None);
        assert!(parse("2024-02-29").is_some());
        assert_eq!(parse("2026-01-01T24:00:00.000Z"), None);
        assert_eq!(parse("2026-13-01T00:00:00.000Z"), None);
        assert_eq!(parse("2026-01-00T00:00:00.000Z"), None);
        assert_eq!(parse("2026-10-15T09:00:00.000Z"), Some(1_792_054_800_000));
        assert_eq!(
            add_duration("2026-01-31T00:00:00.000Z", "P1M", 1).as_deref(),
            Some("2026-03-03T00:00:00.000Z")
        );
        assert_eq!(
            add_duration("2026-10-02T00:00:00.000Z", "P7D", 1).as_deref(),
            Some("2026-10-09T00:00:00.000Z")
        );
        assert_eq!(
            add_duration("2026-03-31T00:00:00.000Z", "P1M", -1).as_deref(),
            Some("2026-03-03T00:00:00.000Z")
        );
        assert_eq!(
            compare_durations("P1M", "P30D", "2026-01-01T00:00:00.000Z"),
            Some(1)
        );
    }
}
