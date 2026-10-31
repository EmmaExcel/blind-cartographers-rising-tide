const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const { randomInt, randomBytes } = require("node:crypto");
const { Game } = require("./game");
const path = require("node:path");
function createServer(options = {}) {
  const app = express(),
    server = http.createServer(app),
    io = new Server(server, { maxHttpBufferSize: 4096 });
  const rooms = new Map(),
    sessions = new Map(),
    expiry = new Map();
  let closing = false;
  app.get("/health", (_, res) => res.json({ status: "ok" }));
  app.use(
    "/vendor/three",
    express.static(path.join(__dirname, "../node_modules/three/build")),
  );
  app.use(express.static(path.join(__dirname, "../public")));
  function publish(g) {
    io.to(g.code).emit("state:public", g.public());
    for (const s of io.sockets.sockets.values())
      if (s.data.code === g.code && g.player(s.data.id))
        s.emit("state:private", g.private(s.data.id));
  }
  function remove(token) {
    const session = sessions.get(token);
    if (!session) return;
    clearTimeout(expiry.get(token));
    expiry.delete(token);
    sessions.delete(token);
    const g = rooms.get(session.code);
    if (g) {
      g.remove(session.id);
      if (!g.players.length) {
        g.close();
        rooms.delete(g.code);
      }
    }
  }
  io.on("connection", (s) => {
    let count = 0;
    const interval = setInterval(() => (count = 0), 1000);
    interval.unref();
    function on(event, fn) {
      s.on(event, (a = {}, ack = () => {}) => {
        if (typeof ack !== "function") ack = () => {};
        try {
          if (++count > 20) throw Error("Slow down and try again.");
          if (!a || typeof a !== "object") throw Error("Invalid request.");
          fn(a);
          ack({ ok: true });
        } catch (e) {
          ack({ ok: false, error: e.message });
        }
      });
    }
    function game() {
      const g = rooms.get(s.data.code);
      if (
        !g ||
        !g.player(s.data.id) ||
        sessions.get(s.data.token)?.socketId !== s.id
      )
        throw Error("Join a room first.");
      return g;
    }
    function attach(g, p, token) {
      s.data = { code: g.code, id: p.id, token };
      sessions.set(token, { code: g.code, id: p.id, socketId: s.id });
      p.connected = true;
      s.join(g.code);
      s.emit("session:issued", { id: p.id, code: g.code, token });
      publish(g);
    }
    function join(g, name) {
      if (s.data.id) throw Error("You already joined a room.");
      const p = g.add(name);
      attach(g, p, randomBytes(32).toString("hex"));
    }
    on("room:create", (a) => {
      if (rooms.size >= 1000)
        throw Error("The server is busy. Try again later.");
      let code;
      do {
        code = Array.from({ length: 4 }, () =>
          String.fromCharCode(65 + randomInt(26)),
        ).join("");
      } while (rooms.has(code));
      const g = new Game(code, publish, options);
      try {
        join(g, a.name);
        rooms.set(code, g);
      } catch (e) {
        g.close();
        throw e;
      }
    });
    on("room:join", (a) => {
      const g = rooms.get(
        String(a.code || "")
          .trim()
          .toUpperCase(),
      );
      if (!g) throw Error("Room not found. Check the four-letter code.");
      join(g, a.name);
    });
    on("session:resume", (a) => {
      if (s.data.id) throw Error("This connection already has a seat.");
      const session =
        typeof a.token === "string" ? sessions.get(a.token) : null;
      const g = session && rooms.get(session.code),
        p = g?.player(session.id);
      if (!p) throw Error("Your seat expired. Join a new room.");
      const old = io.sockets.sockets.get(session.socketId);
      if (old) {
        old.data = {};
        old.disconnect(true);
      }
      clearTimeout(expiry.get(a.token));
      expiry.delete(a.token);
      attach(g, p, a.token);
    });
    on("player:ready", (a) => {
      const g = game();
      if (g.phase !== "Lobby") throw Error("Ready is available in the lobby.");
      g.player(s.data.id).ready = a.ready === true;
      publish(g);
    });
    on("game:start", () => game().start(s.data.id));
    on("signal:send", (a) => game().signal(s.data.id, a));
    on("step:pick", (a) => game().pick(s.data.id, a));
    on("vote:call", (a) => game().callVote(s.data.id, a));
    on("vote:cast", (a) => game().castVote(s.data.id, a));
    on("game:again", () => game().again(s.data.id));
    on("clock:sync", () => s.emit("clock:reply", { serverTime: Date.now() }));
    on("room:leave", () => {
      s.leave(s.data.code);
      remove(s.data.token);
      s.data = {};
    });
    s.on("disconnect", () => {
      clearInterval(interval);
      if (closing) return;
      const { token, id, code } = s.data;
      const g = rooms.get(code);
      if (!g || sessions.get(token)?.socketId !== s.id) return;
      const p = g.player(id);
      if (p) p.connected = false;
      g.rehost();
      publish(g);
      const timer = setTimeout(() => remove(token), options.graceMs ?? 60000);
      timer.unref();
      expiry.set(token, timer);
    });
  });
  return {
    app,
    server,
    io,
    rooms,
    close: () =>
      new Promise((resolve) => {
        closing = true;
        for (const t of expiry.values()) clearTimeout(t);
        for (const g of rooms.values()) g.close();
        io.close(() => server.close(() => resolve()));
      }),
  };
}
if (require.main === module) {
  const { server } = createServer();
  server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log("Rising Tide listening"),
  );
}
module.exports = { createServer };
