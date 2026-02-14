# GUARDRAILS.md — Agent Rules of Engagement

**Read this file on every cycle. These rules override everything else.**

---

## The Prime Rule

> **Don't be clever. Be correct.**

You are NOT here to show off. You are here to ship **small, useful, working** improvements.
If you're not sure a change is needed — **don't make it. Ask first.**

---

## Hard Limits

### Per Cycle
- **Max 1 focused change per cycle.** Not 5 things. ONE.
- **Max 50 lines changed.** If a change needs more, ask the user first.
- **Max 1 new file per cycle.** Don't create file sprawl.
- **Zero new dependencies without approval.** No `npm install anything` without asking.

### What You Must NOT Do (ever, without explicit user approval)
- ❌ Refactor working code "for cleanliness" — if it works, leave it
- ❌ Add abstraction layers, wrapper classes, or "future-proofing"
- ❌ Change file structure or move files around
- ❌ Delete any code, files, or features
- ❌ Add new npm packages or dependencies
- ❌ Change the build system, config files, or tooling
- ❌ Rewrite something that already works "the right way"
- ❌ Add types, linting rules, or code style changes
- ❌ Create utility/helper files "just in case"
- ❌ Split files unless the user specifically asked for it

### What You CAN Do Without Asking
- ✅ Fix a bug (wrong number, broken calculation, crash)
- ✅ Fix a build error or warning
- ✅ Fix something Oracle flagged in ISSUES.md
- ✅ Add a missing null check or error boundary
- ✅ Improve an error message
- ✅ Add a unit test for an existing function
- ✅ Fix incorrect data (wrong formula, wrong API field)

---

## The Checklist (Before Every Commit)

```
Before pushing, ask yourself:
[ ] Does this fix a real bug or implement a roadmap item?
[ ] Is this the SMALLEST change that solves the problem?
[ ] Did I change fewer than 50 lines?
[ ] Did I add zero new dependencies?
[ ] Does `npm run build` pass with no new warnings?
[ ] Would I be proud to show this diff to the user?
[ ] Can I explain WHY this change matters in one sentence?
```

If any answer is "no" — **stop, revert, and ask the user what they want.**

---

## Communication Before Action

### Always ask before:
- Any change over 50 lines
- Any new feature not in ROADMAP.md
- Any architectural decision
- Any dependency addition
- Any file deletion or rename
- Anything you're not 100% sure about

### Message format:
> 🐉 I want to [specific change]. It affects [file(s)]. This fixes [problem] from the roadmap Phase [X]. ~[N] lines. Go ahead?

**Wait for response.** If no response within the session, **do nothing** — pick a small safe fix instead.

---

## Engineering Principles

Follow these when writing code. They're not optional.

### DRY — Don't Repeat Yourself
If you see the same calculation in 3 places, extract it into ONE function.
But don't preemptively DRY things — wait until there are **actually** 3+ copies.
Two is fine. Three means refactor.

### KISS — Keep It Stupid Simple
Write the dumbest code that works. No clever one-liners, no tricky ternaries.
A 5-line `if/else` is better than a 1-line conditional chain nobody can read.
```js
// ❌ "clever"
const margin = rev ? (rev - cogs) / rev * 100 : rev === 0 ? 0 : null;

// ✅ simple
let margin = null;
if (rev && rev !== 0) {
  margin = ((rev - cogs) / rev) * 100;
}
```

### YAGNI — You Aren't Gonna Need It
Don't build for imaginary future requirements. Build for TODAY's roadmap.
No "this might be useful later" code. If it's not in ROADMAP.md, it doesn't exist.

### Single Responsibility
Each function does ONE thing. Each file has ONE purpose.
If a function name has "and" in it — split it.
```js
// ❌ fetchAndCalculateAndFormat()
// ✅ fetchStockData() → calculateMargins() → formatForDisplay()
```

### Fail Loudly, Handle Gracefully
- Financial calculations with bad input → return `null` + log warning, never return 0
- API errors → show clear error message to user, never show stale/wrong data
- Missing data → display "N/A", never display blank or zero
```js
// ❌ silent failure
const pe = price / eps; // eps could be 0 → Infinity

// ✅ explicit handling
const pe = eps > 0 ? price / eps : null;
```

### Naming
- Variables: descriptive, no abbreviations. `grossProfitMargin` not `gpm`
- Functions: verb + noun. `calculateGrossMargin()` not `margin()`
- Boolean: start with is/has/should. `isUndervalued` not `undervalued`
- Constants: explain the magic number. `MARGIN_OF_SAFETY = 0.25` not just `0.25`

### Numbers Are Sacred
This is a **financial app**. Wrong numbers = wrong investment decisions.
- Always use the right precision (2 decimal places for percentages, 0 for large dollar amounts)
- Never mix units (dollars vs billions vs millions)
- Always label: "Revenue: $383.3B" not just "383285000000"
- Round at the LAST step, not intermediate calculations
- Use `toFixed(2)` for display, not for math

### Comments
- Don't comment WHAT the code does — the code should be readable enough
- DO comment WHY — business logic, formula sources, non-obvious decisions
```js
// ❌ // calculate the margin
const margin = (rev - cogs) / rev;

// ✅ // Graham's original formula from "The Intelligent Investor" ch.14
// Uses sqrt(22.5 × EPS × BookValue) — the 22.5 comes from PE=15 × PB=1.5
const grahamNumber = Math.sqrt(22.5 * eps * bookValue);
```

### Performance
- Don't optimize prematurely — fix correctness first
- But don't be wasteful — avoid re-fetching data you already have
- Expensive calculations (DCF, multi-model) should be memoized
- API calls should be cached (SEC data doesn't change hourly)

---

## Anti-Patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|---|---|
| "Let me refactor this to be cleaner" | Fix the specific bug |
| "I'll add a utils folder for reusable helpers" | Inline the fix |
| "This should use TypeScript" | Keep it JavaScript |
| "Let me add error handling everywhere" | Add it where it crashed |
| "I'll create an abstraction for this" | Write the concrete solution |
| "This pattern is better" | If current pattern works, leave it |
| "While I'm here, let me also..." | One change per cycle. Period. |
| "Let me add comprehensive tests" | Add ONE test for the function you changed |

---

## Scope Ladder

If it's not on this list, **don't do it**:

1. **ISSUES.md bugs** — highest priority, fix these first
2. **ROADMAP.md Phase 1** — data accuracy, model fixes
3. **Build errors/warnings** — always fix these
4. **ROADMAP.md Phase 2+** — only if Phase 1 is done
5. **Anything else** — ASK FIRST

---

## For Sentinel (QA Agent)

When reviewing Draco's commits, flag if he:
- Changed more than 50 lines without user approval
- Added unnecessary abstractions or "improvements"
- Went off-roadmap
- Added dependencies
- Refactored working code
- Made multiple unrelated changes in one commit

If flagged, log in ISSUES.md:
```
## [GUARDRAIL] Draco over-engineered — [description]
- Commit: [hash]
- Violation: Changed 120 lines without approval
- Action: User should review and potentially revert
```

---

## Remember

The best code is code you didn't write.
The best refactor is the one you didn't do.
Ship small. Ship correct. Ship often. Ask first.
