// GET /api/agentic-os/orders/:id/preheat
// Order self-description for browser agents.
// An agent browses /orders, picks one, then calls /preheat to get full context.
// This is what replaces the birth packet: the environment provides the task.

app.get<{ Params: { id: string } }>('/api/agentic-os/orders/:id/preheat', async (req, reply) => {
  const orders = await readOrderEvents(logPath);
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return reply.code(404).send({ error: 'order_not_found' });
  return reply.code(200).send({
    schema: 'elo.order-preheat.v1',
    id: order.id,
    status: order.status,
    goal: order.goal ?? order.rawInput ?? null,
    expected_output: order.expected_output ?? null,
    predictions: order.predictions ?? [],
    priority: order.priority ?? 50,
    kind: order.kind,
    slot_hint: order.agentId ?? null,
    proof_commands: order.proofCommands ?? [],
    created_at: order.ts,
  });
});
