// api/crawl-reviews.js
// Crawl reviews from Google Play (via google-play-scraper) and Apple App
// Store (via the public RSS customer-reviews feed).
//
// Two modes:
//   - Default ("N most recent"): same as before, capped page counts.
//   - Date-range (?since=YYYY-MM-DD[&until=YYYY-MM-DD]): keeps paginating
//     Google Play until reviews older than `since` are reached (bounded by a
//     safety page cap so a single request can't run forever). Apple is still
//     hard-capped at ~500 reviews by the RSS feed itself — a date range wider
//     than what those ~500 cover simply won't have older data available from
//     this public feed; the response says so explicitly rather than silently
//     returning a partial answer.
//
// GET /api/crawl-reviews?app_id=mobile.acb.com.vn&apple_id=950141024&country=vn&since=2025-07-01&until=2026-07-06

const gplay = require('google-play-scraper').default;

// --- Google Play -----------------------------------------------------------

async function crawlGooglePlay(appId, country, language, { maxPages, pageSize, since, until }) {
  const all = [];
  let token;
  const sinceDate = since ? new Date(since) : null;
  const untilDate = until ? new Date(until) : null;

  for (let page = 1; page <= maxPages; page++) {
    let result;
    try {
      const r = await gplay.reviews({
        appId,
        lang: language,
        country,
        sort: gplay.sort.NEWEST,
        num: pageSize,
        nextPaginationToken: token,
      });
      result = r.data;
      token = r.nextPaginationToken;
    } catch (e) {
      break; // stop this source on error, don't fail the whole request
    }
    if (!result || result.length === 0) break;

    all.push(
      ...result.map((r) => ({
        review_id: r.id,
        user: r.userName,
        rating: r.score,
        review: r.text,
        date: r.date,
        app_version: r.version,
        likes: r.thumbsUp,
        source: 'google_play',
      }))
    );

    // Date-range mode: reviews arrive newest-first, so once the oldest review
    // on this page is already before `since`, every later page will be too —
    // safe to stop.
    if (sinceDate) {
      const oldestOnPage = result[result.length - 1];
      if (oldestOnPage && oldestOnPage.date && new Date(oldestOnPage.date) < sinceDate) break;
    }
    if (!token) break;
  }

  // dedupe by review_id
  const seen = new Set();
  let reviews = all.filter((r) => {
    if (seen.has(r.review_id)) return false;
    seen.add(r.review_id);
    return true;
  });

  if (sinceDate || untilDate) {
    reviews = reviews.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      return true;
    });
  }

  return reviews;
}

// --- Apple App Store ---------------------------------------------------

function dig(entry, path) {
  let node = entry;
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object') return '';
    node = node[key];
  }
  return node == null ? '' : String(node);
}

async function fetchApplePage(country, appId, page, diag) {
  const url = `https://itunes.apple.com/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/page=${page}/json?_=${Math.floor(
    Math.random() * 1e9
  )}`;
  try {
    const resp = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!resp.ok) {
      diag.httpErrors++;
      return [];
    }
    const json = await resp.json();
    const entry = json && json.feed ? json.feed.entry : null;
    diag.fetchOk++;
    if (!entry) return [];
    return Array.isArray(entry) ? entry : [entry];
  } catch (e) {
    diag.exceptions++;
    diag.lastError = String(e && e.message ? e.message : e);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function crawlAppleStore(appleId, country) {
  const RSS_PAGES = 10; // Apple hard cap: 10 pages x ~50 = ~500 reviews
  const MAX_SWEEPS = 20; // tuned to fit within the 30s Vercel function timeout (see vercel.json)
  const STOP_AFTER_EMPTY_SWEEPS = 12; // Apple's CDN cache is flaky — tolerate a long cold streak before giving up
  const SWEEP_DELAY_MS = 500; // let Apple's CDN cache rotate between sweeps

  const byId = new Map();
  let emptyStreak = 0;
  const diag = { fetchOk: 0, httpErrors: 0, exceptions: 0, sweeps: 0, lastError: null };

  for (let sweep = 1; sweep <= MAX_SWEEPS; sweep++) {
    diag.sweeps = sweep;
    const pages = await Promise.all(
      Array.from({ length: RSS_PAGES }, (_, i) => fetchApplePage(country, appleId, i + 1, diag))
    );
    let added = 0;
    for (const entries of pages) {
      for (const entry of entries) {
        const id = dig(entry, 'id.label');
        if (id && !byId.has(id)) {
          byId.set(id, entry);
          added++;
        }
      }
    }
    if (byId.size >= 500) break;
    emptyStreak = added === 0 ? emptyStreak + 1 : 0;
    if (emptyStreak >= STOP_AFTER_EMPTY_SWEEPS) break;
    if (sweep < MAX_SWEEPS) await sleep(SWEEP_DELAY_MS);
  }

  const reviews = Array.from(byId.values()).map((entry) => ({
    review_id: dig(entry, 'id.label'),
    user: dig(entry, 'author.name.label'),
    rating: Number(dig(entry, 'im:rating.label')) || null,
    title: dig(entry, 'title.label'),
    review: dig(entry, 'content.label'),
    date: dig(entry, 'updated.label'),
    app_version: dig(entry, 'im:version.label'),
    likes: Number(dig(entry, 'im:voteSum.label')) || 0,
    source: 'apple_store',
  }));
  return { reviews, hitCeiling: byId.size >= 500, diag };
}

function filterByDate(reviews, since, until) {
  if (!since && !until) return reviews;
  const sinceDate = since ? new Date(since) : null;
  const untilDate = until ? new Date(until) : null;
  return reviews.filter((r) => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (sinceDate && d < sinceDate) return false;
    if (untilDate && d > untilDate) return false;
    return true;
  });
}

// --- Handler -----------------------------------------------------------

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { app_id, apple_id, country, since, until } = req.query;
  const ctry = (country || 'vn').toLowerCase();
  const lang = ctry === 'vn' ? 'vi' : 'en';

  if (!app_id && !apple_id) {
    res.status(400).json({ error: 'Provide at least app_id or apple_id' });
    return;
  }

  // Date-range mode paginates Google Play much further (safety-capped), so
  // it needs a higher page ceiling than the default "N most recent" mode.
  const googleOpts = since
    ? { maxPages: 25, pageSize: 200, since, until } // safety cap ~5000 reviews
    : { maxPages: 3, pageSize: 200, since: null, until: null };

  const [google, appleResult] = await Promise.all([
    app_id ? crawlGooglePlay(app_id, ctry, lang, googleOpts) : Promise.resolve([]),
    apple_id ? crawlAppleStore(apple_id, ctry) : Promise.resolve({ reviews: [], hitCeiling: false, diag: null }),
  ]);

  const appleFiltered = since || until ? filterByDate(appleResult.reviews, since, until) : appleResult.reviews;

  let apple_note = null;
  if (apple_id) {
    if (appleResult.diag && appleResult.diag.fetchOk === 0) {
      apple_note = `Không lấy được dữ liệu nào từ Apple RSS feed (0/${appleResult.diag.sweeps * 10} request thành công — ${appleResult.diag.httpErrors} lỗi HTTP, ${appleResult.diag.exceptions} lỗi kết nối${appleResult.diag.lastError ? `, lỗi gần nhất: "${appleResult.diag.lastError}"` : ''}). Có thể do mạng chặn itunes.apple.com hoặc Apple đang chặn IP tạm thời — thử lại sau vài phút hoặc từ mạng khác.`;
    } else if (!appleResult.hitCeiling) {
      apple_note =
        'App Store RSS có cache không ổn định — số review có thể chưa đầy đủ (tối đa ~500, giới hạn cứng từ Apple). Bấm "Crawl thêm App Store" để lấy thêm.';
    }
    if ((since || until) && appleResult.reviews.length >= 490) {
      apple_note =
        (apple_note ? apple_note + ' ' : '') +
        'Lưu ý: Apple RSS chỉ cho tối đa ~500 review gần nhất — nếu app có nhiều review, khoảng ngày bạn chọn có thể chưa được phủ hết ở phía Apple (Google Play thì không bị giới hạn này).';
    }
  }

  res.status(200).json({
    google,
    apple: appleFiltered,
    counts: { google: google.length, apple: appleFiltered.length },
    apple_note,
    apple_diag: appleResult.diag,
    mode: since ? 'date_range' : 'most_recent',
  });
};
