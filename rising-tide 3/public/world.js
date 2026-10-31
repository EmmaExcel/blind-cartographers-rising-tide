import * as THREE from "/vendor/three/three.module.js";
// This renderer receives only the same sanitized view as the flat chart.
// It never generates or fetches hidden game terrain.
const host = document.getElementById("world");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xb9d4cd, 1);
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "3D island. Tap an outlined tile, then confirm your step.",
  );
  document.getElementById("worldfallback").hidden = true;
} catch (error) {
  document.body.classList.add("no-webgl");
  const fallback = document.getElementById("worldfallback");
  fallback.textContent =
    "3D is unavailable on this device. Your flat chart has the same clues and controls.";
  fallback.classList.add("error");
  document.getElementById("chartpanel").hidden = false;
  document.getElementById("charttoggle").textContent = "Close flat chart ↑";
  document.getElementById("charttoggle").setAttribute("aria-expanded", "true");
}
if (renderer) start();
function start() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9d4cd, 22, 52);
  const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100);
  let topView = false,
    crewFocus = false;
  const ambient = new THREE.HemisphereLight(0xeaf4f0, 0x5c7775, 1.8);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe2ac, 2.5);
  sun.position.set(-4, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    innerWidth < 600 ? 512 : 1024,
    innerWidth < 600 ? 512 : 1024,
  );
  Object.assign(sun.shadow.camera, {
    left: -7,
    right: 7,
    top: 7,
    bottom: -7,
    near: 0.1,
    far: 30,
  });
  sun.shadow.bias = -0.002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb9e9e5, 1.4);
  fill.position.set(5, 4, -5);
  scene.add(fill);
  const mat = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const sand = mat(0xd1c69d),
    rock = mat(0x73978a),
    grass = mat(0x8da587),
    dark = mat(0x315d53),
    waterMat = mat(0x75afa8, {
      transparent: true,
      opacity: 0.85,
      roughness: 0.28,
      metalness: 0.15,
    });
  function mesh(geo, material, parent = scene, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(w, h, d, material, parent = scene, x = 0, y = 0, z = 0) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  function sphere(r, material, parent = scene, x = 0, y = 0, z = 0) {
    return mesh(new THREE.SphereGeometry(r, 12, 8), material, parent, x, y, z);
  }
  const oceanGeo = new THREE.PlaneGeometry(120, 120, 32, 32);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = mesh(
    oceanGeo,
    mat(0x6f9b9c, { roughness: 0.65, metalness: 0.12 }),
    scene,
    0,
    -0.65,
    0,
  );
  ocean.castShadow = false;
  const foamMarks = [];
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.4,
      r = 5 + (i % 4) * 1.5;
    const mark = box(
      0.2 + (i % 3) * 0.13,
      0.015,
      0.025,
      mat(0xb8d8cd),
      scene,
      Math.cos(angle) * r,
      -0.5,
      Math.sin(angle) * r,
    );
    mark.rotation.y = i * 0.7;
    mark.castShadow = false;
    foamMarks.push(mark);
  }
  const island = new THREE.Group();
  scene.add(island);
  box(7.5, 0.8, 7.5, rock, island, 0, -0.6, 0);
  box(7.35, 0.2, 7.35, sand, island, 0, -0.12, 0);
  // Broken shoreline stones and reeds are decorative, unrelated to secret cells.
  for (let i = 0; i < 42; i++) {
    const edge = i % 4,
      t = (((i / 42) * 39) % 7) - 3.5;
    const x = edge < 2 ? (edge === 0 ? -3.85 : 3.85) : t,
      z = edge >= 2 ? (edge === 2 ? -3.85 : 3.85) : t;
    const stone = mesh(
      new THREE.DodecahedronGeometry(0.2 + (i % 4) * 0.055, 0),
      i % 3 === 0 ? sand : rock,
      island,
      x,
      -0.2,
      z,
    );
    stone.scale.set(1.4, 0.8, 1.1);
    stone.rotation.set(i * 0.2, i * 0.8, 0);
  }
  function tree(x, z, scale = 1) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(scale);
    box(0.09, 0.65, 0.09, mat(0x8b7e55), t, 0, 0.2, 0);
    const a = mesh(new THREE.ConeGeometry(0.35, 0.72, 5), grass, t, 0, 0.73, 0);
    a.rotation.y = 0.4;
    mesh(new THREE.ConeGeometry(0.27, 0.6, 5), mat(0x668b70), t, 0, 1.05, 0);
    scene.add(t);
  }
  tree(-4, -2.5, 0.8);
  tree(3.9, -2.9, 0.7);
  tree(3.85, -2.1, 0.55);
  tree(-3.9, -3.1, 0.65);
  const tiles = [],
    decorations = new THREE.Group(),
    crew = new THREE.Group(),
    route = new THREE.Group();
  scene.add(decorations, crew, route);
  const materials = {
    unknown: mat(0x92a6a8),
    safe: mat(0xa2b78d),
    trap: mat(0xb98263),
    treasure: mat(0xd9bd72),
  };
  const tileGeometry = new THREE.BoxGeometry(0.93, 0.22, 0.93);
  const outlineGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(0.97, 0.25, 0.97),
  );
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const tile = mesh(
        tileGeometry,
        materials.unknown,
        scene,
        x - 3,
        0.05,
        3 - y,
      );
      tile.userData = { x, y };
      const edge = new THREE.LineSegments(
        outlineGeometry,
        new THREE.LineBasicMaterial({ color: 0xffdf92 }),
      );
      edge.visible = false;
      tile.add(edge);
      tile.userData.outline = edge;
      tiles.push(tile);
    }
  // Coordinates remain readable from either camera angle.
  const labelTextures = [];
  function label(text, color = "#4b6a59", scale = 0.35) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.font = "500 33px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    labelTextures.push(tex);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, depthWrite: false }),
    );
    sprite.scale.set(scale * 2, scale, 1);
    return sprite;
  }
  for (let x = 0; x < 7; x++) {
    const s = label(String.fromCharCode(65 + x));
    s.position.set(x - 3, 0.25, 3.72);
    scene.add(s);
  }
  for (let y = 0; y < 7; y++) {
    const s = label(String(y + 1));
    s.position.set(-3.74, 0.25, 3 - y);
    scene.add(s);
  }
  const flood = mesh(
    new THREE.BoxGeometry(7.3, 0.12, 1),
    waterMat,
    scene,
    0,
    0.24,
    4,
  );
  flood.castShadow = false;
  const foam = box(7.25, 0.025, 0.045, mat(0xe1ead4), scene, 0, 0.32, 4);
  foam.castShadow = false;
  let targetFlood = 0,
    currentFlood = 0,
    view = null,
    actors = [],
    destination = new THREE.Vector3(-3, 0.3, 3),
    selected = null,
    lastViewKey = "",
    time = 0;
  const confettiGeometry = new THREE.BufferGeometry(),
    confettiPositions = new Float32Array(90);
  for (let i = 0; i < 30; i++) {
    confettiPositions[i * 3] = Math.sin(i * 12.3) * 3;
    confettiPositions[i * 3 + 1] = i / 5;
    confettiPositions[i * 3 + 2] = Math.cos(i * 3.7) * 3;
  }
  confettiGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(confettiPositions, 3),
  );
  const celebration = new THREE.Points(
    confettiGeometry,
    new THREE.PointsMaterial({
      color: 0xffdc79,
      size: 0.09,
      transparent: true,
      opacity: 0.9,
    }),
  );
  scene.add(celebration);
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  function explorer(color, index) {
    const root = new THREE.Group(),
      body = new THREE.Group();
    root.add(body);
    const coat = mat(color),
      boots = mat(0x344a42),
      skin = mat(
        [0xc78f69, 0x9a6547, 0xdfb28b, 0x704a37, 0xbd8054, 0xe3b599][index % 6],
      ),
      hair = mat(0x403e32),
      hat = mat(0xddca91),
      bag = mat(0x756d48);
    const legs = [];
    for (const side of [-1, 1]) {
      const limb = new THREE.Group();
      limb.position.set(side * 0.075, 0.17, 0);
      box(0.105, 0.19, 0.11, boots, limb, 0, -0.02, 0);
      box(0.11, 0.06, 0.17, boots, limb, 0, -0.12, 0.025);
      body.add(limb);
      legs.push(limb);
    }
    const torso = mesh(
      new THREE.CapsuleGeometry(0.15, 0.18, 3, 8),
      coat,
      body,
      0,
      0.38,
      0,
    );
    torso.scale.z = 0.8;
    sphere(0.145, skin, body, 0, 0.69, 0.005);
    box(0.22, 0.06, 0.12, hair, body, 0, 0.79, -0.045);
    // Safari hat, scarf, backpack, gloved hands and face distinguish a person from a token.
    mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.035, 12),
      hat,
      body,
      0,
      0.81,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(0.14, 0.17, 0.11, 10),
      hat,
      body,
      0,
      0.875,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(0.173, 0.173, 0.025, 10),
      coat,
      body,
      0,
      0.84,
      0,
    );
    box(0.12, 0.18, 0.09, bag, body, 0, 0.41, -0.16);
    box(0.035, 0.23, 0.035, hat, body, -0.09, 0.4, -0.12);
    box(0.035, 0.23, 0.035, hat, body, 0.09, 0.4, -0.12);
    const scarf = mesh(
      new THREE.TorusGeometry(0.12, 0.032, 5, 10),
      mat(0xe8d49b),
      body,
      0,
      0.535,
      0,
    );
    scarf.rotation.x = Math.PI / 2;
    box(0.06, 0.14, 0.025, mat(0xe8d49b), body, 0.08, 0.45, 0.13);
    const arms = [];
    for (const side of [-1, 1]) {
      const limb = new THREE.Group();
      limb.position.set(side * 0.18, 0.45, 0);
      box(0.075, 0.22, 0.08, coat, limb, 0, -0.07, 0);
      sphere(0.048, skin, limb, 0, -0.2, 0);
      body.add(limb);
      arms.push(limb);
    }
    for (const side of [-1, 1])
      sphere(0.013, hair, body, side * 0.05, 0.7, 0.135);
    const ring = mesh(
      new THREE.TorusGeometry(0.27, 0.025, 5, 24),
      mat(color, { emissive: color, emissiveIntensity: 0.15 }),
      root,
      0,
      0.015,
      0,
    );
    ring.rotation.x = Math.PI / 2;
    const lantern = new THREE.Group();
    box(
      0.085,
      0.12,
      0.085,
      mat(0xf3c260, { emissive: 0xe6aa33, emissiveIntensity: 0.65 }),
      lantern,
      0.25,
      0.25,
      0.08,
    );
    const handle = mesh(
      new THREE.TorusGeometry(0.045, 0.012, 4, 8),
      boots,
      lantern,
      0.25,
      0.34,
      0.08,
    );
    root.add(lantern);
    root.userData = { body, arms, legs, ring, lantern, index };
    root.scale.setScalar(1.05);
    crew.add(root);
    return root;
  }
  function disposeGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse((o) => {
        if (o.userData.ownedGeometry) o.geometry?.dispose();
        if (o.userData.ownedMaterial) o.material?.dispose();
      });
    }
  }
  function setCrew(players) {
    for (const a of actors) {
      crew.remove(a);
      a.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && !Array.isArray(o.material)) o.material.dispose();
      });
    }
    actors = players.map((p, i) => {
      const a = explorer(p.color, i);
      a.userData.id = p.id;
      a.position.copy(destination);
      return a;
    });
  }
  let crewKey = "";
  const traps = [],
    treasures = [];
  function clearDetails() {
    decorations.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
    decorations.clear();
    traps.length = 0;
    treasures.length = 0;
    route.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
    route.clear();
  }
  function rebuild() {
    const s = view?.shared,
      p = view?.privateState || {},
      id = view?.id;
    const playing = s && s.phase !== "Lobby";
    const key = JSON.stringify([
      s?.gameId,
      s?.phase,
      s?.flood,
      s?.players?.map((p) => [p.id, p.color, p.connected, p.spectator]),
      s?.path,
      p.cells,
      s?.map,
      s?.navigator,
      view?.connected,
    ]);
    if (key === lastViewKey) return;
    lastViewKey = key;
    const demoPlayers = [
      { id: "a", color: "#dcac61" },
      { id: "b", color: "#70a59a" },
      { id: "c", color: "#cc7862" },
    ];
    const players = s?.players || demoPlayers;
    const newCrewKey = players.map((p) => p.id + ":" + p.color).join(",");
    if (newCrewKey !== crewKey) {
      crewKey = newCrewKey;
      setCrew(players);
    }
    const last = playing ? s.path.at(-1) : { x: 2, y: 1 };
    destination.set(last.x - 3, 0.21, 3 - last.y);
    targetFlood = playing ? s.flood : 0;
    clearDetails();
    const me = players.find((p) => p.id === id),
      canMove =
        playing &&
        s.phase === "Step" &&
        s.navigator === id &&
        !me?.spectator &&
        view.connected;
    for (const tile of tiles) {
      const { x, y } = tile.userData;
      const known = playing
        ? s.map?.[y]?.[x] ||
          s.visited.find((c) => c.x === x && c.y === y)?.type ||
          p.cells?.find((c) => c.x === x && c.y === y)?.type
        : x < 2 && y > 3
          ? "unknown"
          : x === 4 && y === 5
            ? "treasure"
            : "safe";
      tile.material = materials[known || "unknown"];
      tile.userData.known = known;
      tile.userData.valid =
        canMove &&
        y >= s.flood &&
        Math.abs(x - last.x) + Math.abs(y - last.y) === 1;
      tile.userData.outline.visible = Boolean(tile.userData.valid);
      tile.userData.outline.material.color.setHex(
        selected?.x === x && selected?.y === y ? 0xffffff : 0xffdf92,
      );
      if (known === "trap") {
        for (let j = 0; j < 3; j++) {
          const spike = mesh(
            new THREE.ConeGeometry(0.095, 0.28, 4),
            mat(0x765d49),
            decorations,
            x - 3 + (j - 1) * 0.21,
            0.27,
            3 - y,
          );
          traps.push(spike);
        }
      } else if (known === "treasure") {
        box(0.48, 0.14, 0.38, mat(0x86643c), decorations, x - 3, 0.23, 3 - y);
        box(0.5, 0.1, 0.4, mat(0xd2aa56), decorations, x - 3, 0.34, 3 - y);
        const jewel = mesh(
          new THREE.OctahedronGeometry(0.16),
          mat(0xf5cd70, {
            emissive: 0xc39935,
            emissiveIntensity: 0.3,
            metalness: 0.4,
            roughness: 0.25,
          }),
          decorations,
          x - 3,
          0.66,
          3 - y,
        );
        treasures.push(jewel);
      } else if (
        known === "safe" &&
        !s?.path?.some((c) => c.x === x && c.y === y) &&
        (x * 3 + y) % 5 === 0
      ) {
        const tuft = mesh(
          new THREE.ConeGeometry(0.075, 0.18, 4),
          mat(0x628765),
          decorations,
          x - 3 - 0.22,
          0.24,
          3 - y - 0.2,
        );
      }
    }
    if (playing) {
      for (let i = 1; i < s.path.length; i++) {
        const a = s.path[i - 1],
          b = s.path[i];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const segment = box(
          dx ? 1.0 : 0.065,
          0.025,
          dy ? 1.0 : 0.065,
          mat(0xf2d490),
          route,
          (a.x + b.x) / 2 - 3,
          0.19,
          3 - (a.y + b.y) / 2,
        );
        segment.castShadow = false;
      }
    }
    document.getElementById("worldlabel").textContent = playing
      ? "YOUR FRAGMENT OF THE ISLAND"
      : s
        ? "BASE CAMP / CREW ASSEMBLING"
        : "THE LOST ARCHIPELAGO";
    document.getElementById("worldcaption").textContent = playing
      ? "Tap a tile to inspect. Only outlined neighbours are valid steps."
      : s
        ? "Your crew. Your expedition."
        : "An island of secrets. A crew you almost trust.";
    document.getElementById("step-selection").hidden =
      !playing || s.phase !== "Step" || s.navigator !== id || me?.spectator;
    if (selected) {
      const t = tiles.find(
        (t) => t.userData.x === selected.x && t.userData.y === selected.y,
      );
      if (!t?.userData.valid) {
        selected = null;
        document.getElementById("confirmstep").disabled = true;
        document.getElementById("selectedlabel").textContent =
          "Choose a highlighted tile";
      }
    }
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const span = aspect < 1 ? 6.6 : 6.1;
    camera.left = -span * aspect;
    camera.right = span * aspect;
    camera.top = span;
    camera.bottom = -span;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  document.getElementById("camera").onclick = () => {
    crewFocus = false;
    topView = !topView;
    document.getElementById("camera").textContent = topView
      ? "Perspective ↗"
      : "Top view ↗";
  };
  document.getElementById("meetcrew").onclick = () => {
    crewFocus = !crewFocus;
    topView = false;
    document.getElementById("camera").textContent = "Top view ↗";
    document.getElementById("meetcrew").textContent = crewFocus
      ? "Back to island ↗"
      : "Meet the crew ↗";
  };
  const projected = () => {
    const rect = renderer.domElement.getBoundingClientRect();
    return rect;
  };
  let down;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10)
      return;
    const r = projected();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(tiles, false)[0];
    if (!hit) return;
    const { x, y, known, valid } = hit.object.userData;
    selected = { x, y };
    const label = String.fromCharCode(65 + x) + (y + 1);
    document.getElementById("selectedlabel").textContent =
      label + " · " + (known || "uncharted");
    document.getElementById("confirmstep").disabled = !valid;
    lastViewKey = "";
    rebuild();
    if (!valid)
      document.getElementById("selectedlabel").textContent =
        label +
        " · " +
        (known || "uncharted") +
        " · choose an outlined neighbour";
  });
  document.getElementById("confirmstep").onclick = () => {
    if (selected) window.pickExpeditionCell?.(selected);
  };
  function update() {
    view = window.getExpeditionView?.();
    rebuild();
  }
  window.addEventListener("tide:view", update);
  update();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastTime = 0,
    visible = true;
  new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
    },
    { threshold: 0.02 },
  ).observe(host);
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !visible || now - lastTime < 32) return;
    const dt = Math.min((now - lastTime) / 1000, 0.08) || 0.03;
    lastTime = now;
    time += dt;
    const desired = crewFocus
      ? destination.clone().add(new THREE.Vector3(4, 3.3, 6))
      : new THREE.Vector3(
          topView ? 0 : 10,
          topView ? 18 : 13,
          topView ? 0.001 : 13,
        );
    camera.position.lerp(desired, Math.min(1, dt * 5));
    camera.zoom = THREE.MathUtils.damp(camera.zoom, crewFocus ? 4.4 : 1, 5, dt);
    camera.updateProjectionMatrix();
    camera.lookAt(
      crewFocus
        ? destination.clone().add(new THREE.Vector3(0, 0.55, 0))
        : new THREE.Vector3(),
    );
    currentFlood = THREE.MathUtils.damp(currentFlood, targetFlood, 3, dt);
    flood.visible = foam.visible = currentFlood > 0.02;
    flood.scale.z = Math.max(0.01, currentFlood);
    flood.position.z = 3.5 - currentFlood / 2;
    foam.position.z = 3.5 - currentFlood;
    flood.position.y = 0.23 + (reduced ? 0 : Math.sin(time) * 0.018);
    const verts = oceanGeo.attributes.position;
    for (let i = 0; i < verts.count; i++)
      verts.setY(
        i,
        reduced
          ? 0
          : Math.sin(verts.getX(i) * 0.9 + time * 0.65) * 0.06 +
              Math.cos(verts.getZ(i) * 0.7 + time * 0.55) * 0.04,
      );
    verts.needsUpdate = true;
    foamMarks.forEach(
      (m, i) =>
        (m.position.y =
          -0.52 + (reduced ? 0 : Math.sin(time * 0.65 + i) * 0.025)),
    );
    actors.forEach((a, i) => {
      const angle = (i / actors.length) * Math.PI * 2;
      const target = destination
        .clone()
        .add(
          new THREE.Vector3(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2),
        );
      const moving = a.position.distanceTo(target) > 0.035;
      a.position.lerp(target, reduced ? 1 : Math.min(1, dt * 5));
      const u = a.userData;
      a.rotation.y = crewFocus
        ? Math.atan2(
            camera.position.x - a.position.x,
            camera.position.z - a.position.z,
          )
        : playingDirection();
      u.body.position.y = reduced ? 0 : Math.sin(time * 2 + i) * 0.012;
      u.legs.forEach(
        (l, j) =>
          (l.rotation.x =
            moving && !reduced ? Math.sin(time * 13 + j * Math.PI) * 0.4 : 0),
      );
      u.arms.forEach(
        (l, j) => (l.rotation.z = celebration.visible ? (j ? 1 : -1) * 2.4 : 0),
      );
      u.arms.forEach(
        (l, j) =>
          (l.rotation.x =
            moving && !reduced
              ? -Math.sin(time * 13 + j * Math.PI) * 0.35
              : Math.sin(time * 1.7 + i) * 0.06),
      );
      const active = view?.shared?.navigator === u.id;
      u.ring.visible = Boolean(active || !view?.shared);
      u.lantern.visible = Boolean(active);
      u.ring.scale.setScalar(active ? 1.15 : 1);
    });
    celebration.visible = Boolean(
      view?.shared?.phase === "GameOver" && view.shared.outcome?.win,
    );
    if (celebration.visible && !reduced) {
      const positions = confettiGeometry.attributes.position;
      for (let i = 0; i < positions.count; i++)
        positions.setY(i, (positions.getY(i) - dt * 0.8 + 6) % 6);
      positions.needsUpdate = true;
    }
    treasures.forEach((j, i) => {
      if (!reduced) {
        j.rotation.y = time * 0.8;
        j.position.y = 0.66 + Math.sin(time * 2 + i) * 0.045;
      }
    });
    renderer.render(scene, camera);
  }
  function playingDirection() {
    const path = view?.shared?.path;
    if (!path || path.length < 2) return 0.5;
    const a = path.at(-2),
      b = path.at(-1);
    return Math.atan2(b.x - a.x, a.y - b.y);
  }
  requestAnimationFrame(frame);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const f = document.getElementById("worldfallback");
    f.hidden = false;
    f.classList.add("error");
    f.textContent = "3D paused. Use your flat chart to keep playing.";
    document.getElementById("chartpanel").hidden = false;
    document.getElementById("charttoggle").textContent = "Close flat chart ↑";
  });
}
