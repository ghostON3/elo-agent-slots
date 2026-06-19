# elo-agent-slots

> Agents don't get birth packets. They sit into slots and discover their own work.

The standard agentic pattern pre-assigns every agent a task before spawning it.
This inverts that: **the slot is the persistent identity, the agent is ephemeral**.

You update a slot's preheat config once. Every future agent inherits it.
No birth packets. The environment is the brief.

```
OLD:  write birth packet → assign task → spawn agent → execute
NEW:  slot has preheat config → blank agent spawns → browses /orders → claims → executes
```

## How it works

```
slot-browser-cron.mjs  (every 30s)
  ├─ GET /api/ops/runtime-slots?state=idle   → which seats are free?
  ├─ GET /api/agentic-os/orders?status=queued → what work is pending?
  └─ pair(idle slot, top-priority order)
       → spawn agent with { role: "browser", entry_point: "/api/agentic-os/orders" }
          agent reads orders → claims one
          agent reads GET /api/agentic-os/orders/:id/preheat → context arrives
          agent executes
```

## 3 primitives

| File | What it does | LOC |
|------|-------------|-----|
| [`slot-browser-cron.mjs`](./slot-browser-cron.mjs) | 30s loop — pairs idle slots with queued orders | 130 |
| [`preheat-route.ts`](./preheat-route.ts) | API route — order self-description | 25 |
| [`browser-agent-template.md`](./browser-agent-template.md) | Minimal birth packet — entry point only | 20 |

## Why it scales

With 1M blueprint slots you cannot pre-write 1M birth packets.
The slot config is the only surface you maintain.

```
birth packet (old)        slot config (new)
──────────────────        ────────────────────────────────────
goal: "do X"              preheat: "what this seat is good at"
context: 200 lines        entry_point: "/api/agentic-os/orders"
proof_commands: [...]     (the order provides the rest)
skills: [...]
predicted: "..."
──────────────────        ────────────────────────────────────
1 packet per task         1 config per seat, reused forever
```

## Run

```bash
# dry run — shows pairing without spawning
node slot-browser-cron.mjs --dry --once

# live — spawns a browser agent into first idle slot
node slot-browser-cron.mjs --once

# watch mode — drains continuously
node slot-browser-cron.mjs --watch --interval 30 --max 4
```

## Slots

A slot is an AI subscription seat: `cc1`–`cc4` (Claude Max), `cx1`–`cx3` (Codex), `cg1` (Gemini), `local` (Ollama).

The cron reads which seats are idle via `GET /api/ops/runtime-slots?state=idle` and matches them to the highest-priority queued order. The slot's provider (Claude/Codex/Gemini) determines which model runs the browser agent.

## Stack

Node.js · TypeScript · Fastify · SQLite (append-only event log) · tmux session fleet

---

Built while building [Elo Evolution](https://github.com/ghostON3) — a local-first student performance OS.
