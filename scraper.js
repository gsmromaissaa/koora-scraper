const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// هادا هو Parser ديال دوك 4 المواقع اللي عطيتيني فالأول
function parseMatches(html, source, baseUrl) {
  const matches = [];
  // كنقلبو على: فريق + وقت + فريق
  const regex = /([أ-يa-zA-Z\s\.]{3,30})\s*(?:<[^>]+>)*\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:<[^>]+>)*\s*([أ-يa-zA-Z\s\.]{3,30})/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const team1 = m[1].trim();
    const time = m[2].trim();
    const team2 = m[3].trim();
    if (team1.length < 3 || team2.length < 3) continue;
    if (team1 === team2) continue;
    if (team1.includes("كورة") || team1.includes("مباراة") || team1.includes("الرئيسية")) continue;

    // نقلبو على القناة و البطولة و الحالة حدا الماتش
    const around = html.substring(m.index, m.index + 2000);
    const channelMatch = around.match(/(【entity-أون سبورت¦canonical_name=أون سبورت】|بي ان سبورت|SSC|الكأس|أبو ظبي|【entity-ON Sport¦canonical_name=ON Sport】|【entity-beIN¦canonical_name=beIN】)[^<]{0,20}/);
    const competitionMatch = around.match(/(كأس مصر|الدوري المصري|الدوري المغربي|الدوري السعودي|دوري أبطال)[^<]{0,30}/);
    const status = around.includes("جارية") ? "جارية" : around.includes("انتهت") ? "انتهت" : "لم تبدأ بعد";

    matches.push({
      team1, team2, time,
      score: "0 - 0",
      status,
      channel: channelMatch ? channelMatch[0].trim() : "",
      commentator: "",
      competition: competitionMatch ? competitionMatch[0].trim() : "",
      matchUrl: baseUrl,
      source
    });
  }

  // نحيدو المكرر
  const seen = new Set();
  const out = [];
  for (const mm of matches) {
    const key = (mm.team1 + mm.team2 + mm.time).toLowerCase().replace(/\s/g, "");
    if (!seen.has(key)) { seen.add(key); out.push(mm); }
  }
  return out;
}

async function scrapeOne(url) {
  console.log("كندخل لـ: " + url);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // كنتسناو 5 ثواني باش يدوز Checking your browser
  await new Promise(r => setTimeout(r, 5000));
  const html = await page.content();
  await browser.close();
  console.log("جبت HTML الطول ديالو: " + html.length);
  return html;
}

(async () => {
  const sites = [
    { url: "https://kooralive.la/", source: "kooralive-la" },
    { url: "https://www.kora90m.com/", source: "kora90m" },
    { url: "https://live-sports-channel.com/", source: "live-sports" },
    { url: "https://kooralive.asia/", source: "kooralive-asia" }
  ];

  let all = [];
  let usedSource = "";

  for (const site of sites) {
    try {
      const html = await scrapeOne(site.url);
      if (html.includes("Checking your browser") || html.length < 1000) {
        console.log("تبوكينا في: " + site.url);
        continue;
      }
      const matches = parseMatches(html, site.source, site.url);
      console.log("لقينا في " + site.source + ": " + matches.length);
      if (matches.length > 0) {
        all = matches;
        usedSource = site.source;
        break;
      }
    } catch (e) {
      console.log("فشل في " + site.url + " : " + e.message);
    }
  }

  console.log("المجموع: " + all.length + " من " + usedSource);

  if (all.length === 0) {
    console.log("ما لقينا والو، ما غاديش نمسحو القديم في KV");
    return;
  }

  // صيفط لـ Cloudflare KV
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const kvId = process.env.KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !kvId) {
    console.log("ما كاينش Secrets، غادي نطبعو غير في Log");
    console.log(JSON.stringify({ source: usedSource, matches: all }, null, 2));
    return;
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/matches`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: usedSource, updatedAt: Date.now(), matches: all })
  });

  console.log("صيفطنا لـ KV، النتيجة: " + res.status);
})();
