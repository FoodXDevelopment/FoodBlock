//! The occurrences of a calendar repeat (promises.md, Terms: `repeat`, `zone`): an RFC 5545 RRULE counted from the start of
//! `state.when` and read in `terms.zone` by the IANA time zone database, release `TZDB`, bundled so every core reads the same wall clock.
//! An occurrence is named by its start time, in UTC, as `time::iso` writes it. A wall time that does not exist (the clock jumped over
//! it) falls where the offset before the jump puts it; one that happens twice is its first. What this core cannot read it refuses
//! (a part it does not know, another calendar): it never guesses.
use crate::prelude::*;
use crate::time;
use jiff::civil::{Date, DateTime, Weekday};
use jiff::tz::TimeZone;
use jiff::{Span, Timestamp};

/// The IANA time zone database release bundled (jiff-tzdb, pinned in Cargo.toml and Cargo.lock).
pub const TZDB: &str = "2026e";

#[derive(Clone, Copy, PartialEq)]
enum Freq {
    Secondly,
    Minutely,
    Hourly,
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

enum Until {
    Utc(i64),
    Local(DateTime),
}

struct Rule {
    freq: Freq,
    interval: i64,
    count: Option<u64>,
    until: Option<Until>,
    month: Vec<i64>,
    monthday: Vec<i64>,
    yearday: Vec<i64>,
    day: Vec<(Option<i64>, Weekday)>,
    hour: Vec<i64>,
    minute: Vec<i64>,
    second: Vec<i64>,
    setpos: Vec<i64>,
    wkst: Weekday,
}

fn weekday(s: &str) -> Option<Weekday> {
    Some(match s {
        "MO" => Weekday::Monday,
        "TU" => Weekday::Tuesday,
        "WE" => Weekday::Wednesday,
        "TH" => Weekday::Thursday,
        "FR" => Weekday::Friday,
        "SA" => Weekday::Saturday,
        "SU" => Weekday::Sunday,
        _ => return None,
    })
}

fn ints(key: &str, v: &str, lo: i64, hi: i64, signed: bool) -> Result<Vec<i64>, String> {
    v.split(',')
        .map(|x| {
            let n: i64 = x.parse().map_err(|_| format!("{key} is a list of whole numbers"))?;
            if n < lo || n > hi || (n == 0 && signed) || (!signed && n < 0) {
                return Err(format!("{key} {n} is out of range"));
            }
            Ok(n)
        })
        .collect()
}

fn until(v: &str, tz: &TimeZone) -> Result<Until, String> {
    let bad = || "UNTIL is a date (YYYYMMDD) or a date and time (YYYYMMDDTHHMMSS, with Z for UTC)".to_string();
    let num = |a: usize, b: usize| v.get(a..b).and_then(|x| x.parse::<i64>().ok()).ok_or_else(bad);
    if v.len() == 8 {
        let d = Date::new(num(0, 4)? as i16, num(4, 6)? as i8, num(6, 8)? as i8).map_err(|_| bad())?;
        return Ok(Until::Local(d.at(23, 59, 59, 999_999_999)));
    }
    if (v.len() == 15 || v.len() == 16) && &v[8..9] == "T" {
        let d = DateTime::new(num(0, 4)? as i16, num(4, 6)? as i8, num(6, 8)? as i8, num(9, 11)? as i8, num(11, 13)? as i8, num(13, 15)? as i8, 0).map_err(|_| bad())?;
        if v.len() == 16 {
            if &v[15..] != "Z" {
                return Err(bad());
            }
            return Ok(Until::Utc(UTC.to_ambiguous_timestamp(d).compatible().map_err(|e| e.to_string())?.as_millisecond()));
        }
        let _ = tz;
        return Ok(Until::Local(d));
    }
    Err(bad())
}

const UTC: TimeZone = TimeZone::UTC;

fn parse(repeat: &str, tz: &TimeZone) -> Result<Rule, String> {
    let mut r = Rule {
        freq: Freq::Daily,
        interval: 1,
        count: None,
        until: None,
        month: vec![],
        monthday: vec![],
        yearday: vec![],
        day: vec![],
        hour: vec![],
        minute: vec![],
        second: vec![],
        setpos: vec![],
        wkst: Weekday::Monday,
    };
    let mut seen: Vec<&str> = vec![];
    let mut have_freq = false;
    for (i, part) in repeat.split(';').enumerate() {
        let (k, v) = part.split_once('=').ok_or_else(|| "a repeat is parts KEY=VALUE".to_string())?;
        if seen.contains(&k) {
            return Err(format!("the part {k} is given twice"));
        }
        seen.push(k);
        match k {
            "RSCALE" if i == 0 => {
                if v != "GREGORIAN" {
                    return Err(format!("this core reads the Gregorian calendar only, not RSCALE={v}"));
                }
            }
            "SKIP" => {
                if v != "OMIT" {
                    return Err("SKIP other than OMIT is not read".into());
                }
            }
            "FREQ" => {
                have_freq = true;
                r.freq = match v {
                    "SECONDLY" => Freq::Secondly,
                    "MINUTELY" => Freq::Minutely,
                    "HOURLY" => Freq::Hourly,
                    "DAILY" => Freq::Daily,
                    "WEEKLY" => Freq::Weekly,
                    "MONTHLY" => Freq::Monthly,
                    "YEARLY" => Freq::Yearly,
                    _ => return Err(format!("FREQ {v} is not a frequency")),
                }
            }
            "INTERVAL" => r.interval = v.parse::<i64>().ok().filter(|n| *n >= 1 && *n <= 1_000_000).ok_or("INTERVAL is a whole number from 1")?,
            "COUNT" => r.count = Some(v.parse::<u64>().ok().filter(|n| *n >= 1).ok_or("COUNT is a whole number from 1")?),
            "UNTIL" => r.until = Some(until(v, tz)?),
            "BYMONTH" => r.month = ints(k, v, 1, 12, true)?,
            "BYMONTHDAY" => r.monthday = ints(k, v, -31, 31, true)?,
            "BYYEARDAY" => r.yearday = ints(k, v, -366, 366, true)?,
            "BYHOUR" => r.hour = ints(k, v, 0, 23, false)?,
            "BYMINUTE" => r.minute = ints(k, v, 0, 59, false)?,
            "BYSECOND" => r.second = ints(k, v, 0, 59, false)?,
            "BYSETPOS" => r.setpos = ints(k, v, -366, 366, true)?,
            "WKST" => r.wkst = weekday(v).ok_or("WKST is MO to SU")?,
            "BYDAY" => {
                for x in v.split(',') {
                    if x.len() < 2 || !x.is_char_boundary(x.len() - 2) {
                        return Err("BYDAY is weekdays MO to SU, each with an optional whole number before it".into());
                    }
                    let (n, d) = x.split_at(x.len() - 2);
                    let wd = weekday(d).ok_or("BYDAY is weekdays MO to SU")?;
                    let n = if n.is_empty() { None } else { Some(n.parse::<i64>().ok().filter(|n| *n != 0 && n.abs() <= 53).ok_or("a BYDAY number is from 1 to 53, or from -1 to -53")?) };
                    r.day.push((n, wd));
                }
            }
            _ => return Err(format!("the part {k} is not read by this core")),
        }
    }
    if !have_freq {
        return Err("a repeat has exactly one FREQ".into());
    }
    if r.count.is_some() && r.until.is_some() {
        return Err("COUNT and UNTIL are never both given (RFC 5545)".into());
    }
    let sub = matches!(r.freq, Freq::Secondly | Freq::Minutely | Freq::Hourly);
    if r.day.iter().any(|(n, _)| n.is_some()) && !matches!(r.freq, Freq::Monthly | Freq::Yearly) {
        return Err("a BYDAY number is for MONTHLY and YEARLY".into());
    }
    if sub && !r.setpos.is_empty() {
        return Err("BYSETPOS is not read beside a frequency under a day".into());
    }
    Ok(r)
}

fn local(tz: &TimeZone, ms: i64) -> Result<DateTime, String> {
    Ok(tz.to_datetime(Timestamp::from_millisecond(ms).map_err(|e| e.to_string())?))
}

fn resolve(tz: &TimeZone, d: DateTime) -> Result<i64, String> {
    Ok(tz.to_ambiguous_timestamp(d).compatible().map_err(|e| e.to_string())?.as_millisecond())
}

fn add_days(d: Date, n: i64) -> Result<Date, String> {
    d.checked_add(Span::new().days(n)).map_err(|e| e.to_string())
}

fn wd_index(w: Weekday) -> i64 {
    w.to_monday_zero_offset() as i64
}

/// Does this date pass the rule's day filters, with the rule's defaults from the start?
fn passes(r: &Rule, d: Date, start: Date) -> bool {
    let (ym, yy) = (d.days_in_month() as i64, d.days_in_year() as i64);
    if !r.month.is_empty() && !r.month.contains(&(d.month() as i64)) {
        return false;
    }
    if !r.yearday.is_empty() && !r.yearday.iter().any(|n| *n == d.day_of_year() as i64 || *n == d.day_of_year() as i64 - yy - 1) {
        return false;
    }
    if !r.monthday.is_empty() && !r.monthday.iter().any(|n| *n == d.day() as i64 || *n == d.day() as i64 - ym - 1) {
        return false;
    }
    if !r.day.is_empty() {
        let in_month = r.freq == Freq::Monthly || !r.month.is_empty();
        let (pos, size) = if in_month { (d.day() as i64, ym) } else { (d.day_of_year() as i64, yy) };
        let ok = r.day.iter().any(|(n, w)| {
            *w == d.weekday()
                && match n {
                    None => true,
                    Some(n) if *n > 0 => (pos - 1) / 7 + 1 == *n,
                    Some(n) => -((size - pos) / 7 + 1) == *n,
                }
        });
        if !ok {
            return false;
        }
    }
    let has_day = !r.monthday.is_empty() || !r.day.is_empty() || !r.yearday.is_empty();
    match r.freq {
        Freq::Weekly if r.day.is_empty() => d.weekday() == start.weekday(),
        Freq::Monthly if !has_day => d.day() == start.day(),
        Freq::Yearly if !has_day => d.day() == start.day() && (!r.month.is_empty() || d.month() == start.month()),
        _ => true,
    }
}

/// The occurrences `from <= start < to` (UTC milliseconds) of the repeat counted from `when`, read in `zone`, as UTC times.
pub fn occurrences(when: &str, repeat: &str, zone: &str, from: i64, to: i64) -> Result<Vec<String>, String> {
    let tz = TimeZone::get(zone).map_err(|_| format!("the time zone {zone} is not in the IANA database (release {TZDB})"))?;
    let rule = parse(repeat, &tz)?;
    let start_ms = time::parse(when).ok_or("the start of the promise (state.when) is a time")?;
    let start = local(&tz, start_ms)?;
    let start_date = start.date();
    let mut out: Vec<String> = vec![];
    let mut counted: u64 = 0;
    let mut work: u64 = 0;
    // one candidate: false stops the whole reading
    let mut take = |dt: DateTime, ms: i64, counted: &mut u64| -> Result<bool, String> {
        if dt < start {
            return Ok(true);
        }
        match &rule.until {
            Some(Until::Utc(u)) if ms > *u => return Ok(false),
            Some(Until::Local(u)) if dt > *u => return Ok(false),
            _ => {}
        }
        if ms >= to {
            return Ok(false);
        }
        *counted += 1;
        if ms >= from {
            out.push(time::iso(ms));
        }
        Ok(rule.count.is_none_or(|c| *counted < c))
    };
    let sub = match rule.freq {
        Freq::Secondly => Some(1000),
        Freq::Minutely => Some(60_000),
        Freq::Hourly => Some(3_600_000),
        _ => None,
    };
    if let Some(unit) = sub {
        let step = unit * rule.interval;
        let mut n: i64 = if rule.count.is_none() && from > start_ms { ((from - start_ms) / step - 1).max(0) } else { 0 };
        loop {
            work += 1;
            if work > 5_000_000 {
                return Err("too many steps from the start: give a later `from`, or a COUNT-free repeat".into());
            }
            let ms = start_ms + n * step;
            if ms >= to {
                break;
            }
            let dt = local(&tz, ms)?;
            let d = dt.date();
            let ok = passes_limit(&rule, d, &dt);
            if ok && !take(dt, ms, &mut counted)? {
                break;
            }
            n += 1;
        }
        return Ok(out);
    }
    let from_date = local(&tz, from.min(to))?.date();
    let months_between = |a: Date, b: Date| (b.year() as i64 - a.year() as i64) * 12 + b.month() as i64 - a.month() as i64;
    let skip = rule.count.is_none() && from_date > start_date;
    let mut k: i64 = if !skip {
        0
    } else {
        let n = match rule.freq {
            Freq::Daily => (from_date - start_date).get_days() as i64 / rule.interval,
            Freq::Weekly => (from_date - start_date).get_days() as i64 / 7 / rule.interval,
            Freq::Monthly => months_between(start_date, from_date) / rule.interval,
            _ => (from_date.year() as i64 - start_date.year() as i64) / rule.interval,
        };
        (n - 1).max(0)
    };
    let week0 = add_days(start_date, -((wd_index(start_date.weekday()) - wd_index(rule.wkst)).rem_euclid(7)))?;
    loop {
        work += 1;
        if work > 5_000_000 {
            return Err("too many periods from the start".into());
        }
        // the days of this period
        let (first, len) = match rule.freq {
            Freq::Daily => (add_days(start_date, k * rule.interval)?, 1),
            Freq::Weekly => (add_days(week0, 7 * k * rule.interval)?, 7),
            Freq::Monthly => {
                let m = start_date.month() as i64 - 1 + k * rule.interval;
                let y = start_date.year() as i64 + m.div_euclid(12);
                if y > 9998 {
                    break;
                }
                let d = Date::new(y as i16, (m.rem_euclid(12) + 1) as i8, 1).map_err(|e| e.to_string())?;
                (d, d.days_in_month() as i64)
            }
            _ => {
                let y = start_date.year() as i64 + k * rule.interval;
                if y > 9998 {
                    break;
                }
                let d = Date::new(y as i16, 1, 1).map_err(|e| e.to_string())?;
                (d, d.days_in_year() as i64)
            }
        };
        // past the end: stop (a day of margin for the zone)
        if resolve(&tz, first.at(0, 0, 0, 0)).map(|t| t >= to + 86_400_000).unwrap_or(true) {
            break;
        }
        let hours: Vec<i64> = if rule.hour.is_empty() { vec![start.hour() as i64] } else { rule.hour.clone() };
        let minutes: Vec<i64> = if rule.minute.is_empty() { vec![start.minute() as i64] } else { rule.minute.clone() };
        let seconds: Vec<i64> = if rule.second.is_empty() { vec![start.second() as i64] } else { rule.second.clone() };
        let mut set: Vec<DateTime> = vec![];
        for i in 0..len {
            let d = add_days(first, i)?;
            if !passes(&rule, d, start_date) {
                continue;
            }
            for h in &hours {
                for m in &minutes {
                    for s in &seconds {
                        set.push(d.at(*h as i8, *m as i8, *s as i8, start.subsec_nanosecond()));
                    }
                }
            }
        }
        set.sort();
        set.dedup();
        if !rule.setpos.is_empty() {
            let n = set.len() as i64;
            let mut keep: Vec<DateTime> = rule.setpos.iter().filter_map(|p| {
                let i = if *p > 0 { *p - 1 } else { n + *p };
                if i >= 0 && i < n { Some(set[i as usize]) } else { None }
            }).collect();
            keep.sort();
            keep.dedup();
            set = keep;
        }
        for dt in set {
            let ms = resolve(&tz, dt)?;
            if !take(dt, ms, &mut counted)? {
                return Ok(out);
            }
        }
        k += 1;
    }
    Ok(out)
}

/// Under a day, the filters limit: a step counts only if its local date and time pass.
fn passes_limit(r: &Rule, d: Date, dt: &DateTime) -> bool {
    (r.month.is_empty() || r.month.contains(&(d.month() as i64)))
        && (r.yearday.is_empty() || r.yearday.iter().any(|n| *n == d.day_of_year() as i64 || *n == d.day_of_year() as i64 - d.days_in_year() as i64 - 1))
        && (r.monthday.is_empty() || r.monthday.iter().any(|n| *n == d.day() as i64 || *n == d.day() as i64 - d.days_in_month() as i64 - 1))
        && (r.day.is_empty() || r.day.iter().any(|(_, w)| *w == d.weekday()))
        && (r.hour.is_empty() || r.hour.contains(&(dt.hour() as i64)))
        && (r.minute.is_empty() || r.minute.contains(&(dt.minute() as i64)))
        && (r.second.is_empty() || r.second.contains(&(dt.second() as i64)))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn at(s: &str) -> i64 {
        time::parse(s).unwrap()
    }
    #[test]
    fn database_release_is_the_one_named() {
        assert_eq!(jiff_tzdb::VERSION, Some(TZDB));
    }
    #[test]
    fn a_weekly_london_repeat_keeps_the_wall_clock_through_the_change() {
        // Tuesdays 09:00 London, from 2026-03-17: the clocks go forward on Sunday 29 March 2026
        let o = occurrences("2026-03-17T09:00:00.000Z", "FREQ=WEEKLY;BYDAY=TU", "Europe/London", at("2026-03-17T00:00:00Z"), at("2026-04-08T00:00:00Z")).unwrap();
        assert_eq!(o, ["2026-03-17T09:00:00.000Z", "2026-03-24T09:00:00.000Z", "2026-03-31T08:00:00.000Z", "2026-04-07T08:00:00.000Z"]);
    }
}
