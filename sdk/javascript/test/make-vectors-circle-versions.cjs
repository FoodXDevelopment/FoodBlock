// Adds to spec/vectors.json the cases of circle versions (circles.md, Versions; folds.md, circle_versions): a rule change is a new version of the
// same circle; a member is on a version by signing it, or by a founding line letting a stated count of the members move that rule.
// `node test/make-vectors-circle-versions.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Every expectation is written here by hand
// from the spec text and checked against the Rust core; the oracle then checks the file.
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { door, check, story } = kit

const ROLES = [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: [] }]
// a club of four: ann founds it, the others join by her member grant and their own accept
function club(tag, change) {
  const s = story(), ann = s.person(tag + 'Ann'), bo = s.person(tag + 'Bo'), cy = s.person(tag + 'Cy'), di = s.person(tag + 'Di')
  const base = { kind: 'circle', name: 'Club', roles: ROLES, removal: { needed: 1 }, ...(change ? { change } : {}) }
  const c = s.say(ann, 'actor', base)
  for (const p of [bo, cy, di]) {
    const g = s.say(ann, 'grant', { kind: 'member', roles: ['mem'] }, { subject: c.hash, to: p.id, as: c.hash })
    s.say(p, 'grant', { status: 'accepted', kind: 'member' }, { answers: g.hash, subject: c.hash })
  }
  const version = (who, parent, patch) => s.say(who, 'actor', { ...base, ...patch }, { updates: parent.hash })
  const accept = (who, v) => s.say(who, 'observe', { status: 'accepted' }, { answers: v.hash, after: [v.hash] })
  return { s, ann, bo, cy, di, c, base, version, accept }
}
const rows = (c, list) => list.map(([v, updates, author, changed, count]) => ({ version: v.hash, updates: updates ? updates.hash : null, author: author.id, changed, count })).sort((a, b) => (a.version < b.version ? -1 : 1))
const ask = (name, w, expect) => door(name, 'circle_versions', [w.c.hash, w.s.held], { expect, exact: true })

// ---- a founding line: 3 of the 4 may change the removal rule ----
{
  const w = club('cv1', [{ rule: 'removal', needed: 3 }]), { ann, bo, cy, di, c } = w
  const v1 = w.version(ann, c, { removal: { needed: 2 } })
  ask('versions: a version signed only by its author moves only its author; the founding line is not yet reached', w, {
    circle: c.hash,
    versions: rows(w, [[c, null, ann, [], 4], [v1, c, ann, ['removal'], 1]]),
    members: { [ann.id]: v1.hash, [bo.id]: c.hash, [cy.id]: c.hash, [di.id]: c.hash },
    rules: { removal: { needed: 3, versions: [{ version: v1.hash, count: 1, carried: false }], members: { [ann.id]: v1.hash, [bo.id]: c.hash, [cy.id]: c.hash, [di.id]: c.hash } } }
  })
  w.accept(bo, v1)
  w.accept(cy, v1)
  ask('versions: when 3 of the 4 are on a version that changes the rule, the fourth reads that rule from it, and stays on the old version', w, {
    circle: c.hash,
    versions: rows(w, [[c, null, ann, [], 4], [v1, c, ann, ['removal'], 3]]),
    members: { [ann.id]: v1.hash, [bo.id]: v1.hash, [cy.id]: v1.hash, [di.id]: c.hash },
    rules: { removal: { needed: 3, versions: [{ version: v1.hash, count: 3, carried: true }], members: { [ann.id]: v1.hash, [bo.id]: v1.hash, [cy.id]: v1.hash, [di.id]: v1.hash } } }
  })
  door('versions: circle_state is unchanged by versions: the roles and members are as founded', 'circle_state', [c.hash, w.s.held], { expect: { founder: ann.id, members: { [di.id]: { roles: ['mem'] }, [ann.id]: { roles: ['boss'] } } } })
  // a version that updates V1 and changes another rule: those who signed it are on it; the removal rule it keeps; the count of V1 includes it
  const v2 = w.version(bo, v1, { removal: { needed: 2 }, needed: { sign: 2 } })
  const got = door('versions: signing a later version covers the earlier one it is built on', 'circle_versions', [c.hash, w.s.held], {
    expect: {
      members: { [ann.id]: v1.hash, [bo.id]: v2.hash, [cy.id]: v1.hash, [di.id]: c.hash },
      rules: { needed: { needed: null, members: { [bo.id]: v2.hash, [ann.id]: v1.hash, [cy.id]: v1.hash, [di.id]: c.hash } }, removal: { needed: 3, versions: [{ version: v1.hash, count: 3, carried: true }] } }
    }
  })
  void got
}

// ---- a founding silent on the rule: only signers move ----
{
  const w = club('cv2', null), { ann, bo, cy, di, c } = w
  const v1 = w.version(ann, c, { needed: { sign: 2 } })
  w.accept(bo, v1); w.accept(cy, v1); w.accept(di, v1)
  ask('versions: a founding block silent on a rule moves only those who sign: all four signed, so all four are on the version', w, {
    circle: c.hash,
    versions: rows(w, [[c, null, ann, [], 4], [v1, c, ann, ['needed'], 4]]),
    members: { [ann.id]: v1.hash, [bo.id]: v1.hash, [cy.id]: v1.hash, [di.id]: v1.hash },
    rules: { needed: { needed: null, versions: [{ version: v1.hash, count: 4, carried: false }], members: { [ann.id]: v1.hash, [bo.id]: v1.hash, [cy.id]: v1.hash, [di.id]: v1.hash } } }
  })
  const w2 = club('cv2b', null)
  const u1 = w2.version(w2.ann, w2.c, { needed: { sign: 2 } })
  w2.accept(w2.bo, u1); w2.accept(w2.cy, u1)
  ask('versions: a founding block silent on a rule: three of four signed and the fourth stays on the old version', w2, {
    circle: w2.c.hash,
    versions: rows(w2, [[w2.c, null, w2.ann, [], 4], [u1, w2.c, w2.ann, ['needed'], 3]]),
    members: { [w2.ann.id]: u1.hash, [w2.bo.id]: u1.hash, [w2.cy.id]: u1.hash, [w2.di.id]: w2.c.hash },
    rules: { needed: { needed: null, versions: [{ version: u1.hash, count: 3, carried: false }], members: { [w2.ann.id]: u1.hash, [w2.bo.id]: u1.hash, [w2.cy.id]: u1.hash, [w2.di.id]: w2.c.hash } } }
  })
}

// ---- a count by share, and a fork ----
{
  const w = club('cv3', [{ rule: 'removal', needed: { of_members: '1/2' } }]), { ann, bo, cy, di, c } = w
  const v1 = w.version(ann, c, { removal: { needed: 2 } }), v2 = w.version(bo, c, { removal: { needed: 3 } })
  w.accept(cy, v1); w.accept(di, v2)
  ask('versions: two versions of one block that both reach the count (a half of 4 is 2) move no one else: a fork', w, {
    circle: c.hash,
    versions: rows(w, [[c, null, ann, [], 4], [v1, c, ann, ['removal'], 2], [v2, c, bo, ['removal'], 2]]),
    members: { [ann.id]: v1.hash, [bo.id]: v2.hash, [cy.id]: v1.hash, [di.id]: v2.hash },
    rules: { removal: { needed: 2, versions: [{ version: v1.hash, count: 2, carried: true }, { version: v2.hash, count: 2, carried: true }].sort((a, b) => (a.version < b.version ? -1 : 1)), members: { [ann.id]: v1.hash, [bo.id]: v2.hash, [cy.id]: v1.hash, [di.id]: v2.hash } } }
  })
  // with `all` the line needs every member
  const a = club('cv3a', [{ rule: 'removal', needed: 'all' }])
  const av = a.version(a.ann, a.c, { removal: { needed: 2 } })
  a.accept(a.bo, av); a.accept(a.cy, av)
  door('versions: a line of all needs every member: three of four is not enough', 'circle_versions', [a.c.hash, a.s.held], { expect: { rules: { removal: { needed: 4, versions: [{ version: av.hash, count: 3, carried: false }] } }, members: { [a.di.id]: a.c.hash } } })
}

// ---- what counts for nothing ----
{
  const w = club('cv4', [{ rule: 'removal', needed: 1 }]), { ann, c } = w
  const out = w.s.person('cv4Out')
  w.s.say(out, 'actor', { ...w.base, removal: { needed: 5 } }, { updates: c.hash })
  ask('versions: a version by one who is no member counts for nothing', w, {
    circle: c.hash, versions: rows(w, [[c, null, ann, [], 4]]),
    members: { [ann.id]: c.hash, [w.bo.id]: c.hash, [w.cy.id]: c.hash, [w.di.id]: c.hash }, rules: {}
  })
  door('versions: a block that is not a founding block of a circle has no versions', 'circle_versions', [w.s.held[w.s.held.length - 1].hash, w.s.held], { expect: null, exact: true })
}

// ---- the founding line's shape ----
{
  const base = { kind: 'circle', name: 'Club', roles: ROLES }
  check('versions: a founding line names each rule once', { type: 'actor', state: { ...base, change: [{ rule: 'removal', needed: 2 }, { rule: 'removal', needed: 3 }] } }, ['shape'])
  check('versions: a founding line needs a count by Counts', { type: 'actor', state: { ...base, change: [{ rule: 'removal', needed: 0 }] } }, ['shape'])
  check('versions: a founding line with a count and a rule is well formed', { type: 'actor', state: { ...base, change: [{ rule: 'removal', needed: { of_members: '7/10' } }, { rule: 'needed', needed: 'all' }] } }, [])
}

// ---- the other folds read the circle's current version (circles.md, Versions: The circle's rules as they stand) ----
// a member grant of 'mem' carries no power in the founding block; the founding line lets 3 of the 4 change `roles`. Once a version that gives 'mem'
// the power `sign` is carried, every member reads it, so di (who signed nothing) signs for the circle. `may_act_as` reads a block's own causal past.
{
  const w = club('cv9', [{ rule: 'roles', needed: 3 }]), { ann, bo, cy, di, c } = w
  const signing = [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: ['sign'] }]
  const as = (who, after) => w.s.say(who, 'observe', { kind: 'note' }, { as: c.hash }, after ? { after } : {})
  const speaks = (name, b, expect) => door(name, 'may_act_as', [b, c.hash, w.s.held, null], { expect, exact: true })
  const early = as(di)
  speaks('versions: before any version, a member whose role carries no sign does not speak for the circle', early, false)
  const v1 = w.version(ann, c, { roles: signing })
  const mid = as(di, [v1.hash])
  speaks('versions: a version signed only by its author carries nothing: the circle\'s roles are still the founding block\'s', mid, false)
  const a1 = w.accept(bo, v1), a2 = w.accept(cy, v1)
  const late = as(di, [a1.hash, a2.hash])
  speaks('versions: three of the four are on a version that changes `roles`: a block that has seen it reads the new roles, though its author signed nothing', late, true)
  speaks('versions: a block whose causal past holds none of the acceptances reads the roles as they stood', early, false)
  door('versions: circle_state reads the circle\'s current roles too: the members are the same, the powers are the new roles\'', 'circle_state', [c.hash, w.s.held], { expect: { members: { [di.id]: { roles: ['mem'] } } } })

  // rivals: two versions that change the same rule from the founding block, each reaching the count, move no one
  const r = club('cv10', [{ rule: 'roles', needed: 3 }])
  const rv1 = r.version(r.ann, r.c, { roles: signing }), rv2 = r.version(r.ann, r.c, { roles: [{ name: 'boss', powers: ['sign', 'admit', 'remove'] }, { name: 'mem', powers: ['sign', 'admit'] }] })
  const acc = [r.accept(r.bo, rv1), r.accept(r.cy, rv1), r.accept(r.bo, rv2), r.accept(r.cy, rv2)]
  const rb = r.s.say(r.di, 'observe', { kind: 'note' }, { as: r.c.hash }, { after: acc.map((a) => a.hash) })
  door('versions: two carried versions of one rule that neither builds on the other are rivals: the rule stays where the founding block has it', 'may_act_as', [rb, r.c.hash, r.s.held, null], { expect: false, exact: true })

  // many hands read the current `needed`: with v1 carried (needed.sign 2) ann's block alone does not speak; a later carried version built on it that asks 1 does
  const n = club('cv11', [{ rule: 'needed', needed: 3 }])
  const nv1 = n.version(n.ann, n.c, { needed: { sign: 2 } })
  const n1 = [n.accept(n.bo, nv1), n.accept(n.cy, nv1)]
  const na = n.s.say(n.ann, 'observe', { kind: 'note' }, { as: n.c.hash }, { after: n1.map((a) => a.hash) })
  door('versions: a carried `needed.sign` of 2 is read by many hands: one holder\'s signature no longer speaks', 'may_act_as', [na, n.c.hash, n.s.held, null], { expect: false, exact: true })
  const nv2 = n.version(n.ann, nv1, { needed: { sign: 1 } })
  const n2 = [n.accept(n.bo, nv2), n.accept(n.cy, nv2)]
  const nb = n.s.say(n.ann, 'observe', { kind: 'note' }, { as: n.c.hash }, { after: [...n1, ...n2].map((a) => a.hash) })
  door('versions: a carried version built on an earlier carried one wins the rule: needed.sign 1 stands, though v1 asked for 2', 'may_act_as', [nb, n.c.hash, n.s.held, null], { expect: true, exact: true })
}

vectorsFile.save(V, tags)
