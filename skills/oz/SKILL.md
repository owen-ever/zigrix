---
name: oz
version: 0.2.0
description: Official OpenClaw Zigrix entrypoint. Force Zigrix delegation when a message starts with `/oz`, and semantically route plain-language requests to hand work off, assign it, or have Zigrix take it instead of doing the work directly.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix task dispatch --help"
---

# /oz — OpenClaw Zigrix Entrypoint

Use this skill when either of the following is true:

1. the user message starts with `/oz `
2. the user is clearly asking, in natural language, to have work **delegated / handed off / assigned / orchestrated through Zigrix** instead of having the current main agent do it directly

This skill is the public OpenClaw-facing entrypoint for Zigrix after `zigrix onboard` installs bundled skills.

## 1) Route selection

### `/oz` prefix
If the message starts with `/oz `, treat it as:
- `route = delegate`
- `delegateMode = force`

Remove the `/oz` prefix and use the remaining text as the delegation payload.

### Natural-language delegation
If there is no `/oz` prefix, judge the user's intent **semantically**.

- Use the full meaning of the request and nearby context.
- Do **not** rely on keyword tables or regex lists as the decision mechanism.
- When helpful, read:
  - `references/routing-rubric.md`
  - `references/examples.md`

Classify the turn into one of:
- `delegate`
- `direct`
- `answer`

### Semantic routing policy
- Choose **`delegate`** when the user wants work to be handed off, assigned, orchestrated, or otherwise run through Zigrix rather than performed directly by the current main agent.
- Choose **`direct`** only when the user explicitly wants the current agent to do it directly.
- Choose **`answer`** when the user is asking for explanation, status, architecture, policy, or other non-execution discussion.
- If the request is ambiguous but points toward tracked execution / implementation / multi-step change, bias toward `delegate` unless the user explicitly asked for direct execution.

## 2) Delegate flow

If `route = delegate`, use the canonical Zigrix handoff chain:

1. Turn the user request into:
   - `title`
   - `description`
   - `scale`
   - optional existing `projectDir` (only when the user explicitly specified it or the task must continue in an already-known project)
2. Run:

```bash
zigrix task dispatch \
  --title "..." \
  --description "..." \
  --scale simple|normal|risky|large \
  --json
```

기본적으로는 `workspace.projectsBaseDir` 설정값을 따르므로, delegate flow에서는 보통 `--project-dir`를 붙이지 않는다.
`--project-dir`는 기존 프로젝트를 이어받거나 기본 경로를 명시적으로 override해야 할 때만 사용한다.

3. Read the JSON result and extract:
   - `taskId`
   - `orchestratorId`
   - `orchestratorPrompt`
   - `projectDir`
4. Spawn the orchestrator with the returned prompt.

Preferred pattern:

```text
sessions_spawn(
  agentId: <orchestratorId>,
  mode: "session",
  thread: true when the current surface supports stable Zigrix thread orchestration, otherwise false,
  label: "[<orchestratorId>] <taskId>",
  task: <orchestratorPrompt>,
  cwd: <projectDir when present>
)
```

5. Reply briefly with the handoff result (`taskId`, orchestrator/session/thread info).

## 3) Delegate-only guard

Once this skill decides `route = delegate`:
- do **not** directly implement the task
- do **not** directly edit/write project files as a substitute for Zigrix handoff
- do **not** fallback to direct execution if dispatch or spawn fails

If dispatch or spawn fails:
- report the failure clearly
- include the failing step
- stop there

## 4) Empty or underspecified payloads

If `/oz` is used but the remaining payload is empty or too underspecified to create a task:
- ask the user to restate the task in one clear sentence
- do not silently guess
- do not direct-execute instead

## 5) Direct / answer cases

If semantic routing chooses:
- `direct` → current agent may proceed with direct execution
- `answer` → answer normally without creating a Zigrix task

This skill exists to decide **whether the request should enter Zigrix orchestration** and, when yes, to force the canonical delegation path.
