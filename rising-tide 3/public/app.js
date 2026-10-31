const $ = (id) => document.getElementById(id),
  socket = io(),
  symbols = { safe: "✅", trap: "⚠️", treasure: "💎" },
  palette = [
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
let shared,
  privateState = {},
  id,
  offset = 0,
  lastCue = "",
  lastLives = 3,
  muted = true,
  audio;
try {
  muted = localStorage.getItem("tide-muted") !== "false";
} catch {}
function send(event, data = {}, done = () => {}) {
  if (!socket.connected) {
    $("error").textContent = "Reconnecting. Please wait.";
    return;
  }
  socket.emit(event, data, (r) => {
    if (!r.ok) $("error").textContent = r.error;
    else $("error").textContent = "";
    done(r);
  });
}
function remember(value) {
  try {
    if (value) sessionStorage.setItem("tide-session", JSON.stringify(value));
    else sessionStorage.removeItem("tide-session");
  } catch {}
}
function stored() {
  try {
    return JSON.parse(sessionStorage.getItem("tide-session"));
  } catch {
    return null;
  }
}
socket.on("connect", () => {
  $("connection").textContent = "Connected";
  const seat = stored();
  if (seat)
    send("session:resume", { token: seat.token }, (r) => {
      if (!r.ok) {
        remember(null);
        shared = null;
        privateState = {};
        id = null;
        $("room").hidden = true;
        $("entry").hidden = false;
        document.body.classList.remove("playing");
        $("worldphase").hidden = true;
        window.dispatchEvent(new Event("tide:view"));
      }
    });
});
socket.on("disconnect", () => {
  $("connection").textContent =
    "Reconnecting… Your seat is reserved for 60 seconds.";
  document
    .querySelectorAll("#grid button,#palette button,#ballots button")
    .forEach((b) => (b.disabled = true));
});
socket.on("session:issued", (s) => {
  id = s.id;
  remember(s);
});
socket.on("state:public", (s) => {
  shared = s;
  offset = s.serverTime - Date.now();
  render();
});
socket.on("state:private", (s) => {
  privateState = s;
  render();
});
$("create").onclick = () => send("room:create", { name: $("name").value });
$("join").onclick = () =>
  send("room:join", { name: $("name").value, code: $("code").value });
$("ready").onclick = () =>
  send("player:ready", {
    ready: !shared.players.find((p) => p.id === id).ready,
  });
$("start").onclick = () => send("game:start");
$("leave").onclick = () => {
  send("room:leave", {}, (r) => {
    if (!r.ok) return;
    remember(null);
    shared = null;
    privateState = {};
    id = null;
    $("room").hidden = true;
    $("entry").hidden = false;
    document.body.classList.remove("playing");
    $("worldphase").hidden = true;
    window.dispatchEvent(new Event("tide:view"));
  });
};
function action(data) {
  return {
    ...data,
    gameId: shared.gameId,
    turn: shared.turn,
    version: shared.version,
  };
}
function render() {
  if (!shared) return;
  const s = shared;
  if (s.lives < lastLives) {
    $("world").classList.remove("damage");
    void $("world").offsetWidth;
    $("world").classList.add("damage");
    setTimeout(() => $("world").classList.remove("damage"), 450);
  }
  lastLives = s.lives;
  const cueKey = s.gameId + ":" + s.version;
  if (lastCue !== cueKey) {
    lastCue = cueKey;
    if (
      s.phase === "GameOver" ||
      s.phase === "Vote" ||
      (s.phase === "Step" && s.navigator === id)
    )
      cue();
  }
  const me = s.players.find((p) => p.id === id);
  document.body.classList.toggle("playing", s.phase !== "Lobby");
  $("worldphase").hidden = s.phase === "Lobby";
  window.dispatchEvent(new Event("tide:view"));
  $("entry").hidden = true;
  $("room").hidden = false;
  $("roomcode").textContent = s.code;
  $("players").replaceChildren(
    ...s.players.map((p) => {
      const el = document.createElement("span");
      el.className = "player" + (p.id === id ? " you" : "");
      const avatar = document.createElement("i");
      avatar.className = "player-avatar";
      avatar.style.setProperty("--player", p.color);
      el.append(avatar);
      el.style.borderColor = p.color;
      el.append(
        document.createTextNode(
          p.name +
            (p.id === s.host ? " ♛" : "") +
            (p.spectator ? " · spectator" : p.ready ? " ✓" : "") +
            (p.connected ? "" : " · offline"),
        ),
      );
      return el;
    }),
  );
  $("lobby").hidden = s.phase !== "Lobby";
  $("game").hidden = s.phase === "Lobby";
  $("start").hidden = s.host !== id;
  $("ready").textContent = me?.ready ? "Ready ✓" : "Ready";
  if (s.phase === "Lobby") {
    privateState = {};
    return;
  }
  $("banner").classList.toggle(
    "your-turn",
    s.phase === "Step" && s.navigator === id,
  );
  $("lives").textContent = "❤️ " + s.lives + " lives";
  $("flood").textContent = "🌊 " + s.flood + "/7";
  $("turn").textContent = "Turn " + s.turn;
  const nav = s.players.find((p) => p.id === s.navigator);
  $("phaselabel").textContent =
    s.phase === "Step"
      ? "CHOOSE THE NEXT STEP"
      : s.phase === "Vote"
        ? "EMERGENCY COUNCIL"
        : s.phase === "GameOver"
          ? "EXPEDITION COMPLETE"
          : "READ YOUR CHART · GUIDE YOUR CREW";
  $("banner").textContent =
    s.phase === "GameOver"
      ? s.outcome.win
        ? "Crew wins!"
        : "Crew loses"
      : s.phase === "Vote"
        ? "Emergency vote"
        : s.phase === "Signal"
          ? "Read your clues. Send signals."
          : s.navigator === id
            ? "Your turn to navigate"
            : (nav?.name || "Crew") + " is navigating";
  $("clue").textContent =
    s.phase === "GameOver"
      ? "The complete chart, revealed."
      : privateState.role === "Saboteur"
        ? "You are the Saboteur. Mislead the crew. You win if the crew loses."
        : `Your private chart: row ${(privateState.row ?? 0) + 1} + column ${String.fromCharCode(65 + (privateState.col ?? 0))}`;
  const last = s.path.at(-1);
  $("grid").replaceChildren();
  for (let y = 6; y >= 0; y--)
    for (let x = 0; x < 7; x++) {
      const b = document.createElement("button"),
        known =
          s.map?.[y]?.[x] ||
          s.visited.find((c) => c.x === x && c.y === y)?.type ||
          privateState.cells?.find((c) => c.x === x && c.y === y)?.type;
      const visited = s.path.some((c) => c.x === x && c.y === y);
      b.className =
        "cell" + (y < s.flood ? " water" : "") + (visited ? " visited" : "");
      b.textContent =
        last?.x === x && last?.y === y ? "●" : known ? symbols[known] : "·";
      const coord = document.createElement("small");
      coord.textContent = String.fromCharCode(65 + x) + (y + 1);
      b.append(coord);
      b.setAttribute(
        "aria-label",
        `${String.fromCharCode(65 + x)}${y + 1}: ${known || "unknown"}${visited ? ", path" : ""}${y < s.flood ? ", flooded" : ""}`,
      );
      b.disabled =
        !socket.connected ||
        me?.spectator ||
        s.phase !== "Step" ||
        s.navigator !== id ||
        y < s.flood ||
        Math.abs(x - last.x) + Math.abs(y - last.y) !== 1;
      b.onclick = () => send("step:pick", action({ x, y }));
      $("grid").append(b);
    }
  $("allowance").textContent = `(${3 - (me?.sent || 0)} left)`;
  $("palette").replaceChildren(
    ...palette.map((emoji, i) => {
      const b = document.createElement("button");
      b.textContent = emoji;
      b.disabled =
        !socket.connected ||
        me?.spectator ||
        s.phase !== "Signal" ||
        me?.sent >= 3;
      b.onclick = () => send("signal:send", action({ emoji: i }));
      return b;
    }),
  );
  $("feed").replaceChildren(
    ...s.feed
      .slice(-12)
      .reverse()
      .map((f) => {
        const li = document.createElement("li");
        const avatar = document.createElement("i");
        avatar.className = "player-avatar";
        avatar.style.setProperty(
          "--player",
          s.players.find((p) => p.id === f.playerId)?.color || "#8aaa8b",
        );
        const name = document.createElement("span");
        name.textContent = f.name;
        const emoji = document.createElement("span");
        emoji.className = "feed-emoji";
        emoji.textContent = f.emoji;
        const turn = document.createElement("span");
        turn.className = "feed-turn";
        turn.textContent = "T" + f.turn;
        li.append(avatar, name, emoji, turn);
        return li;
      }),
  );
  $("result").hidden = s.phase !== "GameOver";
  $("result").textContent = s.outcome
    ? `${s.outcome.reason} ${s.roles?.some((p) => p.role === "Saboteur") ? "Saboteur: " + s.roles.find((p) => p.role === "Saboteur").name + ". " + (s.outcome.win ? "Saboteur loses." : "Saboteur wins.") : "Pure co-op. No Saboteur."} Path: ${s.path.map((c) => String.fromCharCode(65 + c.x) + (c.y + 1)).join(" → ")}`
    : "";
  $("again").hidden = s.phase !== "GameOver" || s.host !== id;
  $("callvote").hidden =
    !s.voteAvailable || !["Signal", "Step"].includes(s.phase) || me?.spectator;
  $("voting").hidden = s.phase !== "Vote";
  $("votestatus").textContent = privateState.ballot
    ? "Your secret ballot is locked."
    : `${s.voteCount} ballots received. A majority means more than half of eligible players.`;
  $("ballots").replaceChildren(
    ...s.voteTargets.map((p) => {
      const b = document.createElement("button");
      b.textContent = p.name;
      b.disabled =
        !socket.connected || me?.spectator || Boolean(privateState.ballot);
      b.onclick = () => send("vote:cast", action({ target: p.id }));
      return b;
    }),
  );
  $("voteresult").textContent = s.voteResult
    ? s.voteResult.target
      ? "The crew accused " +
        (s.players.find((p) => p.id === s.voteResult.target)?.name ||
          "a departed player") +
        "."
      : "No majority. The expedition continues."
    : "";
}
setInterval(() => {
  if (!shared?.deadline) {
    $("timer").textContent = "";
    $("worldphase").textContent =
      shared?.phase === "GameOver"
        ? shared.outcome.win
          ? "Crew wins · expedition complete"
          : "Lost to the tide"
        : "";
    $("bar").style.width = "0%";
    return;
  }
  const remaining = Math.max(0, shared.deadline - Date.now() - offset);
  $("timer").textContent =
    `${shared.phase} · ${Math.ceil(remaining / 1000)} seconds`;
  $("worldphase").textContent =
    shared.phase +
    " · " +
    Math.ceil(remaining / 1000) +
    "s" +
    (shared.phase === "Step"
      ? shared.navigator === id
        ? " · Your turn"
        : " · Navigator choosing"
      : "");
  $("bar").style.width =
    Math.min(
      100,
      (remaining / (shared.phase === "Step" ? 10000 : 15000)) * 100,
    ) + "%";
}, 100);

$("callvote").onclick = () => send("vote:call", action({}));
$("again").onclick = () => send("game:again");
const lessons = [
  [
    "Read your private chart",
    "Start at A1. Only your assigned row and column are visible. The team shares one position, represented by your explorers. Reach 💎 before the rising tide reaches its row.",
  ],
  [
    "Guide the Navigator",
    "Signal lasts 15 seconds. Send up to three emoji using the palette. In Step, the Navigator has 10 seconds to tap an adjacent cell. Blue flooded cells are blocked. A missed turn still raises water.",
  ],
  [
    "Trust, traps and betrayal",
    "Traps cost one of three lives and raise water two rows. With 4–6 players, one secret Saboteur sees the whole map and wins if the crew loses. One emergency vote pauses play: a majority finding the Saboteur wins. A wrong accusation costs one life and makes the accused a spectator. No majority spends the vote.",
  ],
];
let lesson = 0;
function showLesson() {
  const [title, text] = lessons[lesson];
  $("tutorialstep").textContent = `${lesson + 1} / 3`;
  $("tutorialtitle").textContent = title;
  $("tutorialtext").textContent = text;
  $("tutorialnext").textContent = lesson === 2 ? "Ready to explore" : "Next";
  if (!$("tutorial").open) $("tutorial").showModal();
}
$("help").onclick = () => {
  lesson = 0;
  showLesson();
};
$("tutorialnext").onclick = () => {
  if (lesson < 2) {
    lesson++;
    showLesson();
  } else {
    $("tutorial").close();
    try {
      localStorage.setItem("tide-help", "seen");
    } catch {}
  }
};
try {
  if (!localStorage.getItem("tide-help")) showLesson();
} catch {
  showLesson();
}

function cue() {
  if (muted) return;
  try {
    if (audio?.state === "running") {
      const tone = audio.createOscillator(),
        gain = audio.createGain();
      tone.connect(gain);
      gain.connect(audio.destination);
      tone.frequency.value = 660;
      gain.gain.setValueAtTime(0.05, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
      tone.start();
      tone.stop(audio.currentTime + 0.15);
    }
    navigator.vibrate?.(70);
  } catch {}
}
function muteLabel() {
  $("mute").textContent = muted ? "Sound off" : "Sound on";
  $("mute").setAttribute("aria-pressed", String(muted));
}
$("mute").onclick = () => {
  muted = !muted;
  try {
    localStorage.setItem("tide-muted", String(muted));
    if (!muted) {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      audio
        .resume()
        .then(cue)
        .catch(() => {});
    }
  } catch {}
  muteLabel();
};
muteLabel();

window.getExpeditionView = () => ({
  shared,
  privateState,
  id,
  connected: socket.connected,
});
window.pickExpeditionCell = (cell) => {
  if (shared) send("step:pick", action(cell));
};
$("charttoggle").onclick = () => {
  const open = $("chartpanel").hidden;
  $("chartpanel").hidden = !open;
  $("charttoggle").setAttribute("aria-expanded", String(open));
  $("charttoggle").textContent = open
    ? "Close flat chart ↑"
    : "Open flat chart ↓";
};
$("copycode").onclick = async () => {
  try {
    await navigator.clipboard.writeText(shared.code);
    $("copycode").textContent = "Copied ✓";
    setTimeout(() => ($("copycode").textContent = "Copy code"), 1500);
  } catch {
    $("error").textContent = "Your expedition code is " + shared.code;
  }
};
