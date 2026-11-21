## Stage 1 and 2 stories re-run

`stage2-scratch/stories.cjs` (110 answers) and `stage2-scratch/stage1-resigned/stories.cjs` (118 answers) were run before (the oracle as stage 2 left it, given today's `protocol.json` with the removed money entries put back: `rerun/*.before.out`) and after this stage (`rerun/stage1-resigned.out`, `rerun/stage2.out`).

- **Stage 1: all 118 answers are the same.**
- **Stage 2: 106 of 110 are the same.** The four that changed are story 7 (the wire): its test block carries `price: { currency: 'GBP', minor: 450 }`, which is no shape in 1.8, so `strict_text(the canonical bytes)`, `strict_text(2^53 - 1)`, `strict_push(canonical)` and `strict_push(a block with a null inside canonical bytes)` now also report `shape`. That is the meant change (the money shape leaves). Written as an amount (`stage2-stories-amount.cjs`, `rerun/stage2-with-amount.out`) the same stories give the same answers, bar the three questions that fed a number token into the money's `minor` (`450.0`, `4.5e2`, `2^53`): an amount has no number token, so they have nothing to refuse. Story 8 stops at the same line in both (an argument error the story does not catch).

