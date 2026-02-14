---
name: multi-coding-agent
description: >
  Orchestrate coding sub-tasks using multiple tools. Use when a task is too complex for a single
  pass — break it down and run sub-agents or CLI tools for each piece.
---

# Multi-Coding Agent

When a task is complex (e.g., refactoring a 230KB file into 10 components), break it into
sub-tasks and execute them sequentially.

## When to Use
- Refactoring large files into smaller components
- Adding a feature that touches multiple files
- Creating a new module with multiple related files

## Workflow

### Step 1: Plan
Before writing any code, create a plan:
```
Task: [what you're doing]
Sub-tasks:
  1. [first piece] → [file(s) affected]
  2. [second piece] → [file(s) affected]
  3. [third piece] → [file(s) affected]
Build check: after each sub-task
```

### Step 2: Execute Sub-Tasks
For each sub-task:
1. Make the change
2. Run `npm run build` to verify
3. If build fails, fix immediately before moving to next sub-task
4. Commit with a message referencing the parent task

### Step 3: Integration Check
After all sub-tasks:
1. `npm run build` — full build
2. `npm test` — if tests exist
3. Verify all imports resolve correctly
4. Check that no functionality was lost

## Commit Strategy for Multi-Step Work
```
refactor(components): extract SearchBar from page.js [1/3]
refactor(components): extract ValuationSummary from page.js [2/3]
refactor(components): extract MetricsGrid from page.js [3/3]
```

## Safety Rules
- Never delete the original file until all extractions are verified
- Keep backwards compatibility — don't change component APIs mid-refactor
- If a sub-task fails build, revert that sub-task only, not the whole chain
- Maximum 3 sub-tasks per heartbeat cycle to keep changes reviewable
