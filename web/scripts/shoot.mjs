import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "D:\\Smartgrow Projects\\rankpath\\web\\public\\shots";

function cookieFrom(res) {
  const sc = res.headers.getSetCookie?.() || [];
  for (const c of sc) {
    const m = /rp_session=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

async function getPaidCookie() {
  const email = `shot${Date.now()}@example.com`;
  let res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret123", name: "Demo Student", phone: "9876543210", category: "OPEN", domicileState: "AP", neetRank: 28500 }),
  });
  let token = cookieFrom(res);
  if (!token) throw new Error("no cookie from register");

  const create = await fetch(`${BASE}/api/payment/create`, {
    method: "POST", headers: { cookie: `rp_session=${token}` },
  });
  const { paymentId } = await create.json();

  const confirm = await fetch(`${BASE}/api/payment/confirm`, {
    method: "POST", headers: { "content-type": "application/json", cookie: `rp_session=${token}` },
    body: JSON.stringify({ paymentId }),
  });
  token = cookieFrom(confirm) || token; // refreshed cookie carries paid=true
  return token;
}

const WIDTH = 1440, HEIGHT = 960;

async function shoot(page, path, file, waitFor, settle = 1500) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, settle)); // let charts/data render in
  await page.screenshot({ path: `${OUT}\\${file}`, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log("saved", file);
}

const token = await getPaidCookie();
console.log("paid cookie acquired");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars"],
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.setCookie({ name: "rp_session", value: token, domain: "localhost", path: "/" });

await shoot(page, "/predict", "predict.png", null);
await shoot(page, "/strategy", "strategy.png", null, 4000);
await shoot(page, "/dashboard", "dashboard.png", ".recharts-surface");
await shoot(page, "/predict/results?rank=28500&category=OPEN&quota=AIQ", "results.png", null);
await shoot(page, "/predict/results", "results-profile.png", null, 3500);
await shoot(page, "/cutoff-explorer", "cutoff.png", "table");
await shoot(page, "/college/col_ap_5e763a2b669f", "college.png", null, 2000);
// click the Fees tab and capture the breakdown
await page.goto(`${BASE}/college/col_ap_5e763a2b669f`, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Fees");
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}\\college-fees.png`, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
console.log("saved college-fees.png");
// Seat Matrix tab on a college with real sanctioned seats
await page.goto(`${BASE}/college/col_6175678877`, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Seat Matrix");
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: `${OUT}\\college-seats.png`, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
console.log("saved college-seats.png");

await browser.close();
console.log("done");
