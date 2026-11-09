const 【entity-express¦canonical_name=express】 = require('【entity-express¦canonical_name=express】');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = 【entity-express¦canonical_name=express】();
let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
  }
  return browser;
}

async function scrapeSite(url) {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  const html = await page.content();
  await page.close();
  return html;
}

function parseMatches(html, source, baseUrl) {
  const matches = [];
  const regex = /([أ-يa-zA-Z\s\.]{3,30})\s*(?:<[^>]+>)*\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:<[^>]+>)*\s*([أ-يa-zA-Z\s\.]{3,30})/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (m[1].trim().length < 3 || m[3].trim().length < 3) continue;
    if (m[1].trim() === m[3].trim()) continue;
    if (m[1].includes("كورة") || m[1].includes("مباراة")) continue;
    matches.push({ team1: m[1].trim(), team2: m[3].trim(), time: m[2].trim(), score: "0 - 0", status: "لم تبدأ بعد", channel: "", commentator: "", competition: "", matchUrl: baseUrl, source });
  }
  const seen = new Set();
  return matches.filter(x => {
    const k = (x.team1 + x.team2 + x.time).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.json({ ok: false, error: 'خاصك تعطيني url' });
  try {
    const html = await scrapeSite(url);
    let source = "kooralive";
    if (url.includes("kora90m")) source = "kora90m";
    if (url.includes("live-sports")) source = "live-sports";
    const matches = parseMatches(html, source, url);
    res.json({ ok: true, count: matches.length, htmlLength: html.length, matches });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/', (req, res) => res.json({ ok: true, message: 'Scraper خدام' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('خدام على ' + PORT));
