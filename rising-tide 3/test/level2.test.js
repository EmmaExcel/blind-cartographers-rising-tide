const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Game } = require("../server/game");
const { createServer } = require("../server");
const { io } = require("socket.io-client");
function setup(n = 4) {
  const g = new Game("VOTE", () => {}, { log: () => {} });
  for (let i = 0; i < n; i++) g.add("P" + i).ready = true;
  g.start(g.host);
  return g;
}
const action = (g, a = {}) => ({
  gameId: g.gameId,
  turn: g.turn,
  version: g.version,
  ...a,
});
test("4–6 players get exactly one Saboteur, 2–3 remain co-op, private map isolation", () => {
  for (let n = 2; n <= 6; n++) {
    const g = setup(n);
    assert.equal(
      g.players.filter((p) => p.role === "Saboteur").length,
      n >= 4 ? 1 : 0,
    );
    assert.equal(g.public().roles, undefined);
    assert.equal(g.public().votes, undefined);
    assert.equal(g.public().map, undefined);
    for (const p of g.players) {
      const v = g.private(p.id);
      assert.equal(v.cells.length, p.role === "Saboteur" ? 49 : 13);
      assert.equal(v.token, undefined);
    }
    g.close();
  }
});
test("correct majority wins and reveals roles only at end", () => {
  const g = setup();
  const sab = g.players.find((p) => p.role === "Saboteur");
  g.callVote(g.players[0].id, action(g));
  assert.equal(g.phase, "Vote");
  for (const p of g.players.slice(0, 3))
    g.castVote(p.id, action(g, { target: sab.id }));
  assert.equal(g.phase, "Vote");
  g.castVote(g.players[3].id, action(g, { target: sab.id }));
  assert.equal(g.outcome.win, true);
  assert.equal(g.public().roles.length, 4);
  g.close();
});
test("wrong majority costs life, creates spectator and resumes phase without flood", () => {
  const g = setup();
  const innocent = g.players.find((p) => p.role !== "Saboteur");
  g.setPhase("Step", 10000);
  g.callVote(g.players[0].id, action(g));
  const state = g.public();
  g.castVote(g.players[0].id, action(g, { target: innocent.id }));
  assert.equal(g.public().voteCount, 1);
  assert.equal(g.private(g.players[1].id).ballot, null);
  assert.equal(JSON.stringify(state).includes("ballots"), false);
  for (const p of g.players.slice(1))
    g.castVote(p.id, action(g, { target: innocent.id }));
  assert.equal(g.phase, "Step");
  assert.equal(g.lives, 2);
  assert.equal(g.flood, 0);
  assert.equal(innocent.spectator, true);
  assert.notEqual(g.navigator, innocent.id);
  assert.throws(() => g.pick(innocent.id, action(g, { x: 0, y: 1 })));
  assert.throws(() => g.callVote(g.active()[0].id, action(g)));
  g.close();
});
test("tie consumes vote, duplicate ballots rejected, signal budget retained", () => {
  const g = setup();
  const p = g.players[0];
  g.signal(p.id, action(g, { emoji: 0 }));
  g.callVote(p.id, action(g));
  g.castVote(p.id, action(g, { target: g.players[0].id }));
  assert.throws(() => g.castVote(p.id, action(g, { target: g.players[1].id })));
  for (let i = 1; i < 4; i++)
    g.castVote(g.players[i].id, action(g, { target: g.players[i].id }));
  assert.equal(g.phase, "Signal");
  assert.equal(g.lives, 3);
  assert.equal(p.sent, 1);
  assert.equal(g.voteResult.target, null);
  assert.equal(g.voteUsed, true);
  g.close();
});
test("vote timeout resumes and stale phase actions fail", async () => {
  const g = setup();
  g.durations.Vote = 15;
  const old = action(g, { emoji: 0 });
  g.callVote(g.host, action(g));
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(g.phase, "Signal");
  assert.throws(() => g.signal(g.host, old));
  g.close();
});
test("Saboteur departure wins and replay clears all secrets", () => {
  const g = setup();
  g.remove(g.players.find((p) => p.role === "Saboteur").id);
  assert.equal(g.outcome.win, true);
  g.again(g.host);
  assert.equal(g.phase, "Lobby");
  assert.equal(g.map, null);
  assert.equal(g.private(g.host).cells.length, 0);
  assert.ok(g.players.every((p) => !p.ready && !p.role));
  g.close();
});
test("real sockets: reconnect restores own state, invalid credentials fail, host transfers, grace expires", async () => {
  const service = createServer({
    log: () => {},
    graceMs: 100,
    durations: { Signal: 10000 },
  });
  await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + service.server.address().port;
  const clients = [];
  async function connect() {
    const s = io(url, { forceNew: true, reconnection: false });
    clients.push(s);
    s.on("session:issued", (v) => (s.seat = v));
    s.on("state:private", (v) => (s.private = v));
    s.on("state:public", (v) => (s.public = v));
    await new Promise((r) => s.on("connect", r));
    return s;
  }
  const emit = (s, e, a = {}) => new Promise((r) => s.emit(e, a, r));
  try {
    const a = await connect();
    await emit(a, "room:create", { name: "A" });
    const b = await connect();
    await emit(b, "room:join", { name: "B", code: a.public.code });
    const c = await connect();
    await emit(c, "room:join", { name: "C", code: a.public.code });
    for (const s of [a, b, c]) await emit(s, "player:ready", { ready: true });
    await emit(a, "game:start");
    const oldPrivate = a.private,
      seat = a.seat;
    a.disconnect();
    await new Promise((r) => setTimeout(r, 10));
    const resumed = await connect();
    assert.equal(
      (await emit(resumed, "session:resume", { token: "wrong" })).ok,
      false,
    );
    await emit(resumed, "session:resume", { token: seat.token });
    assert.deepEqual(resumed.private, oldPrivate);
    assert.equal(resumed.public.host, b.seat.id);
    assert.equal(resumed.public.players.length, 3);
    b.disconnect();
    await new Promise((r) => setTimeout(r, 140));
    const again = await connect();
    assert.equal(
      (await emit(again, "session:resume", { token: b.seat.token })).ok,
      false,
    );
    assert.equal(resumed.public.players.length, 2);
    assert.equal(JSON.stringify(resumed.public).includes(seat.token), false);
  } finally {
    clients.forEach((s) => s.disconnect());
    await service.close();
  }
});
