import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.argv[2];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => console.log("nav:", e.message));
await new Promise((r) => setTimeout(r, 3000));
const FILTER = process.argv[3] ? new RegExp(process.argv[3], "i") : /cutoff|medi|allot|\.pdf/i;
const links = await page.evaluate(() =>
  [...document.querySelectorAll("a")].map((a) => ({ t: (a.textContent || "").trim().slice(0, 70), h: a.href }))
);
const out = links.filter((x) => FILTER.test(x.t + " " + x.h));
console.log(JSON.stringify(out, null, 1));
await browser.close();
