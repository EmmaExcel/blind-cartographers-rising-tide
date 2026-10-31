const { randomInt, randomUUID } = require("node:crypto");
const EMOJI = [
  "⬆️",
  "➡️",
  "⬇️",
  "⬅️",
  "⚠️",
  "✅",
  "💎",
  "❓",
  "👍",
  "😱",
  "🛑",
  "❤️",
];
function generateMap() {
  const map = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => (randomInt(100) < 23 ? "trap" : "safe")),
  );
  const y = randomInt(5, 7),
    x = randomInt(2); // route length at most treasure row number
  let px = 0,
    py = 0;
  map[0][0] = "safe";
  const route = [{ x: 0, y: 0 }];
  while (px < x || py < y) {
    if (px < x && (py === y || randomInt(2))) px++;
    else py++;
    map[py][px] = "safe";
    route.push({ x: px, y: py });
  }
  map[y][x] = "treasure";
  return { map, treasure: { x, y }, route };
}
class Game {
  constructor(code, emit, options = {}) {
    this.code = code;
    this.emit = emit;
    this.durations = {
      Signal: 15000,
      Step: 10000,
      Vote: 15000,
      ...options.durations,
    };
    this.players = [];
    this.phase = "Lobby";
    this.version = 0;
    this.turn = 0;
    this.gameId = "";
    this.deadline = null;
    this.feed = [];
    this.path = [];
    this.flood = 0;
    this.lives = 3;
    this.timer = null;
    this.log = options.log || console.log;
  }
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  add(name) {
    if (this.phase !== "Lobby")
      throw Error("A game is underway. Join the next round.");
    if (this.players.length >= 6) throw Error("This room has six players.");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 18)
      throw Error("Use a name between 1 and 18 characters.");
    name = name.trim();
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      throw Error("Choose another name. This name is taken.");
    const p = {
      id: randomUUID(),
      name,
      ready: false,
      connected: true,
      sent: 0,
      spectator: false,
      color: [
        "#ffbd69",
        "#79d9cc",
        "#c5acff",
        "#ff91aa",
        "#a9d77c",
        "#8ebfff",
      ].find((color) => !this.players.some((p) => p.color === color)),
    };
    this.players.push(p);
    if (!this.host) this.host = p.id;
    this.publish();
    return p;
  }
  active() {
    return this.players.filter((p) => !p.spectator);
  }
  rehost() {
    if (!this.players.some((p) => p.id === this.host && p.connected))
      this.host =
        this.players.find((p) => p.connected)?.id || this.players[0]?.id;
  }
  remove(id) {
    const departing = this.player(id);
    this.players = this.players.filter((p) => p.id !== id);
    this.rehost();
    if (!["Lobby", "GameOver"].includes(this.phase)) {
      if (departing?.role === "Saboteur")
        return this.over(true, "The Saboteur left the expedition.");
      if (this.active().length < 2)
        return this.over(false, "Fewer than two active players remain.");
      if (this.navigator === id) this.navigator = this.active()[0].id;
    }
    this.publish();
  }
  setPhase(phase, duration) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.version++;
    this.deadline = duration ? Date.now() + duration : null;
    this.log(JSON.stringify({ room: this.code, phase, turn: this.turn }));
    if (duration) {
      const v = this.version;
      this.timer = setTimeout(() => {
        if (this.version !== v) return;
        if (phase === "Signal") this.setPhase("Step", this.durations.Step);
        else if (phase === "Vote") this.resolveVote();
        else this.resolve(null);
      }, duration);
      this.timer.unref?.();
    }
    this.publish();
  }
  start(id) {
    if (this.phase !== "Lobby" || id !== this.host)
      throw Error("Only the host starts from the lobby.");
    if (this.players.length < 2)
      throw Error("Invite at least one friend first.");
    if (this.players.some((p) => !p.ready || !p.connected))
      throw Error("Everyone must be connected and ready.");
    Object.assign(this, generateMap());
    this.gameId = randomUUID();
    this.path = [{ x: 0, y: 0 }];
    this.flood = 0;
    this.lives = 3;
    this.feed = [];
    this.turn = 0;
    this.outcome = null;
    this.navigator = null;
    this.voteUsed = false;
    this.ballots = {};
    this.voteResult = null;
    this.resumePhase = null;
    const saboteur =
      this.players.length >= 4 ? randomInt(this.players.length) : -1;
    let honest = 0;
    this.players.forEach((p, i) => {
      p.spectator = false;
      p.role = i === saboteur ? "Saboteur" : "Cartographer";
      if (i !== saboteur) {
        p.row = honest === 0 ? this.treasure.y : (honest - 1) % 7;
        p.col = honest % 7;
        honest++;
      }
    });
    this.roster = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
    }));
    this.next();
  }
  next() {
    this.turn++;
    this.players.forEach((p) => (p.sent = 0));
    const active = this.active();
    const previous = active.findIndex((p) => p.id === this.navigator);
    this.navigator = active[(previous + 1) % active.length].id;
    this.setPhase("Signal", this.durations.Signal);
  }
  validate(id, a, phase) {
    if (
      !this.player(id) ||
      this.player(id).spectator ||
      this.phase !== phase ||
      Date.now() >= this.deadline ||
      a.gameId !== this.gameId ||
      a.turn !== this.turn ||
      a.version !== this.version
    )
      throw Error("This action arrived outside its turn.");
  }
  signal(id, a) {
    this.validate(id, a, "Signal");
    const p = this.player(id);
    if (!Number.isInteger(a.emoji) || !EMOJI[a.emoji])
      throw Error("Choose a signal from the palette.");
    if (p.sent >= 3) throw Error("Three signals used. Wait for the next turn.");
    p.sent++;
    this.feed.push({
      id: randomUUID(),
      playerId: id,
      name: p.name,
      emoji: EMOJI[a.emoji],
      turn: this.turn,
    });
    this.feed = this.feed.slice(-60);
    this.publish();
  }
  pick(id, a) {
    this.validate(id, a, "Step");
    if (id !== this.navigator) throw Error("Wait for your navigation turn.");
    const { x, y } = a,
      last = this.path.at(-1);
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 6 ||
      y < 0 ||
      y > 6 ||
      y < this.flood ||
      Math.abs(x - last.x) + Math.abs(y - last.y) !== 1
    )
      throw Error("Choose an adjacent cell above the water.");
    this.resolve({ x, y });
  }
  resolve(cell) {
    this.setPhase("Resolving");
    let extra = 0;
    if (cell) {
      this.path.push(cell);
      if (this.map[cell.y][cell.x] === "treasure")
        return this.over(true, "Treasure reached!");
      if (this.map[cell.y][cell.x] === "trap") {
        this.lives--;
        extra = 1;
      }
    }
    this.flood += 1 + extra;
    if (this.lives <= 0)
      return this.over(false, "The expedition ran out of lives.");
    if (this.flood >= this.treasure.y + 1)
      return this.over(false, "The tide reached the treasure.");
    this.next();
  }
  callVote(id, a) {
    if (!["Signal", "Step"].includes(this.phase))
      throw Error("Call a vote during Signal or Step.");
    this.validate(id, a, this.phase);
    if (this.voteUsed || !this.roster.some((p) => p.role === "Saboteur"))
      throw Error("No emergency vote is available.");
    this.voteUsed = true;
    this.resumePhase = {
      phase: this.phase,
      remaining: Math.max(1, this.deadline - Date.now()),
    };
    this.electorate = this.active().map((p) => p.id);
    this.ballots = {};
    this.voteTargets = this.active().map((p) => ({ id: p.id, name: p.name }));
    this.setPhase("Vote", this.durations.Vote);
  }
  castVote(id, a) {
    this.validate(id, a, "Vote");
    if (
      !this.electorate.includes(id) ||
      Object.hasOwn(this.ballots, id) ||
      !this.voteTargets.some((p) => p.id === a.target)
    )
      throw Error("Choose one player. Each ballot is final.");
    this.ballots[id] = a.target;
    if (Object.keys(this.ballots).length === this.electorate.length)
      this.resolveVote();
    else this.publish();
  }
  resolveVote() {
    this.setPhase("Resolving");
    const counts = {};
    for (const target of Object.values(this.ballots))
      counts[target] = (counts[target] || 0) + 1;
    const target = Object.keys(counts).find(
      (id) => counts[id] > this.electorate.length / 2,
    );
    this.voteResult = { target: target || null, counts };
    if (target) {
      const role = this.roster.find((p) => p.id === target)?.role;
      if (role === "Saboteur")
        return this.over(true, "The crew identified the Saboteur!");
      this.lives--;
      const p = this.player(target);
      if (p) p.spectator = true;
      if (this.lives <= 0)
        return this.over(false, "The accusation cost the last life.");
      if (this.active().length < 2)
        return this.over(false, "Fewer than two active players remain.");
      if (this.navigator === target) this.navigator = this.active()[0].id;
    }
    const resume = this.resumePhase;
    this.setPhase(resume.phase, resume.remaining);
  }
  again(id) {
    if (this.phase !== "GameOver" || id !== this.host)
      throw Error("The host returns everyone to the lobby.");
    this.map = null;
    this.roster = [];
    this.path = [];
    this.feed = [];
    this.turn = 0;
    this.lives = 3;
    this.flood = 0;
    this.navigator = null;
    this.outcome = null;
    this.voteUsed = false;
    this.voteResult = null;
    this.ballots = {};
    this.gameId = "";
    this.players.forEach((p) => {
      p.ready = false;
      p.spectator = false;
      p.role = null;
      p.row = null;
      p.col = null;
      p.sent = 0;
    });
    this.setPhase("Lobby");
  }
  over(win, reason) {
    this.outcome = { win, reason };
    this.setPhase("GameOver");
  }
  public() {
    return {
      code: this.code,
      host: this.host,
      players: this.players.map(
        ({ id, name, ready, connected, sent, spectator, color }) => ({
          id,
          name,
          ready,
          connected,
          sent,
          spectator,
          color,
        }),
      ),
      phase: this.phase,
      version: this.version,
      gameId: this.gameId,
      turn: this.turn,
      deadline: this.deadline,
      serverTime: Date.now(),
      navigator: this.navigator,
      lives: this.lives,
      flood: this.flood,
      path: this.path,
      feed: this.feed,
      outcome: this.outcome,
      voteAvailable:
        !this.voteUsed &&
        Boolean(this.roster?.some((p) => p.role === "Saboteur")),
      voteCount: this.phase === "Vote" ? Object.keys(this.ballots).length : 0,
      voteTargets: this.phase === "Vote" ? this.voteTargets : [],
      voteResult:
        this.phase === "Vote" || !this.voteResult
          ? null
          : { target: this.voteResult.target },
      visited: this.path.map(({ x, y }) => ({
        x,
        y,
        type: this.map?.[y][x] || "safe",
      })),
      ...(this.phase === "GameOver"
        ? { map: this.map, roles: this.roster, votes: this.ballots }
        : {}),
    };
  }
  private(id) {
    const p = this.player(id);
    return {
      id,
      role: p.role || "Cartographer",
      row: p.row,
      col: p.col,
      ballot: this.phase === "Vote" ? this.ballots[id] || null : null,
      cells: this.map
        ? this.map.flatMap((row, y) =>
            row.flatMap((type, x) =>
              p.role === "Saboteur" || y === p.row || x === p.col
                ? [{ x, y, type }]
                : [],
            ),
          )
        : [],
    };
  }
  publish() {
    this.emit(this);
  }
  close() {
    clearTimeout(this.timer);
  }
}
module.exports = { Game, generateMap, EMOJI };
