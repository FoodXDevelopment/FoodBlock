"""
FoodBlock Notation (FBN) — human-readable text format.

Format: @alias = type { key: value, ... } -> refRole: @target, refRole: @target

Examples:
    @farm = actor.producer { name: "Green Acres Farm" }
    @wheat = substance.ingredient { name: "Organic Wheat" } -> source: @farm
"""

import json
import re


def parse(line):
    """Parse a single FBN line into { alias, type, state, refs }."""
    line = line.strip()
    if not line or line.startswith('#') or line.startswith('//'):
        return None

    alias = None
    rest = line

    # Extract alias
    alias_match = re.match(r'^@(\w+)\s*=\s*', rest)
    if alias_match:
        alias = alias_match.group(1)
        rest = rest[alias_match.end():]

    # Extract type
    type_match = re.match(r'^([\w.]+)\s*', rest)
    if not type_match:
        raise ValueError(f'FBN: expected type in "{line}"')
    block_type = type_match.group(1)
    rest = rest[type_match.end():]

    # Extract state
    state = {}
    if rest.startswith('{'):
        brace_end = _find_closing_brace(rest, 0)
        state_str = rest[:brace_end + 1]
        state = _parse_state(state_str)
        rest = rest[brace_end + 1:].strip()

    # Extract refs
    refs = {}
    if rest.startswith('->'):
        rest = rest[2:].strip()
        refs = _parse_refs(rest)

    return {'alias': alias, 'type': block_type, 'state': state, 'refs': refs}


def parse_all(text):
    """Parse multiple lines of FBN."""
    return [b for b in (parse(line) for line in text.split('\n')) if b is not None]


def format_block(block, alias=None, alias_map=None):
    """Format a block as FBN text."""
    alias_map = alias_map or {}
    hash_to_alias = {h: name for name, h in alias_map.items()}

    line = ''
    if alias:
        line += f'@{alias} = '
    line += block['type']

    state = block.get('state', {})
    if state:
        parts = [f'{k}: {json.dumps(v)}' for k, v in state.items()]
        line += ' { ' + ', '.join(parts) + ' }'

    refs = block.get('refs', {})
    if refs:
        ref_parts = []
        for key, value in refs.items():
            if isinstance(value, list):
                items = [f'@{hash_to_alias[v]}' if v in hash_to_alias else v for v in value]
                ref_parts.append(f'{key}: [{", ".join(items)}]')
            else:
                display = f'@{hash_to_alias[value]}' if value in hash_to_alias else value
                ref_parts.append(f'{key}: {display}')
        line += ' -> ' + ', '.join(ref_parts)

    return line


def _find_closing_brace(s, start):
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            depth += 1
        if ch == '}':
            depth -= 1
            if depth == 0:
                return i
    raise ValueError('FBN: unmatched brace')


def _parse_state(s):
    # Add quotes around unquoted keys
    normalized = re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', s)
    normalized = re.sub(r',\s*}', '}', normalized)
    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        return json.loads(s)


def _parse_refs(s):
    refs = {}
    parts = _split_ref_parts(s)
    for part in parts:
        colon_idx = part.index(':') if ':' in part else -1
        if colon_idx == -1:
            continue
        key = part[:colon_idx].strip()
        value = part[colon_idx + 1:].strip()
        if value.startswith('['):
            value = value[1:-1].strip()
            refs[key] = [v.strip() for v in value.split(',')]
        else:
            refs[key] = value
    return refs


def _split_ref_parts(s):
    parts = []
    current = ''
    in_bracket = False
    for ch in s:
        if ch == '[':
            in_bracket = True
        if ch == ']':
            in_bracket = False
        if ch == ',' and not in_bracket:
            parts.append(current)
            current = ''
        else:
            current += ch
    if current.strip():
        parts.append(current)
    return parts
