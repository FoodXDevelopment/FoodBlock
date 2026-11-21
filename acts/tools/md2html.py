# md2html.py: small markdown to HTML for the review page (headings, lists, tables, quotes, bold, code)
import html, re

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    return t

ITEM = re.compile(r'^(\s*)(- |\d+\. )(.*)')

def list_block(lines, i):
    """a list starting at lines[i], with the lists nested under its items by indent; returns (html, the next line)."""
    base = len(ITEM.match(lines[i]).group(1))
    tag = 'ol' if re.match(r'^\s*\d+\. ', lines[i]) else 'ul'
    items = []                                    # [text, nested html]
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '|', '>')):
        m = ITEM.match(lines[i])
        if not m:
            items[-1][0] += ' ' + lines[i].strip(); i += 1      # a line that continues the item above it
        elif len(m.group(1)) < base:
            break                                               # back out to the list this one is nested in
        elif len(m.group(1)) > base:
            nested, i = list_block(lines, i); items[-1][1] += nested
        else:
            items.append([m.group(3), '']); i += 1
    return f'<{tag}>' + ''.join(f'<li>{inline(t)}{sub}</li>' for t, sub in items) + f'</{tag}>', i

def md(src):
    out, lines, i = [], src.split('\n'), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1; continue
        m = re.match(r'^(#{1,4}) (.*)', ln)
        if m:
            n = len(m.group(1)); out.append(f'<h{n+1}>{inline(m.group(2))}</h{n+1}>'); i += 1; continue
        if ln.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells): rows.append(cells)
                i += 1
            h = '<table><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in rows[0]) + '</tr>'
            h += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows[1:])
            out.append(h + '</table>'); continue
        if ln.startswith('>'):
            q = []
            while i < len(lines) and lines[i].startswith('>'):
                q.append(lines[i].lstrip('> ')); i += 1
            out.append('<blockquote>' + inline(' '.join(q)) + '</blockquote>'); continue
        if ITEM.match(ln):
            block, i = list_block(lines, i)
            out.append(block); continue
        p = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||>|\s*- |\s*\d+\. )', lines[i]):
            p.append(lines[i].strip()); i += 1
        out.append('<p>' + inline(' '.join(p)) + '</p>')
    return '\n'.join(out)
