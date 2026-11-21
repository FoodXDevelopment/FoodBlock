# notes.py: reads an act's note by its one fixed form (PATTERNS.md, "Each act says what it is kept apart from"): what you
# do, "Kept apart from A (why); B (why); and C (why).", then "It usually starts when ...". The note stays one text for
# people; the acts it is kept apart from are read from it as links, checked to be acts in the library.

def _top(s, sep=';'):
    """split on sep outside brackets."""
    out, depth, cur = [], 0, ''
    for ch in s:
        depth += (ch == '(') - (ch == ')')
        if ch == sep and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    return out + [cur]

def note_parts(note):
    """{'does', 'apart from': [act names], 'starts when'}, or None when the note is not in the fixed form."""
    i, j = note.find('Kept apart from '), note.find('It usually starts when ')
    if i < 0 or j < i: return None
    names = []
    for p in _top(note[i + len('Kept apart from '):j].strip().rstrip('.')):
        p = p.strip()
        if p.startswith('and '): p = p[4:]
        names.append(p.split(' (')[0].strip().rstrip(','))
    return {'does': note[:i].strip(), 'apart from': [n for n in names if n], 'starts when': note[j + len('It usually starts when '):].strip()}
