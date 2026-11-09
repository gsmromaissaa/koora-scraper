const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function scrapeOne(url) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  const html = await page.content();
  await browser.close();

  const matches = [];
  const regex = /([أ-يa-zA-Z\s\.]{3,30})\s*(?:<[^>]+>)*\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:<[^>]+>)*\s*([أ-يa-zA-Z\s\.]{3,30})/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (m[1].trim().length < 3 || m[3].trim().length < 3) continue;
    if (m[1].trim() === m[3].trim()) continue;
    matches.push({ team1: m[1].trim(), team2: m[3].trim(), time: m[2].trim(), score: "0 - 0", status: "لم تبدأ بعد", matchUrl: url, source: url });
  }
  return matches;
}

(async () => {
  const sites = ["https://kooralive.la/", "https://www.kora90m.com/", "https://live-sports-channel.com/", "https://kooralive.asia/"];
  let all = [];
  for (const site of sites) {
    try {
      const m = await scrapeOne(site);
      if (m.length > 0) { all = m; console.log("جبت من: " + site + " العدد: " + m.length); break; }
    } catch (e) { console.log("فشل: " + site); }
  }
  console.log(JSON.stringify({ matches: all }));
  // هنا غادي نصيفطو لـ KV
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const kvId = process.env.KV_NAMESPACE_ID;
  if (accountId && apiToken && kvId && all.length > 0) {
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/matches`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: Date.now(), matches: all })
    });
    console.log("صيفطنا لـ KV");
  }
})();
