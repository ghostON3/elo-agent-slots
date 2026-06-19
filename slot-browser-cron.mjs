#!/usr/bin/env node
// slot-browser-cron.mjs — matches idle CC/CX slots to queued orders and spawns
// browser agents that self-select their preheat from the order registry.
//
// The inversion: instead of Ghost assigning tasks to agents, idle slots
// advertise themselves and browser agents discover their own work by reading
// /api/agentic-os/orders. The slot's preheat config (updateable independently
// of any running agent) shapes what the next agent inherits when it sits down.
//
// Every tick:
//   1. GET /api/ops/runtime-slots?state=idle  → free compute seats
//   2. GET /api/agentic-os/orders?status=queued → pending work
//   3. pair up to --max pairs, skip slots already in --exclude list
//   4. write a filled browser brief to /tmp/browser-brief-<orderId>.md
//   5. POST /api/dispatch with briefPath → spawned agent browses, claims, executes
//
// Usage:
//   node scripts/slot-browser-cron.mjs --once          one tick (default)
//   node scripts/slot-browser-cron.mjs --watch         repeat every --interval seconds
//   node scripts/slot-browser-cron.mjs --interval 60   tick cadence (default 30s)
//   node scripts/slot-browser-cron.mjs --max 2         max pairs per tick (default 1)
//   node scripts/slot-browser-cron.mjs --dry           plan only, no dispatch
//   node scripts/slot-browser-cron.mjs --provider claude  filter slot provider
//
// Env:
//   ELO_API_BASE          (default http://localhost:4000)
//   ELO_DEV_TOKEN         (resolved via scripts/lib/elo-api.mjs)

import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFile } from 'node:fs/promises';
import { eloApi, resolveDevToken, API_BASE } from './lib/elo-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRIEF_TEMPLATE = join(ROOT, '.elo/briefs/browser-agent-template.md');
const AUDIT_LOG = join(ROOT, 'docs/agentic/work-claims/slot-browser-cron.ndjson');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const val = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };

const DRY = flag('dry');
const WATCH = flag('watch');
const INTERVAL_S = Number.parseInt(val('interval', '30'), 10);
const MAX_PAIRS = Number.parseInt(val('max', '1'), 10);
const PROVIDER_FILTER = val('provider', undefined);

async function tick() {
  const token = await resolveDevToken();

  // 1. idle slots
  const slotsRes = await eloApi('GET', '/api/ops/runtime-slots?state=idle', { token, timeoutMs: 60_000 });
  if (!slotsRes.ok) {
    console.log(`[browser-cron] slots unreachable (${slotsRes.status}) — skip tick`);
    return;
  }
  let idleSlots = (slotsRes.json?.slots ?? []).filter((s) => s.state === 'idle');
  if (PROVIDER_FILTER) idleSlots = idleSlots.filter((s) => s.provider === PROVIDER_FILTER);

  // 2. queued orders (codeable kinds only — mirrors crew-loop)
  const ordersRes = await eloApi('GET', '/api/agentic-os/orders?status=queued', { token });
  if (!ordersRes.ok) {
    console.log(`[browser-cron] orders unreachable (${ordersRes.status}) — skip tick`);
    return;
  }
  // browser agents handle all codeable kinds; 'admin' orders are ghost-only
  const BROWSER_KINDS = new Set(['codebase', 'dispatch', 'system', 'review']);
  const pendingOrders = (ordersRes.json?.orders ?? [])
    .filter((o) => BROWSER_KINDS.has(o.kind))
    .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

  if (idleSlots.length === 0 || pendingOrders.length === 0) {
    console.log(`[browser-cron] idle:${idleSlots.length} pending:${pendingOrders.length} — nothing to pair`);
    return;
  }

  const pairs = Math.min(MAX_PAIRS, idleSlots.length, pendingOrders.length);
  console.log(`[browser-cron] pairing ${pairs} browser agent(s) — idle:${idleSlots.length} pending:${pendingOrders.length}`);

  const templateSrc = await readFile(BRIEF_TEMPLATE, 'utf8');

  for (let i = 0; i < pairs; i++) {
    const slot = idleSlots[i];
    const order = pendingOrders[i];
    await spawnBrowserAgent({ slot, order, token, templateSrc });
  }
}

async function spawnBrowserAgent({ slot, order, token, templateSrc }) {
  const slotId = slot.slot ?? slot.slotId ?? 'unknown';
  const briefPath = `/tmp/browser-brief-${order.id}.md`;

  // fill template placeholders
  const brief = templateSrc
    .replace(/\{\{API_BASE\}\}/g, API_BASE)
    .replace(/\{\{TOKEN\}\}/g, token)
    .replace(/\{\{ORDER_ID\}\}/g, order.id)
    .replace(/\{\{SLOT_ID\}\}/g, slotId);

  const label = `browser-${slotId}-${order.id.slice(-6)}`;
  const taskDesc = (order.goal ?? order.rawInput ?? 'browse-and-self-select').slice(0, 120);

  console.log(`  → ${label}  order:${order.id}  priority:${order.priority ?? 50}  "${taskDesc}"`);

  if (DRY) {
    console.log(`  [dry] would write ${briefPath} and POST /api/dispatch`);
    return;
  }

  await writeFile(briefPath, brief, 'utf8');

  const dispatchRes = await eloApi('POST', '/api/dispatch', {
    token,
    body: {
      domain: 'be',
      pattern: 'research',
      name: label,
      task: `browser-agent: browse orders and self-select (hint: ${order.id})`,
      briefPath,
      predicted: 'auto',
    },
    timeoutMs: 90_000,
  });

  const ok = dispatchRes.ok && dispatchRes.json?.status === 'spawned';
  const audit = {
    ts: new Date().toISOString(),
    kind: 'browser-spawn',
    slot: slotId,
    orderId: order.id,
    label,
    briefPath,
    ok,
    dispatchStatus: dispatchRes.status,
  };
  await appendFile(AUDIT_LOG, JSON.stringify(audit) + '\n').catch(() => {});

  if (ok) {
    console.log(`  ✓ spawned ${label}`);
  } else {
    console.log(`  ✗ dispatch failed HTTP ${dispatchRes.status} for ${label}`);
  }
}

async function run() {
  if (WATCH) {
    console.log(`[browser-cron] watch mode — tick every ${INTERVAL_S}s, max ${MAX_PAIRS} pair(s)/tick${DRY ? ' (dry)' : ''}`);
    while (true) {
      await tick().catch((e) => console.error('[browser-cron] tick error:', e.message));
      await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
    }
  } else {
    await tick();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
