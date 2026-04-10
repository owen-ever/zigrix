# `/oz` Semantic Routing Rubric

This reference exists to keep natural-language delegation routing **semantic-first**.

## Core principle
Do **not** implement delegation routing as a keyword table or regex checklist.

Instead, decide from the user's **meaning**:
- who should own the work
- whether execution is being requested
- whether the user wants Zigrix/orchestration/another agent to take the task
- whether the user is explicitly asking for direct execution instead

## Route categories

### 1) `delegate`
Choose `delegate` when the user wants work to be:
- handed off
- assigned
- orchestrated
- run through Zigrix
- taken by another agent / worker / orchestrator

Also choose `delegate` when the request is clearly about **tracked execution** and the intent is to kick off work rather than just discuss it.

Typical shapes:
- implementation / bug fix / refactor / investigation / multi-step execution
- “don’t do this yourself — pass it through the orchestration flow”
- “make Zigrix take this task”

### 2) `direct`
Choose `direct` only when the user clearly wants the **current main agent** to do the work directly.

Typical signs:
- explicit direct instruction
- explicit anti-delegation instruction
- small bounded task with no request to hand it off

### 3) `answer`
Choose `answer` when the user is not asking to execute or hand off work, but instead wants:
- explanation
- architecture discussion
- status
- comparison
- policy/design reasoning
- review of an idea without starting execution

## Bias rule
If the request is ambiguous but points toward:
- state-changing work
- multi-step implementation
- tracked execution
- “someone else / Zigrix should take this”

bias toward `delegate` unless the user clearly requested direct execution.

## Hard rules
- `/oz ...` is always `delegate`.
- Once `delegate` is chosen, do not direct-execute as a fallback.
- If the task text is too thin to dispatch safely, ask for clarification instead of direct-executing.
- Use the existing canonical Zigrix chain:
  - `zigrix task dispatch --json`
  - `sessions_spawn(... orchestratorPrompt ...)`

## What this rubric is not
This rubric is not:
- a regex spec
- an exhaustive phrase list
- a locale-locked keyword matcher

It is a semantic decision guide for LLM-based routing.
