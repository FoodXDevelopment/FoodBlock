# build_page.py: writes view/index.html, the page to read the acts, patterns and fields.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from md2html import md
from moves import moves_for, side_of, fact_tags, other_sides
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'

PAGE = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FoodOS Acts</title><style>
:root{--bg:#f7f7f4;--fg:#1d2320;--muted:#66706a;--line:#dcdfd8;--card:#fff;--acc:#2f6f4f;--accbg:#e4f0e8}
@media (prefers-color-scheme:dark){:root{--bg:#141816;--fg:#e8ece9;--muted:#9aa59f;--line:#2b322e;--card:#1c211f;--acc:#7fc9a2;--accbg:#1f3329}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}.wrap{max-width:780px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:1.7rem;margin:0 0 4px}.lede{color:var(--muted);margin:0 0 16px}
.top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
button,input{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:20px;padding:6px 14px;cursor:pointer}
input{border-radius:8px;cursor:text;flex:1;min-width:160px}button.on{background:var(--acc);border-color:var(--acc);color:var(--bg)}
.c{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px}
.c .h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.c b{font-size:1.05rem}.n{color:var(--muted);font-size:.85rem;margin-right:6px}
.card{margin:4px 0 6px;padding:8px 10px;background:var(--accbg);border-radius:8px}
.tags span{font-size:.75rem;color:var(--muted);border:1px solid var(--line);border-radius:10px;padding:0 7px;margin:0 4px 4px 0;display:inline-block}
.note{font-size:.88rem;margin-top:6px;white-space:pre-line}details{margin-top:6px;font-size:.88rem}summary{cursor:pointer;color:var(--muted)}details li{margin:4px 0}.sl{color:var(--muted)}
.doc{line-height:1.6}.doc table{border-collapse:collapse;width:100%;font-size:.9rem}.doc td,.doc th{border:1px solid var(--line);padding:5px 7px;text-align:left;vertical-align:top}
.doc blockquote{border-left:3px solid var(--acc);margin:10px 0;padding:6px 12px;background:var(--accbg)}.hide{display:none}.doc li{margin:6px 0}
.vb{font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--acc);border:1px solid var(--acc);border-radius:6px;padding:1px 6px;margin-left:8px;white-space:nowrap}</style></head><body><div class="wrap">
<h1>FoodOS Acts</h1>
<p class="lede">Every act FoodOS can read, do or suggest. Whether an act is shown is judged in the moment, from its note and the card rules. The green box is an example of the card a person would see.</p>
<div class="top"><button id="t-a" class="on">Acts</button><button id="t-p">Patterns</button><button id="t-s">Fields</button><input id="q" placeholder="Search"></div>
<div id="av"><div class="top" id="fk"><button class="on" data-k="">Any</button><button data-k="economy">Inside one plan</button><button data-k="catallaxy">Between separate plans</button></div>
<p class="lede" id="count"></p><div id="out"></div></div>
<div id="pv" class="doc hide">__PAT__</div><div id="sv" class="doc hide">__SLOTS__</div></div><script>
const D=__DATA__; let fk='';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=id=>document.getElementById(id);
document.querySelectorAll('#fk button').forEach(b=>b.onclick=()=>{fk=b.dataset.k;document.querySelectorAll('#fk button').forEach(x=>x.classList.toggle('on',x===b));render()});
function render(){const q=$('q').value.toLowerCase();
 const L=D.filter(a=>(!fk||a.side===fk)&&(!q||JSON.stringify(a).toLowerCase().includes(q)));
 $('count').textContent=L.length+' of '+D.length+' acts';
 $('out').innerHTML=L.map(a=>`<div class="c"><div class="h"><b><span class="n">${a.n}</span>${esc(a.name)}</b><span class="vb">${esc(a.verb)}</span></div>
 <div class="card">${esc(a.card)}</div><div class="tags">${a.facts.filter(Boolean).map(f=>`<span>${esc(f)}</span>`).join('')}<span>${esc(a.side)}</span>${a.mirror.length?`<span>⇄ ${a.mirror.map(esc).join(' · ')}</span>`:''}</div>
 <div class="note">${esc(a.note)}</div>
 <details><summary>${a.ex.length} examples</summary><ul>${a.ex.map(([z,f])=>`<li>${esc(z)} <span class="sl">${esc(f)}</span></li>`).join('')}</ul></details></div>`).join('');}
$('q').oninput=render;
const tabs={'t-a':'av','t-p':'pv','t-s':'sv'};
Object.keys(tabs).forEach(t=>$(t).onclick=()=>{Object.entries(tabs).forEach(([b,v])=>{$(v).classList.toggle('hide',b!==t);$(b).classList.toggle('on',b===t)})});
render();</script></body></html>'''

def page_html():
    """the page, as built now from acts.json, form.json, PATTERNS.md and FIELDS.md (check.py compares it with the committed one)."""
    acts = json.load(open(D + 'acts.json'))
    form = json.load(open(D + 'form.json'))
    data = [{'n': i, 'name': a['name'], 'verb': a['verb'], 'card': a['card'], 'side': side_of(a, form),
             'note': '[' + ' · '.join(moves_for(a, form)[1]) + '] ' + (('You do this when: ' + a['you do this when'] + ' ') if a.get('you do this when') else '') + a['note'] + (' Also called: ' + '; '.join(a['known as']) + '.' if a.get('known as') else '') + ''.join(f" Move words: {w['words']} ({' or '.join(w['moves'])})." for w in a.get('move words', [])), 'mirror': other_sides(a, acts, form),
             'facts': fact_tags(a, form, {x['name']: x for x in acts}), 'ex': [[e['card'], e['filled']] for e in a['examples']]} for i, a in enumerate(acts, 1)]
    page = PAGE
    for k, f in [('__PAT__', 'PATTERNS.md'), ('__SLOTS__', 'FIELDS.md')]:
        page = page.replace(k, md(open(D + f).read()))
    return page.replace('__DATA__', json.dumps(data, ensure_ascii=False)), len(data)

if __name__ == '__main__':
    page, n = page_html()
    open(D + 'view/index.html', 'w').write(page)
    print('built view/index.html:', n, 'acts')
