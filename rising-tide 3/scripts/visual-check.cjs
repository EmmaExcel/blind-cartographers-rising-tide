const path = require("node:path"),
  fs = require("node:fs"),
  os = require("node:os");
const previewDir =
  process.env.ARTIFACT_DIR || path.join(os.tmpdir(), "rising-tide-previews");
fs.mkdirSync(previewDir, { recursive: true });
const { chromium } = require("playwright");
const packaged = require("@sparticuz/chromium").default;
const { createServer } = require("../server");
(async () => {
  const service = createServer({ log: () => {} });
  let browser;
  try {
    await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROMIUM_PATH || (await packaged.executablePath()),
      args: packaged.args.filter((a) => a !== "--single-process"),
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => console.error(e.message));
    await page.addInitScript(() => localStorage.setItem("tide-help", "seen"));
    await page.goto("http://127.0.0.1:" + service.server.address().port);
    await page.waitForSelector("#world canvas");
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(previewDir, "landing-desktop.png"),
      fullPage: true,
    });
    console.log(
      await page.evaluate(() => ({
        canvas: !!document.querySelector("canvas"),
        fallback: document.querySelector("#worldfallback").textContent,
        width: document.documentElement.scrollWidth,
      })),
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(previewDir, "landing-mobile.png"),
      fullPage: true,
    });
  } finally {
    await browser?.close();
    await service.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
