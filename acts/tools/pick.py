# pick.py: finds which act a moment is by closed questions (form.json `questions`), never by guessing from free text.
# Each answer keeps the acts whose facts fit it; the next question is the one whose answers split what is left most evenly.
# Jev answers each question from what it sees; she is asked only when it cannot tell. Usage: python3 tools/pick.py
# 'which way=out' 'who is in it=others' prints the shortlist and the next question.
import json, math, os, sys
from collections import Counter

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'

def values(a, fact_name):
    v = a.get(fact_name)
    return set(v) if isinstance(v, list) else {v}

def shortlist(acts, answers):
    """the acts whose facts fit every answer so far (a fact the act does not say is not a fit)."""
    return [a for a in acts if all(v in values(a, k) for k, v in answers.items())]

def next_question(acts, answers, form):
    """the unasked fact whose answers split the shortlist most evenly, or None when one act is left or nothing splits."""
    best, gain = None, 0.0
    for k, q in form['questions'].items():
        if k == 'about' or k in answers or len(acts) < 2: continue
        c = Counter(v for a in acts for v in values(a, k) if v in q['answers'])
        n = sum(c.values())
        h = -sum(x / n * math.log2(x / n) for x in c.values()) if n else 0.0
        if h > gain: best, gain = k, h
    return best

if __name__ == '__main__':
    acts, form = json.load(open(D + 'acts.json')), json.load(open(D + 'form.json'))
    answers = dict(x.split('=', 1) for x in sys.argv[1:])
    left = shortlist(acts, answers)
    print(f'{len(left)} acts fit:', ', '.join(a['name'] for a in left[:25]) + (' ...' if len(left) > 25 else ''))
    k = next_question(left, answers, form)
    if k: print(f'next: {form["questions"][k]["question"]}', {v: t for v, t in form['questions'][k]['answers'].items()})
