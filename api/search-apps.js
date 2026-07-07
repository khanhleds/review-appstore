// api/search-apps.js
// Search both Google Play and Apple App Store by app name.
// GET /api/search-apps?term=ACB+ONE&country=vn

// google-play-scraper ships ESM-only — see note in crawl-reviews.js.
let gplayPromise = null;
function getGplay() {
  if (!gplayPromise) {
    gplayPromise = import('google-play-scraper').then((m) => m.default);
  }
  return gplayPromise;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { term, country } = req.query;
  if (!term || !term.trim()) {
    res.status(400).json({ error: 'Missing "term" query param' });
    return;
  }
  const ctry = (country || 'vn').toLowerCase();
  const gplay = await getGplay();

  const [googleResults, appleResults] = await Promise.allSettled([
    gplay.search({ term, num: 8, country: ctry, lang: ctry === 'vn' ? 'vi' : 'en' }),
    fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        term
      )}&country=${ctry}&entity=software&limit=8`
    ).then((r) => r.json()),
  ]);

  const google =
    googleResults.status === 'fulfilled'
      ? googleResults.value.map((a) => ({
          source: 'google_play',
          app_id: a.appId,
          name: a.title,
          developer: a.developer,
          icon: a.icon,
          score: a.score,
        }))
      : [];

  const apple =
    appleResults.status === 'fulfilled' && appleResults.value.results
      ? appleResults.value.results.map((a) => ({
          source: 'apple_store',
          apple_id: String(a.trackId),
          name: a.trackName,
          developer: a.artistName,
          icon: a.artworkUrl512 || a.artworkUrl100,
          score: a.averageUserRating,
        }))
      : [];

  res.status(200).json({ google, apple });
};
