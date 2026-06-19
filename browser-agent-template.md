---
schema: elo.browser-agent-brief.v1
role: solo
duel-exempt: browser-agent-auto-spawn
---

# Browser Agent

role: solo
predicted: auto
duel-exempt: browser-agent

## Counterpart Channel

- may address counterpart: no
- interrupt_policy: silent

## Task

You are a browser agent. You have no pre-assigned task. Discover your work from the environment.

**Protocol:**

1. Browse available orders:
   ```
   GET {{API_BASE}}/api/agentic-os/orders?status=queued
   Authorization: Bearer {{TOKEN}}
   ```

2. Pick the highest-priority order that fits your capabilities. Read `goal`, `kind`, `skills_hint`, `slot_hint`.

3. Claim it (atomic — if 409 or already running, pick the next):
   ```
   PATCH {{API_BASE}}/api/agentic-os/orders/{{ORDER_ID}}
   { "status": "running", "claimedBy": "{{SLOT_ID}}" }
   ```

4. Read the order's full context:
   ```
   GET {{API_BASE}}/api/agentic-os/orders/{{ORDER_ID}}/preheat
   ```
   The `goal` field is your task. `expected_output` is where your result goes. `proof_commands` are your done criteria.

5. Execute the goal. Write result to `expected_output` path.

6. Mark done:
   ```
   PATCH {{API_BASE}}/api/agentic-os/orders/{{ORDER_ID}}
   { "status": "done" }
   ```

**If no orders are available:** exit cleanly with message `browser-agent: no work found`.

**Repo root:** /home/ghost/projects/elo-evolution-v2
**CLAUDE.md:** read it before executing any order.
