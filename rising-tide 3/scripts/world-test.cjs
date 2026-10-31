const path = require("node:path"),
  fs = require("node:fs"),
  os = require("node:os");
const previewDir =
  process.env.ARTIFACT_DIR || path.join(os.tmpdir(), "rising-tide-previews");
fs.mkdirSync(previewDir, { recursive: true });
const { chromium } = require("playwright");
const packaged = require("@sparticuz/chromium").default;
const { createServer } = require("../server");
const assert = require("node:assert/strict");
(async () => {
  const service = createServer({
    log: () => {},
    durations: { Signal: 1000, Step: 60000 },
  });
  let browser;
  try {
    await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({
      headless: true,
      executablePath: await packaged.executablePath(),
      args: packaged.args.filter((a) => a !== "--single-process"),
    });
    const pages = [],
      errors = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      await context.addInitScript(() =>
        localStorage.setItem("tide-help", "seen"),
      );
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      pages.push(page);
      await page.goto("http://127.0.0.1:" + service.server.address().port);
      await page.fill("#name", i ? "Ben" : "Ada");
    }
    await pages[0].click("#create");
    await pages[0].waitForSelector("#roomcode");
    await pages[1].fill("#code", await pages[0].textContent("#roomcode"));
    await pages[1].click("#join");
    for (const p of pages) await p.click("#ready");
    await pages[0].click("#start");
    await pages[0].waitForFunction(
      () =>
        document.querySelector("#banner").textContent ===
        "Your turn to navigate",
    );
    const p = pages[0];
    assert.equal(await p.locator("#world canvas").count(), 1);
    assert.equal(await p.locator("#chartpanel").isVisible(), false);
    await p.locator("#world").scrollIntoViewIfNeeded();
    const r = await p.locator("#world canvas").boundingBox();
    let selected = false;
    for (let y = 0.38; y < 0.85 && !selected; y += 0.055)
      for (let x = 0.12; x < 0.9 && !selected; x += 0.06) {
        await p.mouse.click(r.x + r.width * x, r.y + r.height * y);
        selected = await p.locator("#confirmstep").isEnabled();
      }
    assert.ok(
      selected,
      "A valid adjacent tile must be selectable in the 3D scene",
    );
    assert.equal(await p.textContent("#turn"), "Turn 1");
    await p.click("#confirmstep");
    await pages[1].waitForFunction(
      () => document.querySelector("#turn").textContent === "Turn 2",
    );
    await p.click("#meetcrew");
    await p.waitForTimeout(500);
    await p.screenshot({
      path: path.join(previewDir, "crew-closeup.png"),
      fullPage: false,
    });
    await p.click("#meetcrew");
    await p.click("#camera");
    assert.equal(await p.textContent("#camera"), "Perspective ↗");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real WebGL canvas raycasting selects a valid cell, confirmation advances both clients, crew close-up and top camera work.",
    );
  } finally {
    await browser?.close();
    await service.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
