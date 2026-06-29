import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://predictor.v4edu.in/";
const OUT = process.argv[3] || "D:\\Smartgrow Projects\\rankpath\\web\\public\\shots\\v4edu.png";
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 900);
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => console.log("nav warn:", e.message));
await new Promise((r) => setTimeout(r, 2500));
// top of page (hero)
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
console.log("saved", OUT);
// full page too
const full = OUT.replace(/\.png$/, "-full.png");
await page.screenshot({ path: full, fullPage: true });
console.log("saved", full);
await browser.close();
