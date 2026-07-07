const state = {
  selected: {}, // { app_id, apple_id, name, country }
  google: [],
  apple: [],
  uniqueTexts: [],
  classifications: {}, // { reviewText: [categories] }
  taxonomyKey: 'banking_vn',
};

// ---------------------------------------------------------------------
// API key (stored locally only, never sent anywhere except api.anthropic.com)
// ---------------------------------------------------------------------

const KEY_STORAGE = 'app_review_dashboard_anthropic_key';
const apiKeyInput = document.getElementById('apiKeyInput');
apiKeyInput.value = localStorage.getItem(KEY_STORAGE) || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem(KEY_STORAGE, apiKeyInput.value.trim());
});

function getApiKey() {
  return (localStorage.getItem(KEY_STORAGE) || '').trim();
}

// ---------------------------------------------------------------------
// Step 1 — search apps by name
// ---------------------------------------------------------------------

const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const countrySelect = document.getElementById('countrySelect');
const searchResults = document.getElementById('searchResults');

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const term = searchInput.value.trim();
  if (!term) return;
  searchResults.innerHTML = '<p class="muted">Đang tìm...</p>';
  try {
    const res = await fetch(
      `/api/search-apps?term=${encodeURIComponent(term)}&country=${countrySelect.value}`
    );
    const data = await res.json();
    renderSearchResults(data, term);
  } catch (err) {
    searchResults.innerHTML = `<p class="error">Lỗi tìm kiếm: ${escapeHtml(err.message)}</p>`;
  }
});

function renderSearchResults(data, term) {
  const combined = [];
  // Try to pair up google/apple entries that look like the same app (by name similarity)
  const usedApple = new Set();
  for (const g of data.google) {
    const match = data.apple.find(
      (a, i) => !usedApple.has(i) && normName(a.name) === normName(g.name)
    );
    if (match) usedApple.add(data.apple.indexOf(match));
    combined.push({ google: g, apple: match || null });
  }
  data.apple.forEach((a, i) => {
    if (!usedApple.has(i)) combined.push({ google: null, apple: a });
  });

  if (combined.length === 0) {
    searchResults.innerHTML = `<p class="muted">Không tìm thấy app nào cho "${escapeHtml(term)}".</p>`;
    return;
  }

  searchResults.innerHTML = combined
    .map((pair, idx) => {
      const name = (pair.google || pair.apple).name;
      const developer = (pair.google || pair.apple).developer;
      const icon = (pair.google || pair.apple).icon;
      return `
        <div class="app-card" data-idx="${idx}">
          <img src="${icon || ''}" alt="" onerror="this.style.visibility='hidden'">
          <div class="app-card-info">
            <div class="app-card-name">${escapeHtml(name)}</div>
            <div class="app-card-dev">${escapeHtml(developer || '')}</div>
            <div class="app-card-badges">
              ${pair.google ? `<span class="badge badge-google">Google Play: ${escapeHtml(pair.google.app_id)}</span>` : ''}
              ${pair.apple ? `<span class="badge badge-apple">App Store: ${escapeHtml(pair.apple.apple_id)}</span>` : ''}
            </div>
          </div>
          <button class="btn-select" data-idx="${idx}">Chọn</button>
        </div>`;
    })
    .join('');

  searchResults.querySelectorAll('.btn-select').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pair = combined[Number(btn.dataset.idx)];
      selectApp(pair, countrySelect.value);
    });
  });
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function selectApp(pair, country) {
  const name = (pair.google || pair.apple).name;
  state.selected = {
    app_id: pair.google ? pair.google.app_id : null,
    apple_id: pair.apple ? pair.apple.apple_id : null,
    name,
    country,
  };
  document.getElementById('selectedAppPanel').style.display = 'block';
  document.getElementById('selectedAppName').textContent = name;
  document.getElementById('selectedAppSources').textContent = [
    pair.google ? `Google Play (${pair.google.app_id})` : null,
    pair.apple ? `App Store (${pair.apple.apple_id})` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  document.getElementById('runPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------
// Step 2 — crawl + classify + render
// ---------------------------------------------------------------------

const runBtn = document.getElementById('runBtn');
const progressEl = document.getElementById('progress');
const taxonomySelect = document.getElementById('taxonomySelect');
const crawlModeSelect = document.getElementById('crawlModeSelect');
const dateFromField = document.getElementById('dateFromField');
const dateToField = document.getElementById('dateToField');
const dateRangeHint = document.getElementById('dateRangeHint');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');

// Default date range = last 1 year up to today
(function initDefaultDateRange() {
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);
  const toIso = (d) => d.toISOString().slice(0, 10);
  dateFrom.value = toIso(oneYearAgo);
  dateTo.value = toIso(today);
})();

crawlModeSelect.addEventListener('change', () => {
  const isDateRange = crawlModeSelect.value === 'date_range';
  dateFromField.style.display = isDateRange ? 'flex' : 'none';
  dateToField.style.display = isDateRange ? 'flex' : 'none';
  dateRangeHint.style.display = isDateRange ? 'block' : 'none';
});

Object.entries(window.TAXONOMIES).forEach(([key, t]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = t.label;
  taxonomySelect.appendChild(opt);
});
taxonomySelect.value = state.taxonomyKey;
taxonomySelect.addEventListener('change', () => {
  state.taxonomyKey = taxonomySelect.value;
});

runBtn.addEventListener('click', async () => {
  if (!getApiKey()) {
    alert('Nhập Anthropic API key trước (chỉ lưu trên trình duyệt của bạn, không gửi đi đâu khác ngoài api.anthropic.com).');
    return;
  }
  runBtn.disabled = true;
  document.getElementById('dashboard').style.display = 'none';
  try {
    await runPipeline();
  } catch (err) {
    setProgress(`Lỗi: ${err.message}`, true);
  } finally {
    runBtn.disabled = false;
  }
});

const recrawlAppleBtn = document.getElementById('recrawlAppleBtn');
recrawlAppleBtn.addEventListener('click', async () => {
  if (!getApiKey()) {
    alert('Nhập Anthropic API key trước.');
    return;
  }
  recrawlAppleBtn.disabled = true;
  try {
    setProgress('Đang crawl thêm review App Store (gộp với dữ liệu đã có)...');
    const crawlData = await crawlOnce();
    const before = state.apple.length;
    mergeAppleReviews(crawlData.apple || []);
    const added = state.apple.length - before;
    setProgress(`Đã thêm ${added} review App Store mới (tổng ${state.apple.length}). Đang phân loại phần mới...`);

    const newTexts = [];
    for (const r of crawlData.apple || []) {
      const title = (r.title || '').trim();
      const body = (r.review || '').trim();
      const t = title && body ? `${title}. ${body}` : title || body;
      if (t && !state.classifications[t]) newTexts.push(t);
    }
    const uniqueNew = [...new Set(newTexts)];
    if (uniqueNew.length) {
      const newClassifications = await classifyAll(uniqueNew, state.taxonomyKey, (done, total) => {
        setProgress(`Đang phân loại review mới: ${done}/${total}...`);
      });
      Object.assign(state.classifications, newClassifications);
    }
    renderDashboard();
    setProgress(`Xong — đã thêm ${added} review App Store, tổng ${state.google.length + state.apple.length} review.`);
  } catch (err) {
    setProgress(`Lỗi: ${err.message}`, true);
  } finally {
    recrawlAppleBtn.disabled = false;
  }
});

function setProgress(text, isError) {
  progressEl.textContent = text;
  progressEl.className = isError ? 'error' : 'muted';
}

function getCrawlDateParams() {
  if (crawlModeSelect.value !== 'date_range') return {};
  const params = {};
  if (dateFrom.value) params.since = dateFrom.value;
  if (dateTo.value) params.until = dateTo.value;
  return params;
}

async function crawlOnce() {
  const { app_id, apple_id, country } = state.selected;
  const params = new URLSearchParams({ country, ...getCrawlDateParams() });
  if (app_id) params.set('app_id', app_id);
  if (apple_id) params.set('apple_id', apple_id);
  const crawlRes = await fetch(`/api/crawl-reviews?${params}`);
  return crawlRes.json();
}

function mergeAppleReviews(newReviews) {
  const seen = new Set(state.apple.map((r) => r.review_id));
  for (const r of newReviews) {
    if (!seen.has(r.review_id)) {
      state.apple.push(r);
      seen.add(r.review_id);
    }
  }
}

async function runPipeline() {
  setProgress(`Đang crawl review từ Google Play + App Store${crawlModeSelect.value === 'date_range' ? ` (${dateFrom.value} → ${dateTo.value})` : ''}...`);
  const crawlData = await crawlOnce();
  state.google = crawlData.google || [];
  state.apple = crawlData.apple || [];
  document.getElementById('recrawlAppleBtn').style.display = state.selected.apple_id ? 'inline-block' : 'none';
  if (crawlData.apple_diag) console.log('Apple crawl diagnostics:', crawlData.apple_diag);
  setProgress(
    `Crawl xong: ${state.google.length} review Google Play, ${state.apple.length} review App Store.` +
      (crawlData.apple_note ? ` ${crawlData.apple_note}` : '') +
      ' Đang chuẩn bị phân loại...'
  );

  // Build unique review text list (Apple: title+review joined, like prepare_classification.py)
  const allTexts = [];
  for (const r of state.google) {
    const t = (r.review || '').trim();
    if (t) allTexts.push(t);
  }
  for (const r of state.apple) {
    const title = (r.title || '').trim();
    const body = (r.review || '').trim();
    const t = title && body ? `${title}. ${body}` : title || body;
    if (t) allTexts.push(t);
  }
  const unique = [...new Set(allTexts)];
  state.uniqueTexts = unique;

  setProgress(`Đang phân loại ${unique.length} review duy nhất bằng Claude...`);
  state.classifications = await classifyAll(unique, state.taxonomyKey, (done, total) => {
    setProgress(`Đang phân loại: ${done}/${total} review...`);
  });

  setProgress(`Hoàn tất. Đang dựng dashboard...`);
  renderDashboard();
  setProgress(`Xong — ${state.google.length + state.apple.length} review, ${unique.length} unique đã phân loại.`);
}

// ---------------------------------------------------------------------
// Classification via direct browser call to the Anthropic API
// ---------------------------------------------------------------------

const CLASSIFY_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 40;

async function classifyAll(texts, taxonomyKey, onProgress) {
  const taxonomy = window.TAXONOMIES[taxonomyKey];
  const categoryNames = Object.keys(taxonomy.categories);
  const productNames = taxonomy.productCategories ? Object.keys(taxonomy.productCategories) : null;

  const issueRubric = categoryNames.map((name) => `- "${name}": ${taxonomy.categories[name]}`).join('\n');
  const productRubric = productNames
    ? productNames.map((name) => `- "${name}": ${taxonomy.productCategories[name]}`).join('\n')
    : null;

  const results = {};
  let done = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchResult = await classifyBatch(
      batch,
      issueRubric,
      categoryNames,
      taxonomy.fallback,
      productRubric,
      productNames,
      taxonomy.productFallback
    );
    Object.assign(results, batchResult);
    done += batch.length;
    onProgress(done, texts.length);
  }
  return results;
}

async function classifyBatch(batch, issueRubric, categoryNames, fallback, productRubric, productNames, productFallback) {
  const numbered = batch.map((t, i) => `${i}: ${t.slice(0, 600)}`).join('\n---\n');

  const hasProduct = !!productRubric;
  const prompt = `Bạn là bộ phân loại review app. Có ${hasProduct ? 'HAI' : 'MỘT'} chiều phân loại độc lập.

CHIỀU 1 — Loại vấn đề (issue), chọn 1 hoặc nhiều tên CHÍNH XÁC trong danh sách:
${issueRubric}
Nếu không khớp category nào, dùng "${fallback}".

${hasProduct ? `CHIỀU 2 — Sản phẩm/tính năng được nhắc tới (product), chọn 1 hoặc nhiều tên CHÍNH XÁC trong danh sách:
${productRubric}
Nếu review không nhắc tới sản phẩm/tính năng cụ thể nào (VD: khen chung chung, lỗi app tổng quát), dùng "${productFallback}".
` : ''}
Reviews:
${numbered}

Trả lời CHỈ bằng JSON hợp lệ, không markdown, không giải thích, theo format:
${hasProduct
    ? '{"0": {"issue": ["Category A"], "product": ["Product A"]}, "1": {"issue": ["Category B"], "product": ["Product B", "Product C"]}, ...}'
    : '{"0": {"issue": ["Category A"]}, "1": {"issue": ["Category B", "Category C"]}, ...}'}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API lỗi (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  let parsed = {};
  try {
    const clean = (textBlock ? textBlock.text : '{}').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    parsed = {};
  }

  const out = {};
  batch.forEach((text, i) => {
    const entry = parsed[String(i)] || {};
    let issue = Array.isArray(entry.issue) ? entry.issue.filter((c) => categoryNames.includes(c)) : [];
    if (issue.length === 0) issue = [fallback];

    let product = [];
    if (hasProduct) {
      product = Array.isArray(entry.product) ? entry.product.filter((c) => productNames.includes(c)) : [];
      if (product.length === 0) product = [productFallback];
    }
    out[text] = { issue, product };
  });
  return out;
}

// ---------------------------------------------------------------------
// Dashboard rendering (charts + review explorer), same visual language
// as the Skill's static HTML dashboard output
// ---------------------------------------------------------------------

let ratingChart, categoryChart, trendChart, productChart;

function getClassificationFor(text) {
  const taxonomy = window.TAXONOMIES[state.taxonomyKey];
  return (
    state.classifications[text] || {
      issue: [taxonomy.fallback],
      product: taxonomy.productCategories ? [taxonomy.productFallback] : [],
    }
  );
}

function renderDashboard() {
  const rows = [];
  for (const r of state.google) {
    const text = (r.review || '').trim();
    const cls = text ? getClassificationFor(text) : { issue: [window.TAXONOMIES[state.taxonomyKey].fallback], product: [] };
    rows.push({
      source: 'google_play',
      rating: r.rating,
      date: r.date ? r.date.slice(0, 10) : '',
      version: r.app_version,
      review: text,
      issueCategories: cls.issue,
      productCategories: cls.product,
    });
  }
  for (const r of state.apple) {
    const title = (r.title || '').trim();
    const body = (r.review || '').trim();
    const text = title && body ? `${title}. ${body}` : title || body;
    const cls = text ? getClassificationFor(text) : { issue: [window.TAXONOMIES[state.taxonomyKey].fallback], product: [] };
    rows.push({
      source: 'apple_store',
      rating: r.rating,
      date: r.date ? r.date.slice(0, 10) : '',
      version: r.app_version,
      review: text,
      issueCategories: cls.issue,
      productCategories: cls.product,
    });
  }
  rows.sort((a, b) => (a.rating || 0) - (b.rating || 0) || (b.date || '').localeCompare(a.date || ''));

  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('dashboardTitle').textContent = `${state.selected.name} — App Review Dashboard`;

  const total = rows.length;
  const avgRating = total ? (rows.reduce((s, r) => s + (r.rating || 0), 0) / total).toFixed(2) : '—';

  // Date range actually covered by the crawled data — the crawl itself is
  // "N most-recent reviews", not a fixed date window, so this range varies
  // per app depending on how fast it accumulates reviews.
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const dateRangeText = dates.length ? `${formatDateVN(dates[0])} – ${formatDateVN(dates[dates.length - 1])}` : '—';

  document.getElementById('subheader').innerHTML =
    `${total} review · Google Play: ${state.google.length} · App Store: ${state.apple.length} · Điểm TB: ${avgRating}/5` +
    `<br><span class="date-range">📅 Dữ liệu từ ${escapeHtml(dateRangeText)} (theo N review mới nhất, không phải khoảng ngày cố định)</span>`;

  const statDefs = [
    ['Tổng review', total],
    ['Điểm TB', `${avgRating} / 5`],
    ['Google Play', state.google.length],
    ['App Store', state.apple.length],
  ];
  document.getElementById('stats').innerHTML = statDefs
    .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join('');

  // Rating distribution
  const ratingDist = { google: {}, apple: {} };
  for (const r of rows) {
    const bucket = r.source === 'google_play' ? ratingDist.google : ratingDist.apple;
    bucket[r.rating] = (bucket[r.rating] || 0) + 1;
  }
  if (ratingChart) ratingChart.destroy();
  ratingChart = new Chart(document.getElementById('ratingChart'), {
    type: 'bar',
    data: {
      labels: ['1★', '2★', '3★', '4★', '5★'],
      datasets: [
        { label: 'Google Play', backgroundColor: '#5b8cff', data: [1, 2, 3, 4, 5].map((r) => ratingDist.google[r] || 0) },
        { label: 'App Store', backgroundColor: '#ff9f5b', data: [1, 2, 3, 4, 5].map((r) => ratingDist.apple[r] || 0) },
      ],
    },
    options: chartOptions(),
  });

  // Category breakdown (issue dimension)
  const catCounts = {};
  for (const r of rows) {
    for (const c of r.issueCategories) catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const catEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById('categoryChart'), {
    type: 'bar',
    data: {
      labels: catEntries.map((e) => e[0]),
      datasets: [{ label: 'Reviews', backgroundColor: '#5b8cff', data: catEntries.map((e) => e[1]) }],
    },
    options: { ...chartOptions(), indexAxis: 'y', plugins: { legend: { display: false } } },
  });

  // Product/feature breakdown (second, independent dimension) — only shown
  // when the active taxonomy defines one (e.g. banking_vn)
  const productPanel = document.getElementById('productChartPanel');
  const hasProduct = !!window.TAXONOMIES[state.taxonomyKey].productCategories;
  let productEntries = [];
  if (hasProduct) {
    const productCounts = {};
    for (const r of rows) {
      for (const p of r.productCategories) productCounts[p] = (productCounts[p] || 0) + 1;
    }
    productEntries = Object.entries(productCounts).sort((a, b) => b[1] - a[1]);
    productPanel.style.display = 'block';
    if (productChart) productChart.destroy();
    productChart = new Chart(document.getElementById('productChart'), {
      type: 'bar',
      data: {
        labels: productEntries.map((e) => e[0]),
        datasets: [{ label: 'Reviews', backgroundColor: '#ff9f5b', data: productEntries.map((e) => e[1]) }],
      },
      options: { ...chartOptions(), indexAxis: 'y', plugins: { legend: { display: false } } },
    });
  } else {
    productPanel.style.display = 'none';
  }

  // Monthly trend
  const monthCounts = {};
  for (const r of rows) {
    if (!r.date) continue;
    const m = r.date.slice(0, 7);
    monthCounts[m] = (monthCounts[m] || 0) + 1;
  }
  const months = Object.keys(monthCounts).sort();
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Review theo tháng',
          borderColor: '#5b8cff',
          backgroundColor: 'rgba(91,140,255,0.15)',
          data: months.map((m) => monthCounts[m]),
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: chartOptions(),
  });

  setupExplorer(rows, catEntries.map((e) => e[0]), productEntries.map((e) => e[0]));
  setupExport(rows, hasProduct);
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: '#8a93a6' }, grid: { color: '#2a3244' } },
      y: { ticks: { color: '#8a93a6' }, grid: { color: '#2a3244' } },
    },
    plugins: { legend: { labels: { color: '#e8ecf4' } } },
  };
}

function setupExplorer(rows, issueCategories, productCategories) {
  const sourceFilter = document.getElementById('sourceFilter');
  const ratingFilter = document.getElementById('ratingFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const productFilter = document.getElementById('productFilter');
  const searchBox = document.getElementById('searchBox');
  const reviewRows = document.getElementById('reviewRows');
  const resultCount = document.getElementById('resultCount');

  const hasProduct = productCategories.length > 0;
  productFilter.style.display = hasProduct ? 'inline-block' : 'none';

  sourceFilter.innerHTML = '<option value="">Tất cả nguồn</option><option value="google_play">Google Play</option><option value="apple_store">App Store</option>';
  ratingFilter.innerHTML = '<option value="">Tất cả rating</option>' + [5, 4, 3, 2, 1].map((r) => `<option value="${r}">${r} sao</option>`).join('');
  categoryFilter.innerHTML = '<option value="">Tất cả loại vấn đề</option>' + issueCategories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  productFilter.innerHTML = '<option value="">Tất cả sản phẩm</option>' + productCategories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  function render() {
    const q = searchBox.value.trim().toLowerCase();
    const src = sourceFilter.value;
    const rating = ratingFilter.value;
    const cat = categoryFilter.value;
    const prod = productFilter.value;

    const filtered = rows.filter((r) => {
      if (src && r.source !== src) return false;
      if (rating && String(r.rating) !== rating) return false;
      if (cat && !r.issueCategories.includes(cat)) return false;
      if (prod && !r.productCategories.includes(prod)) return false;
      if (q && !r.review.toLowerCase().includes(q)) return false;
      return true;
    });

    resultCount.textContent = `(${filtered.length} / ${rows.length})`;
    reviewRows.innerHTML = filtered
      .slice(0, 500)
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.source)}</td>
        <td class="rating-pill rating-${r.rating}">${r.rating ?? '—'}★</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.version)}</td>
        <td>${escapeHtml(r.review)}</td>
        <td>${r.issueCategories.map((c) => `<span class="badge">${escapeHtml(c)}</span>`).join('')}</td>
        <td>${hasProduct ? r.productCategories.map((c) => `<span class="badge badge-product">${escapeHtml(c)}</span>`).join('') : ''}</td>
      </tr>`
      )
      .join('');
  }

  [searchBox, sourceFilter, ratingFilter, categoryFilter, productFilter].forEach((el) => el.addEventListener('input', render));
  render();
}

function setupExport(rows, hasProduct) {
  const btn = document.getElementById('exportBtn');
  btn.onclick = () => {
    const sheetData = rows.map((r) => ({
      Source: r.source,
      Rating: r.rating,
      Date: r.date,
      Version: r.version,
      Review: r.review,
      'Issue Categories': r.issueCategories.join(', '),
      ...(hasProduct ? { 'Product/Feature': r.productCategories.join(', ') } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reviews');
    XLSX.writeFile(wb, `${state.selected.name.replace(/[^a-z0-9]+/gi, '_')}_reviews.xlsx`);
  };
}

function formatDateVN(isoDate) {
  const [y, m, d] = (isoDate || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : isoDate || '—';
}

function escapeHtml(str) {
  return (str || '').toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
