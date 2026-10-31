const $ = (id) => document.getElementById(id),
  socket = io(),
  symbols = { safe: "✅", trap: "⚠️", treasure: "💎" },
  // Wire values stay compatible with rooms already running on the server.
  signalWireValues = [
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
  ],
  signals = [
    {
      label: "North",
      tone: "bearing",
      hint: "Suggest moving toward row 7",
      rotation: 0,
      path: '<path d="m12 3 7 17-7-4-7 4Z"/><path d="M12 3v13"/>',
    },
    {
      label: "East",
      tone: "bearing",
      hint: "Suggest moving toward column G",
      rotation: 90,
      path: '<path d="m12 3 7 17-7-4-7 4Z"/><path d="M12 3v13"/>',
    },
    {
      label: "South",
      tone: "bearing",
      hint: "Suggest moving toward row 1",
      rotation: 180,
      path: '<path d="m12 3 7 17-7-4-7 4Z"/><path d="M12 3v13"/>',
    },
    {
      label: "West",
      tone: "bearing",
      hint: "Suggest moving toward column A",
      rotation: 270,
      path: '<path d="m12 3 7 17-7-4-7 4Z"/><path d="M12 3v13"/>',
    },
    {
      label: "Danger",
      tone: "warning",
      hint: "Warn the crew about a trap",
      path: '<path d="m12 3 9 17H3Z"/><path d="M12 9v5m0 3v.1"/>',
    },
    {
      label: "Safe",
      tone: "safe",
      hint: "Mark safe ground",
      path: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    },
    {
      label: "Treasure",
      tone: "treasure",
      hint: "Point the crew toward the treasure",
      path: '<path d="m3 8 4-4h10l4 4-9 13Z"/><path d="M3 8h18M7 4l2 4 3 13 3-13 2-4"/>',
    },
    {
      label: "Unsure",
      tone: "neutral",
      hint: "Ask the crew to clarify",
      path: '<circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2.5m0 3v.1"/>',
    },
    {
      label: "Agree",
      tone: "safe",
      hint: "Support the crew’s suggestion",
      path: '<path d="M6 21V4m0 1c5-5 7 4 13 0v9c-6 4-8-5-13 0"/><path d="m10 9 2 2 3-3"/>',
    },
    {
      label: "Alarm",
      tone: "warning",
      hint: "React to an urgent threat",
      path: '<path d="M12 7v7m0 3v.1M12 2v1M4.9 4.9l.7.7M2 12h1m18 0h1m-3.6-6.4.7-.7M5 19l2-3m12 3-2-3"/><path d="M8 21h8"/>',
    },
    {
      label: "Hold",
      tone: "neutral",
      hint: "Ask the Navigator to wait",
      path: '<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z"/><path d="M10 8v8m4-8v8"/>',
    },
    {
      label: "Support",
      tone: "safe",
      hint: "Encourage the expedition",
      path: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
    },
  ];
function signalIcon(index) {
  const signal = signals[index] || signals[7];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.65");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // Only constant, application-owned SVG paths enter this markup.
  svg.innerHTML = signal.rotation
    ? '<g transform="rotate(' +
      signal.rotation +
      ' 12 12)">' +
      signal.path +
      "</g>"
    : signal.path;
  return svg;
}

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
  const remainingSignals = 3 - (me?.sent || 0);
  $("allowance").textContent = remainingSignals + " / 3 available";
  $("allowance").setAttribute("aria-live", "polite");
  const signalSection = $("palette").closest(".signal-card");
  signalSection.querySelector("h3").textContent = "Field signals";
  signalSection.querySelector(".micro").textContent = me?.spectator
    ? "You are observing this expedition."
    : s.phase === "Signal"
      ? "Choose a bearing or leave a field mark."
      : s.phase === "Step"
        ? "Navigator choosing. Signals return next turn."
        : s.phase === "Vote"
          ? "Signals paused during the council."
          : "The expedition’s final correspondence.";
  const paletteNodes = [];
  signals.forEach((signal, i) => {
    if (i === 0 || i === 4) {
      const label = document.createElement("span");
      label.className = "signal-group-label";
      label.textContent = i === 0 ? "01 / Bearings" : "02 / Field marks";
      paletteNodes.push(label);
    }
    const b = document.createElement("button");
    b.className = "signal-button signal-tone-" + signal.tone;
    b.setAttribute("aria-label", "Signal " + signal.label);
    b.title = signal.hint;
    const mark = document.createElement("span");
    mark.className = "signal-mark";
    mark.append(signalIcon(i));
    const caption = document.createElement("span");
    caption.className = "signal-caption";
    caption.textContent = signal.label;
    b.append(mark, caption);
    const used = s.feed.filter(
      (f) =>
        f.playerId === id &&
        f.turn === s.turn &&
        f.emoji === signalWireValues[i],
    ).length;
    if (used) {
      const count = document.createElement("span");
      count.className = "signal-sent-count";
      count.textContent = String(used);
      count.setAttribute("aria-label", used + " sent this turn");
      b.append(count);
      b.classList.add("signal-used");
    }
    b.disabled =
      !socket.connected ||
      me?.spectator ||
      s.phase !== "Signal" ||
      remainingSignals <= 0;
    b.onclick = () => send("signal:send", action({ emoji: i }));
    paletteNodes.push(b);
  });
  $("palette").setAttribute("role", "group");
  $("palette").setAttribute("aria-label", "Expedition signals");
  $("palette").replaceChildren(...paletteNodes);
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
        const signalIndex = signalWireValues.indexOf(f.emoji),
          signal = signals[signalIndex] || signals[7];
        const badge = document.createElement("span");
        badge.className = "feed-signal signal-tone-" + signal.tone;
        badge.append(signalIcon(signalIndex));
        const label = document.createElement("span");
        label.textContent = signal.label;
        badge.append(label);
        const turn = document.createElement("span");
        turn.className = "feed-turn";
        turn.textContent = "T" + f.turn;
        li.append(avatar, name, badge, turn);
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
