// Lightweight local dev server (not used in production — Vercel handles
// routing there). Only for testing api/*.js handlers + static files locally.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const searchApps = require('./api/search-apps.js');
const crawlReviews = require('./api/crawl-reviews.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function fakeReqRes(req, res, parsedUrl) {
  req.query = Object.fromEntries(parsedUrl.searchParams);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  res.setHeader = res.setHeader.bind(res);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new url.URL(req.url, 'http://localhost');
  fakeReqRes(req, res, parsedUrl);

  try {
    if (parsedUrl.pathname === '/api/search-apps') {
      await searchApps(req, res);
      return;
    }
    if (parsedUrl.pathname === '/api/crawl-reviews') {
      await crawlReviews(req, res);
      return;
    }
  } catch (err) {
    // Without this, an unhandled error here would crash the whole dev
    // server process (Node terminates on unhandled promise rejections by
    // default) — every request after that, including page reloads, would
    // then fail with "Failed to fetch" since nothing is listening anymore.
    console.error(`Error handling ${parsedUrl.pathname}:`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    }
    return;
  }

  let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  filePath = path.join(__dirname, 'public', filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'text/plain');
    res.end(data);
  });
});

// Last-resort safety net: log and keep the process alive instead of
// crashing on any error that somehow still escapes the try/catch above.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server stays alive):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stays alive):', err);
});

const PORT = 3456;
server.listen(PORT, () => console.log(`Dev server on http://localhost:${PORT}`));
