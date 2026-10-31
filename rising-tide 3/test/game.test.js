const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Game, generateMap } = require("../server/game");
const { createServer } = require("../server");
const { io } = require("socket.io-client");
function setup() {
  const g = new Game("TEST", () => {}, { log: () => {} });
  const a = g.add("Ada"),
    b = g.add("Ben");
  a.ready = b.ready = true;
  g.start(a.id);
  return { g, a, b };
}
function action(g, data = {}) {
  return { gameId: g.gameId, turn: g.turn, version: g.version, ...data };
}
test("1000 generated routes are safe, adjacent, and beat the flood", () => {
  for (let i = 0; i < 1000; i++) {
    const { map, route, treasure } = generateMap();
    assert.ok(route.length - 1 <= treasure.y + 1);
    route.forEach((c, i) => {
      assert.notEqual(map[c.y][c.x], "trap");
      if (i)
        assert.equal(
          Math.abs(c.x - route[i - 1].x) + Math.abs(c.y - route[i - 1].y),
          1,
        );
    });
    assert.equal(map[treasure.y][treasure.x], "treasure");
  }
});
test("privacy serializer has only own slices, no map until game over", () => {
  const { g, a } = setup();
  assert.equal(g.public().map, undefined);
  const p = g.private(a.id);
  assert.equal(p.cells.length, 13);
  assert.ok(p.cells.every((c) => c.x === p.col || c.y === p.row));
  assert.equal(JSON.stringify(g.public()).includes("treasure"), false);
  g.over(true, "done");
  assert.equal(g.public().map.length, 7);
  g.close();
});
test("three signals, stale phases, non Navigator, double tap, late tap", () => {
  const { g, a, b } = setup();
  for (let i = 0; i < 3; i++) g.signal(a.id, action(g, { emoji: 0 }));
  assert.throws(() => g.signal(a.id, action(g, { emoji: 0 })));
  const old = action(g, { x: 0, y: 1 });
  g.setPhase("Step", 10000);
  assert.throws(() => g.pick(a.id, old));
  assert.throws(() => g.pick(b.id, action(g, { x: 0, y: 1 })));
  g.map[1][0] = "safe";
  const tap = action(g, { x: 0, y: 1 });
  g.pick(a.id, tap);
  assert.equal(g.path.length, 2);
  assert.throws(() => g.pick(a.id, tap));
  g.setPhase("Step", 10000);
  g.deadline = Date.now() - 1;
  assert.throws(() => g.pick(g.navigator, action(g, { x: 0, y: 2 })));
  g.close();
});
test("traps cost life and two flood rows, timeout floods, zero lives loses", () => {
  const { g } = setup();
  g.map[1][0] = "trap";
  g.resolve({ x: 0, y: 1 });
  assert.equal(g.lives, 2);
  assert.equal(g.flood, 2);
  g.resolve(null);
  assert.equal(g.flood, 3);
  g.lives = 1;
  g.map[3][1] = "trap";
  g.resolve({ x: 1, y: 3 });
  assert.equal(g.outcome.win, false);
  assert.equal(g.lives, 0);
  g.close();
});
test("treasure wins before flood, all safe routes win, waiting loses", () => {
  for (let i = 0; i < 50; i++) {
    const { g } = setup();
    for (const c of g.route.slice(1)) g.resolve(c);
    assert.equal(g.outcome.win, true);
    g.close();
  }
  const { g } = setup();
  while (g.phase !== "GameOver") g.resolve(null);
  assert.equal(g.outcome.win, false);
  g.close();
});
test("room errors and host reassignment", () => {
  const g = new Game("TEST", () => {}, { log: () => {} });
  const a = g.add("Ada");
  assert.throws(() => g.start(a.id));
  assert.throws(() => g.add("ADA"));
  const b = g.add("Ben");
  g.remove(a.id);
  assert.equal(g.host, b.id);
  for (let i = 0; i < 5; i++) g.add("P" + i);
  assert.throws(() => g.add("Full"));
  g.close();
});
test("real sockets: three clients share state, isolate clues, reject invalid input", async () => {
  const service = createServer({
    log: () => {},
    durations: { Signal: 80, Step: 80 },
  });
  await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + service.server.address().port;
  const clients = [0, 1, 2].map(() => io(url, { forceNew: true }));
  await Promise.all(clients.map((s) => new Promise((r) => s.on("connect", r))));
  const states = [null, null, null],
    priv = [null, null, null];
  clients.forEach((s, i) => {
    s.on("state:public", (v) => (states[i] = v));
    s.on("state:private", (v) => (priv[i] = v));
  });
  const emit = (i, event, a = {}) =>
    new Promise((r) => clients[i].emit(event, a, r));
  try {
    assert.equal(
      (await emit(0, "room:join", { code: "XXXX", name: "A" })).ok,
      false,
    );
    await emit(0, "room:create", { name: "Ada" });
    const code = states[0].code;
    await emit(1, "room:join", { code, name: "Ben" });
    await emit(2, "room:join", { code, name: "Cal" });
    for (let i = 0; i < 3; i++) await emit(i, "player:ready", { ready: true });
    assert.equal((await emit(0, "game:start")).ok, true);
    await new Promise((r) => setTimeout(r, 15));
    assert.ok(states.every((s) => s.gameId === states[0].gameId));
    assert.ok(priv.every((p) => p.cells.length === 13));
    assert.notEqual(priv[0].row, priv[1].row);
    assert.ok(states.every((s) => !s.map));
    await new Promise((r) => setTimeout(r, 170));
    assert.ok(states[0].turn >= 2);
    assert.equal((await fetch(url + "/health")).status, 200);
  } finally {
    clients.forEach((s) => s.disconnect());
    await service.close();
  }
});
