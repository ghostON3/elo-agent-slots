# Design: Why slots > birth packets

## The problem with birth packets

Every agent dispatch in the standard model requires a birth packet:
a document that tells the agent who it is, what it should do, what context
it has, what tools it can use, and how to prove it's done.

At 10 agents this is manageable. At 1000 it's a maintenance burden.
At 1M blueprint slots it's impossible.

## The inversion

The slot has the persistent configuration. The agent is disposable.

When a seat goes idle, the cron fires a blank agent into it.
The agent's only instruction: "browse available orders, pick one."
The order provides the goal. The slot's preheat profile provides the context.
The agent executes, dies, and the slot is ready for the next one.

## What you actually maintain

```
slot cc1:
  preheat: "backend specialist — focus on API and DB work"
  allowed_paths: ["apps/api/**", "packages/**"]
  model_tier: "claude-opus"

slot cx1:
  preheat: "quick fixes and test work"
  allowed_paths: ["**/*.test.ts"]
  model_tier: "codex"
```

Update the slot config → every future agent that sits there inherits it.
No per-task birth packets. No re-briefing. No context drift.

## The room

Slots live inside rooms. A room is a shared environment:
relationships, other agents, shared context, output channels.
When an agent sits into a slot in a room, the room is already set up.
The agent arrives into a wired environment, not a blank terminal.

This is the cognitive offload: you set up rooms and slots,
not agents. The agents are implementation details.
