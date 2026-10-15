"""The few JavaScript meanings the reference SDK leans on, so this SDK reads blocks exactly as it does: what counts as
true, strict equality, Number() of a string, String() of a value, and ISO time arithmetic in UTC (Date.parse and
toISOString). Internal; not part of the API."""

import math
import re


def truthy(value):
    """JavaScript truthiness: None, False, 0, NaN and '' are false; everything else (an empty list or dict too) is true."""
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0 and value == value
    if isinstance(value, str):
        return value != ""
    return True


def is_int(value):
    """Number.isInteger: a finite number with no fraction (never a boolean)."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value) and value.is_integer()


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def strict_eq(a, b):
    """===: numbers by value, strings and booleans by value, None as itself; objects and lists never (no shared identity)."""
    if isinstance(a, (dict, list)) or isinstance(b, (dict, list)):
        return a is b
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if is_number(a) and is_number(b):
        return a == b
    if is_number(a) or is_number(b):
        return False
    return a == b


def number(value):
    """Number(value): a number for a numeric string, NaN otherwise."""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if is_number(value):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return 0.0
        if re.fullmatch(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?", text):
            return float(text)
        if re.fullmatch(r"[+-]?Infinity", text):
            return -math.inf if text.startswith("-") else math.inf
        return math.nan
    if value is None:
        return math.nan
    return math.nan


def string(value):
    """String(value)."""
    from .canonical import _canonical_number
    if value is None:
        return "undefined"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if is_number(value):
        if isinstance(value, float) and math.isnan(value):
            return "NaN"
        if isinstance(value, float) and math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return _canonical_number(value)
    if isinstance(value, list):
        return ",".join("" if item is None else string(item) for item in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def round_half_up(value):
    """Math.round."""
    return int(math.floor(value + 0.5))


# ---- Times: Date.parse of the ISO forms, and toISOString ----
_ISO = re.compile(r"([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?"
                  r"(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?")


def _days_from_civil(y, m, d):
    y -= m <= 2
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def _civil_from_days(z):
    z += 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + (3 if mp < 10 else -9)
    return y + (m <= 2), m, d


def parse_ms(text):
    """Date.parse for the ISO forms (UTC when no offset is given): milliseconds since 1970, or None."""
    if not isinstance(text, str):
        return None
    found = _ISO.fullmatch(text)
    if not found:
        return None
    y, mo, d, h, mi, s, frac, zone = found.groups()
    year, month, day = int(y), int(mo or 1), int(d or 1)
    hour, minute, second = int(h or 0), int(mi or 0), int(s or 0)
    ms = int((frac or "0")[:3].ljust(3, "0"))
    if not (1 <= month <= 12 and 1 <= day <= 31 and minute < 60 and second < 60):
        return None
    if hour > 24 or (hour == 24 and (minute or second or ms)):
        return None
    total = ((_days_from_civil(year, month, 1) + day - 1) * 86400 + hour * 3600 + minute * 60 + second) * 1000 + ms
    if zone and zone != "Z":
        sign = 1 if zone[0] == "+" else -1
        total -= sign * (int(zone[1:3]) * 60 + int(zone[4:6])) * 60000
    return total


def iso(ms):
    """toISOString: YYYY-MM-DDTHH:MM:SS.sssZ in UTC."""
    days, rest = divmod(int(ms), 86400000)
    y, m, d = _civil_from_days(days)
    seconds, millis = divmod(rest, 1000)
    year = f"{y:04d}" if 0 <= y <= 9999 else (f"+{y:06d}" if y > 0 else f"-{-y:06d}")
    return f"{year}-{m:02d}-{d:02d}T{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}.{millis:03d}Z"


def parts(ms):
    """(year, month index from 0, day, milliseconds into the day) of a time, in UTC."""
    days, rest = divmod(int(ms), 86400000)
    y, m, d = _civil_from_days(days)
    return y, m - 1, d, rest


def make_ms(year, month_index, day, rest):
    """setUTCFullYear(year, month, day) at the same time of day: months and days overflow as in JavaScript."""
    year += month_index // 12
    month_index %= 12
    return (_days_from_civil(year, month_index + 1, 1) + day - 1) * 86400000 + rest


def now_iso():
    import time
    return iso(int(time.time() * 1000))
