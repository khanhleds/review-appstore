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

  if (parsedUrl.pathname === '/api/search-apps') return searchApps(req, res);
  if (parsedUrl.pathname === '/api/crawl-reviews') return crawlReviews(req, res);

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

const PORT = 3456;
server.listen(PORT, () => console.log(`Dev server on http://localhost:${PORT}`));
