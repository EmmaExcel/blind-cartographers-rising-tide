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
    durations: { Signal: 1800, Step: 3000 },
  });
  let browser;
  try {
    await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROMIUM_PATH || (await packaged.executablePath()),
      args: packaged.args.filter((a) => a !== "--single-process"),
    });
    const pages = [],
      errors = [];
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
      });
      if (i === 3)
        await context.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type.includes("webgl")) return null;
            return original.call(this, type, ...args);
          };
        });
      const p = await context.newPage();
      p.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("PAGE ERROR", e.message);
      });
      pages.push(p);
    }
    const url = "http://127.0.0.1:" + service.server.address().port;
    for (const p of pages) {
      await p.goto(url);
      if (!(await p.locator("#tutorial").evaluate((e) => e.open)))
        await p.click("#help");
      for (let i = 0; i < 3; i++) await p.click("#tutorialnext");
    }
    await pages[0].fill("#name", "Ada");
    await pages[0].click("#create");
    await pages[0].waitForSelector("#roomcode");
    const code = await pages[0].textContent("#roomcode");
    for (let i = 1; i < 4; i++) {
      await pages[i].fill("#name", "Crew " + i);
      await pages[i].fill("#code", code);
      await pages[i].click("#join");
    }
    for (const p of pages) await p.click("#ready");
    await pages[0].click("#start");
    await pages[0].click("#charttoggle");
    await pages[0].waitForSelector("#grid button");
    for (const p of pages) {
      assert.equal(await p.locator("#grid button").count(), 49);
      assert.ok(
        await p.evaluate(() => document.documentElement.scrollWidth <= 375),
      );
    }
    assert.equal(await pages[0].locator("#world canvas").count(), 1);
    assert.equal(await pages[3].locator("#chartpanel").isVisible(), true);
    assert.ok(
      (await pages[3].textContent("#worldfallback")).includes(
        "3D is unavailable",
      ),
    );
    const saboteurIndex = (
      await Promise.all(pages.map((p) => p.textContent("#clue")))
    ).findIndex((v) => v.includes("You are the Saboteur"));
    assert.ok(saboteurIndex >= 0);
    await pages[0].locator("#palette button").first().click();
    await pages[2].waitForFunction(() =>
      document.querySelector("#feed").textContent.includes("Ada"),
    );
    await pages[0].waitForFunction(
      () =>
        document.querySelector("#banner").textContent ===
        "Your turn to navigate",
    );
    await pages[0].locator("#grid button:enabled").first().click();
    await pages[2].waitForFunction(
      () => document.querySelector("#turn").textContent === "Turn 2",
    );
    // Refresh must restore both role and clues with no second join.
    await pages[saboteurIndex].reload();
    await pages[saboteurIndex].waitForFunction(() =>
      document
        .querySelector("#clue")
        .textContent.includes("You are the Saboteur"),
    );
    await pages[0].click("#callvote");
    await pages[3].waitForSelector("#voting:not([hidden])");
    await pages[0].screenshot({
      path: path.join(previewDir, "game-mobile.png"),
      fullPage: true,
    });
    const name = saboteurIndex === 0 ? "Ada" : "Crew " + saboteurIndex;
    for (const p of pages)
      await p.getByRole("button", { name, exact: true }).click();
    for (const p of pages)
      await p.waitForFunction(
        () => document.querySelector("#banner").textContent === "Crew wins!",
      );
    assert.ok((await pages[0].textContent("#result")).includes(name));
    for (const p of pages) {
      if (await p.locator("#again").isVisible()) {
        await p.click("#again");
        break;
      }
    }
    await pages[0].waitForSelector("#lobby:not([hidden])");
    await pages[0].click("#help");
    assert.equal(
      await pages[0].locator("#tutorial").evaluate((e) => e.open),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: four isolated browsers, 375px layout, WebGL fallback, tutorial, signals, navigation, refresh, secret roles, correct vote, end reveal, replay.",
    );
  } finally {
    await browser?.close();
    await service.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
