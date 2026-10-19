------------------------------ MODULE FoodBlock ------------------------------
(* FoodBlock 1.6: what a node takes in, refuses, holds back and folds.

   One honest node per element of Nodes. A node is pushed small batches of blocks, in any order.
   It models, for the three independent parts of the protocol that carry authority:
     - identity   : key chains, equivocation, rotation, conflict, recovery rotation   (identity.md, nodes.md)
     - consent    : YES / STOP, consent follows the principal; a block sent despite a STOP is kept and read as stopped (consent.md)
     - allocation : an open offer, bound only by the orderer's own allocation          (promises.md, folds.md)
   and, for all of them, authority dependencies that wait like `prev` (core.md check 5; `needs`).

   The block table T is generated from tools/tla/check.py (python3 tools/tla/check.py --emit-tla), the
   same universe the exhaustive Python checker explores. Check one part at a time by setting Active in
   the .cfg (the parts share no block, so the whole is their interleaving).

   Run: python3 tools/tla/run-tlc.py (downloads a pinned tla2tools.jar into tools/tla/.cache/, checks each .cfg, then
   each deliberate bug in Mut, which TLC must catch). check.py explores the same machine in seconds. *)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Nodes,    \* honest nodes
          Active,   \* the blocks of the part being checked (a subset of DOMAIN T)
          Mut       \* "none" for the protocol as written; otherwise one deliberate bug that some invariant must catch:
                   \*   "refuse_stop" | "judge_by_store" | "nonorderer_binds" | "overbind"  (the same names as check.py --mutate)

T ==
  ("Xg" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("x1" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "plain", prev |-> "Xg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("x2" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "plain", prev |-> "x1", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("x2f" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "plain", prev |-> "x1", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ROT" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "keygrant", prev |-> "x2", counted_to |-> "x1", under |-> "none", answers |-> "none", replaces |-> "gX", newkey |-> "kX2", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ROT2" :> [comp |-> "identity", author |-> "X", key |-> "gX", kind |-> "keygrant", prev |-> "x2", counted_to |-> "x1", under |-> "none", answers |-> "none", replaces |-> "gX", newkey |-> "kX4", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("y1" :> [comp |-> "identity", author |-> "X", key |-> "kX2", kind |-> "plain", prev |-> "ROT", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("y2" :> [comp |-> "identity", author |-> "X", key |-> "kX4", kind |-> "plain", prev |-> "ROT2", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("REC" :> [comp |-> "identity", author |-> "X", key |-> "rX", kind |-> "keygrant", prev |-> "Xg", counted_to |-> "Xg", under |-> "none", answers |-> "none", replaces |-> "gX", newkey |-> "kX3", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> TRUE]) @@
  ("z1" :> [comp |-> "identity", author |-> "X", key |-> "kX3", kind |-> "plain", prev |-> "REC", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("PR" :> [comp |-> "identity", author |-> "X", key |-> "rX", kind |-> "plain", prev |-> "REC", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("FR" :> [comp |-> "identity", author |-> "X", key |-> "kE", kind |-> "keygrant", prev |-> "x1", counted_to |-> "x1", under |-> "none", answers |-> "none", replaces |-> "gX", newkey |-> "kE", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Pg" :> [comp |-> "consent", author |-> "P", key |-> "kP", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Qg" :> [comp |-> "consent", author |-> "Q", key |-> "kQ", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Ag" :> [comp |-> "consent", author |-> "A", key |-> "kA", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Rg" :> [comp |-> "consent", author |-> "R", key |-> "kR", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Zg" :> [comp |-> "consent", author |-> "Z", key |-> "kZ", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("GR" :> [comp |-> "consent", author |-> "Q", key |-> "kQ", kind |-> "grant", prev |-> "Qg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ASK" :> [comp |-> "consent", author |-> "A", key |-> "kA", kind |-> "ask", prev |-> "Ag", counted_to |-> "none", under |-> "GR", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ASK2" :> [comp |-> "consent", author |-> "A", key |-> "kA", kind |-> "ask", prev |-> "ASK", counted_to |-> "none", under |-> "GR", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ASK0" :> [comp |-> "consent", author |-> "Q", key |-> "kQ", kind |-> "ask", prev |-> "YESq", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("YESq" :> [comp |-> "consent", author |-> "Q", key |-> "kQ", kind |-> "consent", prev |-> "GR", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "yes", subject |-> "Q", person |-> "P", q |-> "none", recovery |-> FALSE]) @@
  ("STOP" :> [comp |-> "consent", author |-> "P", key |-> "kP", kind |-> "consent", prev |-> "Pg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "stop", subject |-> "Q", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("YES" :> [comp |-> "consent", author |-> "P", key |-> "kP", kind |-> "consent", prev |-> "STOP", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "yes", subject |-> "Q", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("STOPR" :> [comp |-> "consent", author |-> "R", key |-> "kR", kind |-> "consent", prev |-> "Rg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "stop", subject |-> "R", person |-> "P", q |-> "none", recovery |-> FALSE]) @@
  ("ASKR" :> [comp |-> "consent", author |-> "R", key |-> "kR", kind |-> "ask", prev |-> "STOPR", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ASKR2" :> [comp |-> "consent", author |-> "R", key |-> "kR", kind |-> "plain", prev |-> "ASKR", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("ASKZ" :> [comp |-> "consent", author |-> "Z", key |-> "kZ", kind |-> "ask", prev |-> "Zg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("Sg" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("B1g" :> [comp |-> "allocation", author |-> "B1", key |-> "kB1", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("B2g" :> [comp |-> "allocation", author |-> "B2", key |-> "kB2", kind |-> "genesis", prev |-> "none", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("O" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "offer", prev |-> "Sg", counted_to |-> "none", under |-> "none", answers |-> "none", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 2, recovery |-> FALSE]) @@
  ("A1" :> [comp |-> "allocation", author |-> "B1", key |-> "kB1", kind |-> "accept", prev |-> "B1g", counted_to |-> "none", under |-> "none", answers |-> "O", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("A2" :> [comp |-> "allocation", author |-> "B2", key |-> "kB2", kind |-> "accept", prev |-> "B2g", counted_to |-> "none", under |-> "none", answers |-> "O", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> "none", recovery |-> FALSE]) @@
  ("AL1" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "alloc", prev |-> "O", counted_to |-> "none", under |-> "none", answers |-> "A1", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 1, recovery |-> FALSE]) @@
  ("AL2" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "alloc", prev |-> "AL1", counted_to |-> "none", under |-> "none", answers |-> "A2", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 1, recovery |-> FALSE]) @@
  ("AL2f" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "alloc", prev |-> "AL1", counted_to |-> "none", under |-> "none", answers |-> "A2", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 1, recovery |-> FALSE]) @@
  ("AL3" :> [comp |-> "allocation", author |-> "S", key |-> "kS", kind |-> "alloc", prev |-> "AL2", counted_to |-> "none", under |-> "none", answers |-> "A1", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 1, recovery |-> FALSE]) @@
  ("FAKE" :> [comp |-> "allocation", author |-> "B1", key |-> "kB1", kind |-> "alloc", prev |-> "A1", counted_to |-> "none", under |-> "none", answers |-> "A1", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 2, recovery |-> FALSE]) @@
  ("BADS" :> [comp |-> "allocation", author |-> "S", key |-> "kB2", kind |-> "alloc", prev |-> "O", counted_to |-> "none", under |-> "none", answers |-> "A1", replaces |-> "none", newkey |-> "none", word |-> "none", subject |-> "none", person |-> "none", q |-> 1, recovery |-> FALSE])

Geneses == {b \in DOMAIN T : T[b].kind = "genesis"}

\* ---------------------------------------------------------------- dependencies and past
Needs(b) == {T[b].prev, T[b].counted_to, T[b].under, T[b].answers} \ {"none"}

RECURSIVE Close(_)
Close(X) == LET Y == X \cup UNION {Needs(c) : c \in X} IN IF Y = X THEN X ELSE Close(Y)
Past(b) == Close(Needs(b))           \* causal past: everything the block rests on

RECURSIVE AncChain(_, _)             \* i and its ancestors along prev, while the key stays the same
AncChain(i, k) == IF i = "none" \/ T[i].key # k THEN {} ELSE {i} \cup AncChain(T[i].prev, k)

\* ---------------------------------------------------------------- equivocation (core.md inv. 3)
PairMembers(S) == {b \in S : T[b].kind # "genesis" /\
                     \E c \in S : c # b /\ T[c].key = T[b].key /\ T[c].prev = T[b].prev}
Equivocated(S) == {b \in S : AncChain(b, T[b].key) \cap PairMembers(S) # {}}   \* both blocks and every later block of the key

\* ---------------------------------------------------------------- identity fold (identity.md)
RecKey == "rX"
KG(S) == {b \in S : T[b].kind = "keygrant"}
Rots(S, K) == {b \in KG(S) : T[b].replaces = K}
CutSet(S, K) == LET F == {AncChain(T[r].counted_to, K) : r \in Rots(S, K)}   \* their intersection (F is never empty where used)
                IN {x \in UNION F : \A s \in F : x \in s}
Void(S, b) == LET K == T[b].key IN
                /\ Rots(S, K) # {}
                /\ b \notin CutSet(S, K)
                /\ ~(T[b].kind = "keygrant" /\ T[b].replaces = K)        \* a rotation stands even after counted_to
Crossing(S) == {T[r].newkey : r \in {r2 \in KG(S) : T[r2].replaces # "none" /\ ~T[r2].recovery /\
                                       Cardinality(Rots(S, T[r2].replaces)) >= 2}}
RECURSIVE FrozenFrom(_, _)
FrozenFrom(S, F) == LET G == F \cup {T[b].newkey : b \in {c \in KG(S) : T[c].key \in F}} IN
                    IF G = F THEN F ELSE FrozenFrom(S, G)
Frozen(S) == FrozenFrom(S, Crossing(S))
RECURSIVE KeysFrom(_, _)
KeysFrom(S, K) ==
  LET N == K \cup {T[b].newkey : b \in {c \in KG(S) : (T[c].key \in K \/ (T[c].recovery /\ T[c].key = RecKey))
                                                      /\ ~Void(S, c) /\ T[c].newkey # "none"}}
  IN IF N = K THEN K ELSE KeysFrom(S, N)
Keys(S) == KeysFrom(S, {"gX"})
Counted(S) ==
  {b \in S \ Geneses :
      /\ T[b].key \notin Frozen(S)
      /\ ~Void(S, b)
      /\ (b \notin Equivocated(S) \/ (T[b].kind = "keygrant" /\ b \in PairMembers(S)))   \* the identity fold keeps forked grants
      /\ (T[b].key \in Keys(S) \/ (T[b].recovery /\ T[b].kind = "keygrant"))}
IdFold(S) == <<Counted(S), Keys(S), Frozen(S)>>

IdJudge(b, S) ==       \* depends on b and its causal past only (no arrival, no clock)
  LET P == IF Mut = "judge_by_store" THEN S ELSE Past(b) \cup Geneses     \* the bug: judge by everything held
      k == T[b].key
  IN IF Mut = "judge_by_store" /\ Void(S, b) THEN "void_key"       \* the bug: refuse by what is held, not by what b rests on
     ELSE IF k = RecKey /\ T[b].kind # "keygrant" THEN "recovery_scope"
     ELSE IF k # RecKey /\ k \notin Keys(P) THEN "bad_signature"
     ELSE IF T[b].kind = "keygrant" /\ T[b].replaces # "none" /\ k # T[b].replaces /\ k # RecKey THEN "not_own_rotation"
     ELSE IF ~(T[T[b].prev].key = k \/ T[T[b].prev].newkey = k \/ (k = RecKey /\ T[T[b].prev].kind = "genesis")) THEN "chain"
     ELSE "ok"

\* ---------------------------------------------------------------- consent fold (consent.md)
Principals(a) == {T[a].author} \cup (IF T[a].under = "none" THEN {} ELSE {T[T[a].under].author})
Applies(c, a) == /\ T[c].kind = "consent"
                 /\ (IF T[c].person = "none" THEN T[c].author ELSE T[c].person) = "P"
                 /\ (T[c].subject = "none" \/ T[c].subject \in Principals(a))
                 /\ (T[c].author = "P" \/ T[c].author \in Principals(a))       \* a recorder binds only its own side
LiveStop(a, S) ==
  \E c \in S : /\ Applies(c, a) /\ T[c].word = "stop"
               /\ ~\E y \in S : /\ Applies(y, a) /\ T[y].word = "yes" /\ T[y].author = "P"
                                /\ c \in Past(y)                          \* only the person lifts, knowing of the stop
ConsentFold(S) == {<<a, LiveStop(a, S)>> : a \in {x \in S : T[x].kind = "ask"}}

\* What the spec says, written by hand for this universe (the oracle the invariants compare with).
Oracle(a, S) == IF a \in {"ASK", "ASK0", "ASK2"} THEN "STOP" \in S /\ "YES" \notin S
                ELSE IF a = "ASKR" THEN "STOPR" \in S
                ELSE FALSE

\* ---------------------------------------------------------------- allocation fold (promises.md, folds.md)
Cap == T["O"].q
RECURSIVE Chain(_, _, _)
Chain(S, cur, total) ==
  LET nxt == {i \in S : /\ T[i].kind = "alloc" /\ i \notin Equivocated(S)
                       /\ IF Mut = "nonorderer_binds" THEN (T[i].key # T["O"].key \/ T[i].prev = cur)   \* the bug: anyone's allocation binds
                                                       ELSE (T[i].prev = cur /\ T[i].key = T["O"].key)}
  IN IF nxt = {} THEN {}
     ELSE LET i == CHOOSE x \in nxt : TRUE        \* nxt has at most one member: a fork is excluded above
          IN IF total + T[i].q > Cap /\ Mut # "overbind" THEN {} ELSE {i} \cup Chain(S, i, total + T[i].q)
Bound(S) == IF "O" \in S THEN Chain(S, "O", 0) ELSE {}

\* ---------------------------------------------------------------- judging
SimpleKey == [Q |-> "kQ", P |-> "kP", A |-> "kA", R |-> "kR", Z |-> "kZ", S |-> "kS", B1 |-> "kB1", B2 |-> "kB2"]
SimpleJudge(b, S) == IF T[b].key # SimpleKey[T[b].author] THEN "bad_signature"
                     ELSE IF T[T[b].prev].key # T[b].key THEN "chain" ELSE "ok"
Judge(b, S) == IF T[b].comp = "identity" THEN IdJudge(b, S) ELSE SimpleJudge(b, S)

Fold(S) == <<IdFold(S), ConsentFold(S), Bound(S)>>

\* One push is judged in rounds (nodes.md, Push): each round takes every waiting block whose needs are
\* all held, judged against the same store, so the result never depends on the order inside a push.
RECURSIVE Rounds(_, _, _)
Rounds(st, W, rf) ==
  LET R   == {b \in W : Needs(b) \subseteq st}
      bad == {b \in R : Judge(b, st) # "ok"}      \* consent is never a reason: validity is the block and what it rests on
      bad2 == IF Mut = "refuse_stop"      \* the old rule: an ask despite a live STOP is refused (so its sender's chain stalls)
                THEN {b \in (R \ bad) : T[b].kind = "ask" /\ LiveStop(b, st \cup (R \ bad))} ELSE {}
  IN IF R = {} THEN [store |-> st, wait |-> W, ref |-> rf]
     ELSE Rounds(st \cup ((R \ bad) \ bad2), W \ R, rf \cup bad \cup bad2)

\* ---------------------------------------------------------------- the machine
VARIABLES store, waiting, refused, seen
vars == <<store, waiting, refused, seen>>
NodeSym == Permutations(Nodes)     \* the nodes are interchangeable (the cfgs name this as SYMMETRY): halves the states

Init == /\ store   = [n \in Nodes |-> Geneses]            \* every node holds the (public) geneses
        /\ waiting = [n \in Nodes |-> {}]
        /\ refused = [n \in Nodes |-> {}]
        /\ seen    = [n \in Nodes |-> {}]

Receive(n, batch) ==
  LET new == batch \ seen[n]
      r   == Rounds(store[n], waiting[n] \cup new, refused[n])
  IN /\ new # {}
     /\ store'   = [store   EXCEPT ![n] = r.store]
     /\ waiting' = [waiting EXCEPT ![n] = r.wait]
     /\ refused' = [refused EXCEPT ![n] = r.ref]
     /\ seen'    = [seen    EXCEPT ![n] = seen[n] \cup new]

Next == \E n \in Nodes, batch \in SUBSET Active : Cardinality(batch) \in 1..2 /\ Receive(n, batch)
Spec == Init /\ [][Next]_vars

\* ---------------------------------------------------------------- invariants
TypeOK == \A n \in Nodes : store[n] \subseteq DOMAIN T /\ waiting[n] \subseteq Active /\ refused[n] \subseteq Active

\* A refused block is never stored, and never counts as a need that was met.
RefusedNeverStored == \A n \in Nodes : refused[n] \cap store[n] = {}
\* Inv 25/26: nothing is stored, or folded, unless everything it rests on is held; nothing waits that could be judged.
WholeInput == \A n \in Nodes : /\ \A b \in store[n] : Needs(b) \subseteq store[n]
                               /\ \A b \in waiting[n] : ~(Needs(b) \subseteq store[n]) /\ b \notin refused[n]
\* Equivocation: nothing seen and judged is lost; both blocks of a pair are kept.
NothingLost == \A n \in Nodes : \A b \in seen[n] : b \in waiting[n] \cup refused[n] \cup store[n]
\* The fold reads an ask as stopped exactly when the spec says: a live STOP naming its side, lifted only by the person.
StopReadByFold == \A n \in Nodes : \A a \in {b \in store[n] : T[b].kind = "ask"} : LiveStop(a, store[n]) = Oracle(a, store[n])
\* An honest sender's chain never stalls because of anyone else's consent: once a consent-part block has every block
\* it rests on, it is stored, whatever STOP was held.
NoConsentStall == \A n \in Nodes : \A b \in seen[n] :
  (T[b].comp = "consent" /\ (Past(b) \ Geneses) \subseteq seen[n]) => b \in store[n]
\* No binding without the right signer.
RightSigner == \A n \in Nodes :
  LET c == Counted(store[n]) \cap {b \in Active : T[b].comp = "identity"} IN
     \A b \in c : T[b].key \in Keys(store[n]) \/ (T[b].recovery /\ T[b].kind = "keygrant")
FrozenSilent == \A n \in Nodes : \A b \in Counted(store[n]) : T[b].key \notin Frozen(store[n])
NoForgeStored == \A n \in Nodes : {"FR", "PR", "BADS"} \cap store[n] = {}
RECURSIVE SumQ(_)
SumQ(s) == IF s = {} THEN 0 ELSE LET x == CHOOSE y \in s : TRUE IN T[x].q + SumQ(s \ {x})
\* Allocation: only the orderer binds, never more than offered, a forked allocation binds nothing.
AllocationSafe == \A n \in Nodes :
  /\ \A i \in Bound(store[n]) : T[i].key = T["O"].key
  /\ SumQ(Bound(store[n])) <= Cap                              \* all bound allocations together never exceed the offer
\* Two honest nodes that were given the same blocks hold the same blocks, refuse the same, and fold the same.
Converge == \A m, n \in Nodes : seen[m] = seen[n] =>
              /\ store[m] = store[n]
              /\ refused[m] = refused[n] /\ waiting[m] = waiting[n]
              /\ IdFold(store[m]) = IdFold(store[n])
              /\ ConsentFold(store[m]) = ConsentFold(store[n])
              /\ Bound(store[m]) = Bound(store[n])

Inv == TypeOK /\ RefusedNeverStored /\ WholeInput /\ NothingLost /\ StopReadByFold /\ NoConsentStall /\ RightSigner
       /\ FrozenSilent /\ NoForgeStored /\ AllocationSafe /\ Converge
=============================================================================
