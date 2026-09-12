// Add one object for each completed page. The library stays synchronized in one place.
const sitePages = [
  { title: '2026', summary: 'The latest tier list and team write-ups.', href: '2026.html' },
  { title: '2025', summary: 'The 2025 pre-season tier list and team write-ups.', href: '2025.html' },
  { title: '2024', summary: 'The original pre-season rankings and team write-ups.', href: '2024.html' },
];

const list = document.querySelector('#library-list');
if (list) {
  list.innerHTML = sitePages.map(({ title, summary, href }) => `
    <a class="library-item" href="${href}">
      <h2>${title}</h2><p>${summary}</p>
    </a>`).join('');
}

// Every manager gets one fixed color, used consistently across every chart on the site
// (regardless of what order rows appear in a given CSV, or which years a chart covers).
const managerColors = {
  Noah: '#2dd4bf',
  Tom: '#f87171',
  Goutham: '#60a5fa',
  Peggy: '#06b6d4',
  Vinny: '#c084fc',
  David: '#34d399',
  Dongbo: '#f472b6',
  Theo: '#84cc16',
  Sam: '#fb923c',
  Michael: '#818cf8',
  Yiding: '#d946ef',
  Wenlong: '#94a3b8',
};

const profileImages = {
  Noah: 'noah-profile.jpg', Tom: 'tom-profile.jpg', Goutham: 'goutham-profile.jpeg', Peggy: 'peggy-profile.jpg',
  Vinny: 'vinny-profile.jpg', David: 'david-profile.jpeg', Dongbo: 'dongbo-profile.jpg', Theo: 'theo-profile.jpg',
  Sam: 'sam-profile.jpg', Michael: 'michael-profile.jpg', Yiding: 'yiding-profile.jpeg', Wenlong: 'wenlong-profile.jpg',
};

// Parses a simple "name,year1,year2,..." CSV into { years, rankingData }.
// Blank cells become null (e.g. a manager who hasn't finished the current season yet).
function parseRankingCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.length > 0);
  const [headerLine, ...rowLines] = lines;
  const years = headerLine.split(',').slice(1).map(year => year.trim());
  const rankingData = rowLines.map(line => {
    const cells = line.split(',');
    const name = cells[0].trim();
    const ranks = cells.slice(1).map(cell => {
      const trimmed = cell.trim();
      return trimmed === '' ? null : Number(trimmed);
    });
    return { name, ranks };
  });
  return { years, rankingData };
}

async function loadRankingCSV(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  const text = await response.text();
  return parseRankingCSV(text);
}

function renderAverageTable(averageEl, rankingData) {
  const standings = rankingData
    .map(({ name, ranks }) => {
      const known = ranks.filter(rank => rank != null);
      const average = known.length ? known.reduce((total, rank) => total + rank, 0) / known.length : null;
      return { name, average, latest: ranks.at(-1) };
    })
    .filter(entry => entry.average != null)
    .sort((a, b) => a.average - b.average || (a.latest ?? Infinity) - (b.latest ?? Infinity));
  averageEl.innerHTML = `<div class="standings-table" role="table" aria-label="Average placement standings"><div class="standings-head" role="row"><span role="columnheader">#</span><span role="columnheader">Member</span><span role="columnheader">Avg.</span></div>${standings.map(({ name, average }, index) => `<div class="standing-row standing-${index + 1}" role="row"><span class="standing-number" role="cell">${index + 1}</span><strong role="rowheader">${name}</strong><span role="cell">${average.toFixed(2)}</span></div>`).join('')}</div>`;
}

// Catmull-Rom-to-Bezier smoothing, generalized to any number of points (>= 2).
// Falls back to a straight segment for exactly 2 points.
function smoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  const control = 1 / 6;
  const segments = [`M ${points[0].x},${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * control;
    const c1y = p1.y + (p2.y - p0.y) * control;
    const c2x = p2.x - (p3.x - p1.x) * control;
    const c2y = p2.y - (p3.y - p1.y) * control;
    segments.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
  }
  return segments.join(' ');
}

function renderRankingChart({ chartEl, averageEl, years, rankingData, title, description }) {
  const rankCount = rankingData.length;
  const width = 820, height = 470, left = 180, right = 110, top = 68, bottom = 58;
  const plotRight = width - right;
  const x = index => years.length > 1 ? left + index * ((plotRight - left) / (years.length - 1)) : left;
  const y = rank => top + (rank - 1) * ((height - top - bottom) / (rankCount - 1 || 1));

  const grid = Array.from({ length: rankCount }, (_, index) => {
    const rank = index + 1;
    return `<line class="chart-grid" x1="${left}" x2="${plotRight}" y1="${y(rank)}" y2="${y(rank)}"/>`;
  }).join('');
  const xLabels = years.map((year, index) => `<text class="chart-axis-text" x="${x(index)}" y="${height - 28}" text-anchor="middle">${year}</text>`).join('');

  const lines = rankingData.map(manager => {
    const color = managerColors[manager.name] ?? '#475569';
    const points = manager.ranks
      .map((rank, yearIndex) => (rank == null ? null : { x: x(yearIndex), y: y(rank) }))
      .filter(Boolean);

    if (points.length === 0) return '';

    const path = points.length > 1 ? smoothPath(points) : '';
    const circles = points.map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" style="stroke:${color}"></circle>`).join('');
    const end = points.at(-1);
    const avatarX = plotRight + 18;
    const avatarSize = 76;
    const avatarId = `avatar-${chartEl.id}-${manager.name.toLowerCase()}`;
    const avatarCenter = avatarX + avatarSize / 2;
    const knownRanks = manager.ranks.filter(rank => rank != null).join(', ');

    return `<g class="chart-series" data-manager="${manager.name}" tabindex="0" role="group" aria-label="${manager.name}: ranks ${knownRanks}"><defs><clipPath id="${avatarId}"><circle cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2}"></circle></clipPath></defs>${path ? `<path class="chart-line" d="${path}" style="stroke:${color}"></path><path class="chart-hit" d="${path}"></path>` : ''}${circles}<text class="chart-name" x="${left - 18}" y="${end.y + 8}" text-anchor="end" style="fill:${color}">${manager.name}</text><circle class="chart-avatar-shell" cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2 + 3}" style="stroke:${color}"></circle><image class="chart-avatar" href="assets/profiles/${profileImages[manager.name]}" x="${avatarX}" y="${end.y - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avatarId})"></image></g>`;
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${chartEl.id}-title ${chartEl.id}-description"><title id="${chartEl.id}-title">${title}</title><desc id="${chartEl.id}-description">${description}</desc>${grid}${xLabels}<text class="chart-axis-title" x="${(left + plotRight) / 2}" y="${height - 6}" text-anchor="middle">Year</text><text class="chart-axis-title" transform="translate(22 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">Rank</text>${lines}</svg>`;

  chartEl.querySelectorAll('.chart-series').forEach(series => {
    const setHighlight = active => series.classList.toggle('is-highlighted', active);
    series.addEventListener('pointerenter', () => setHighlight(true));
    series.addEventListener('pointerleave', () => setHighlight(false));
    series.addEventListener('focus', () => setHighlight(true));
    series.addEventListener('blur', () => setHighlight(false));
  });

  if (averageEl) {
    renderAverageTable(averageEl, rankingData);
    const averagePanel = averageEl.closest('.ranking-average');
    if (averagePanel) {
      const alignStandings = () => {
        const svgHeight = chartEl.querySelector('svg').getBoundingClientRect().height;
        averagePanel.style.setProperty('--chart-height', `${svgHeight}px`);
        averagePanel.style.setProperty('--chart-top', `${svgHeight * top / height}px`);
        averagePanel.style.setProperty('--chart-step', `${svgHeight * (height - top - bottom) / height / (rankCount - 1 || 1)}px`);
      };
      new ResizeObserver(alignStandings).observe(chartEl);
      alignStandings();
    }
  }
}

// Any element with class "ranking-chart" and a "data-src" pointing at a CSV file
// becomes a chart. Its paired average table is found by naming convention:
// id="foo-chart" pairs with id="foo-average-table" (both optional/independent).
document.querySelectorAll('.ranking-chart[data-src]').forEach(chartEl => {
  const src = chartEl.dataset.src;
  const averageId = chartEl.id.replace(/-chart$/, '-average-table');
  const averageEl = averageId !== chartEl.id ? document.getElementById(averageId) : null;
  const title = chartEl.dataset.title || 'Meaux Burreax rankings over time';
  const description = chartEl.dataset.description || "Line chart showing each manager's rank, where 1 is the highest position, over time.";

  loadRankingCSV(src)
    .then(({ years, rankingData }) => {
      renderRankingChart({ chartEl, averageEl, years, rankingData, title, description });
    })
    .catch(error => {
      console.error(error);
      chartEl.innerHTML = '<p>Unable to load chart data.</p>';
    });
});

// ---- KPI tiles: how well do the pre-season tier lists predict actual results? ----
// All four metrics are calculated the same way: pool one row per manager per
// season where BOTH a predicted tier rank and an actual result exist (so right
// now, that's 2024 and 2025 only — 2026 has a tier list but no result yet, and
// 2022/2023 have results but no tier list), then compute the metric across that
// pooled set. This keeps every tile driven by one consistent, easy-to-explain
// rule, and it automatically picks up new seasons as both CSVs grow.
const kpiInfo = {
  tau: {
    label: "Kendall's Tau",
    format: value => value.toFixed(2),
    tip: "How often the tier list ranked any two manager-seasons in the same order they actually finished, pooled across every season with both a prediction and a result. Ranges from \u22121 (always backwards) to +1 (always correct); 0 is no better than a coin flip.",
  },
  mae: {
    label: 'Mean Rank Error',
    format: value => `${value.toFixed(2)} spots`,
    tip: "On average, how many spots a manager's actual finish differed from their pre-season tier rank, across every manager-season with both a prediction and a result.",
  },
  top3: {
    label: 'Top 3 Hit Rate',
    format: value => `${Math.round(value * 100)}%`,
    tip: 'Of the managers predicted into the top 3 each season, the share who actually finished there.',
  },
  bottom3: {
    label: 'Bottom 3 Hit Rate',
    format: value => `${Math.round(value * 100)}%`,
    tip: 'Of the managers predicted into the bottom 3 each season, the share who actually finished there.',
  },
};

// Builds one { name, year, predicted, actual } row per manager per season where
// both a predicted tier rank and an actual result exist.
function buildOverlapPairs(tierData, resultsData) {
  const tierByName = Object.fromEntries(tierData.rankingData.map(manager => [manager.name, manager]));
  const overlapYears = tierData.years.filter(year => resultsData.years.includes(year));
  const pairs = [];
  overlapYears.forEach(year => {
    const tierIndex = tierData.years.indexOf(year);
    const resultIndex = resultsData.years.indexOf(year);
    resultsData.rankingData.forEach(manager => {
      const tierManager = tierByName[manager.name];
      if (!tierManager) return;
      const predicted = tierManager.ranks[tierIndex];
      const actual = manager.ranks[resultIndex];
      if (predicted == null || actual == null) return;
      pairs.push({ name: manager.name, year, predicted, actual });
    });
  });
  return { overlapYears, pairs };
}

// Kendall's tau-b, pooled across every manager-season pair. Ties are common here
// (both the predicted and actual scales repeat 1..N every season), so ties are
// excluded from the concordant/discordant count and instead shrink the
// denominator, per the standard tau-b definition.
function kendallsTauB(pairs) {
  let concordant = 0, discordant = 0, tiedPredicted = 0, tiedActual = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const dPredicted = pairs[i].predicted - pairs[j].predicted;
      const dActual = pairs[i].actual - pairs[j].actual;
      if (dPredicted === 0 && dActual === 0) { tiedPredicted++; tiedActual++; continue; }
      if (dPredicted === 0) { tiedPredicted++; continue; }
      if (dActual === 0) { tiedActual++; continue; }
      if (dPredicted * dActual > 0) concordant++; else discordant++;
    }
  }
  const totalPairs = pairs.length * (pairs.length - 1) / 2;
  const denominator = Math.sqrt((totalPairs - tiedPredicted) * (totalPairs - tiedActual));
  return denominator === 0 ? null : (concordant - discordant) / denominator;
}

function meanAbsoluteRankError(pairs) {
  if (pairs.length === 0) return null;
  const total = pairs.reduce((sum, pair) => sum + Math.abs(pair.predicted - pair.actual), 0);
  return total / pairs.length;
}

// Groups pairs by year (so "top 3" / "bottom 3" are relative to that season's own
// field size) and reports how often a predicted top/bottom-3 manager landed there.
function tierHitRate(pairs, zone) {
  const pairsByYear = {};
  pairs.forEach(pair => {
    (pairsByYear[pair.year] ??= []).push(pair);
  });
  let hits = 0, total = 0;
  Object.values(pairsByYear).forEach(yearPairs => {
    const fieldSize = yearPairs.length;
    yearPairs.forEach(({ predicted, actual }) => {
      const predictedInZone = zone === 'top' ? predicted <= 3 : predicted >= fieldSize - 2;
      if (!predictedInZone) return;
      total += 1;
      const actualInZone = zone === 'top' ? actual <= 3 : actual >= fieldSize - 2;
      if (actualInZone) hits += 1;
    });
  });
  return total === 0 ? null : hits / total;
}

function renderKPIRow(kpiEl) {
  const captionEl = document.getElementById('kpi-caption');
  Promise.all([
    loadRankingCSV(kpiEl.dataset.tierSrc),
    loadRankingCSV(kpiEl.dataset.resultsSrc),
  ])
    .then(([tierData, resultsData]) => {
      const { overlapYears, pairs } = buildOverlapPairs(tierData, resultsData);
      if (captionEl) {
        captionEl.textContent = overlapYears.length
          ? `Calculated from every season with both a tier list and a final result: ${overlapYears.join(', ')}.`
          : 'No overlapping seasons yet.';
      }
      const metrics = [
        { key: 'tau', value: kendallsTauB(pairs) },
        { key: 'mae', value: meanAbsoluteRankError(pairs) },
        { key: 'top3', value: tierHitRate(pairs, 'top') },
        { key: 'bottom3', value: tierHitRate(pairs, 'bottom') },
      ];
      kpiEl.innerHTML = metrics.map(({ key, value }) => {
        const info = kpiInfo[key];
        const tipId = `kpi-tip-${key}`;
        const display = value == null ? '\u2014' : info.format(value);
        return `<div class="kpi-tile">
          <p class="kpi-value">${display}</p>
          <p class="kpi-label">${info.label}<button type="button" class="kpi-info" aria-describedby="${tipId}" aria-label="What does ${info.label} mean?">?</button></p>
          <span role="tooltip" id="${tipId}" class="kpi-tooltip">${info.tip}</span>
        </div>`;
      }).join('');
    })
    .catch(error => {
      console.error(error);
      kpiEl.innerHTML = '<p>Unable to load KPI data.</p>';
      if (captionEl) captionEl.textContent = '';
    });
}

const kpiRowEl = document.getElementById('kpi-row');
if (kpiRowEl) renderKPIRow(kpiRowEl);

// ---- Manager Deep Dive: per-manager bar (actual) + dashed line (preseason) chart ----
// Lightens or darkens a hex color toward white/black by `amount` (0-1), used to
// give the preseason dashed line a distinct-but-related shade of a manager's
// bar color so both read clearly on the same chart.
function shadeColor(hex, amount) {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const target = amount >= 0 ? 255 : 0;
  const mix = channel => channel + (target - channel) * Math.abs(amount);
  return '#' + [mix(r), mix(g), mix(b)].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function renderMemberChart({ chartEl, name, tierData, resultsData }) {
  const width = 760, height = 360, left = 60, right = 24, top = 24, bottom = 58;
  const plotRight = width - right, plotBottom = height - bottom;
  const years = Array.from(new Set([...resultsData.years, ...tierData.years])).sort();
  const maxRank = Math.max(resultsData.rankingData.length, tierData.rankingData.length);
  const bandWidth = (plotRight - left) / years.length;
  const y = rank => top + (rank - 1) * ((plotBottom - top) / (maxRank - 1 || 1));
  const minBarHeight = 4; // keeps a last-place finish visible as a sliver, distinct from "no data"

  const barColor = managerColors[name] ?? '#94a3b8';
  const lineColor = shadeColor(barColor, 0.55);

  const tierManager = tierData.rankingData.find(manager => manager.name === name);
  const resultsManager = resultsData.rankingData.find(manager => manager.name === name);

  const grid = Array.from({ length: maxRank }, (_, index) => {
    const rank = index + 1;
    return `<line class="chart-grid" x1="${left}" x2="${plotRight}" y1="${y(rank)}" y2="${y(rank)}"/>`;
  }).join('');

  // No manager-name labels crowd the left margin on this single-manager chart
  // (unlike the two charts above), so there's room to number the rank axis.
  const rankLabels = Array.from({ length: maxRank }, (_, index) => {
    const rank = index + 1;
    return `<text class="chart-axis-text" x="${left - 14}" y="${y(rank) + 5}" text-anchor="end">${rank}</text>`;
  }).join('');

  const bars = years.map((year, index) => {
    const resultIndex = resultsData.years.indexOf(year);
    const actual = resultIndex === -1 ? null : resultsManager?.ranks[resultIndex];
    if (actual == null) return '';
    const barX = left + index * bandWidth + bandWidth * 0.24;
    const barWidth = bandWidth * 0.52;
    const barHeight = Math.max(plotBottom - y(actual), minBarHeight);
    const barTop = plotBottom - barHeight;
    return `<rect class="member-bar" x="${barX}" y="${barTop}" width="${barWidth}" height="${barHeight}" fill="${barColor}"><title>${year}: actual finish ${actual}</title></rect>`;
  }).join('');

  const linePoints = years.map((year, index) => {
    const tierIndex = tierData.years.indexOf(year);
    const predicted = tierIndex === -1 ? null : tierManager?.ranks[tierIndex];
    if (predicted == null) return null;
    return { x: left + index * bandWidth + bandWidth / 2, y: y(predicted), year, predicted };
  }).filter(Boolean);

  const linePath = linePoints.length > 1
    ? linePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
    : '';
  const lineDots = linePoints.map(point => `<circle class="member-line-dot" cx="${point.x}" cy="${point.y}" r="4.5" fill="${lineColor}"><title>${point.year}: preseason tier rank ${point.predicted}</title></circle>`).join('');

  const xLabels = years.map((year, index) => `<text class="chart-axis-text" x="${left + index * bandWidth + bandWidth / 2}" y="${plotBottom + 30}" text-anchor="middle">${year}</text>`).join('');

  chartEl.innerHTML = `
    <div class="member-chart-head">
      <span class="member-legend-item"><span class="member-swatch" style="--swatch-color:${barColor}"></span>Actual finish</span>
      <span class="member-legend-item"><span class="member-swatch member-swatch--line" style="--swatch-color:${lineColor}"></span>Preseason tier rank</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${name}'s actual finish by year, shown as bars, against ${name}'s preseason tier rank, shown as a dashed line.">
      ${grid}
      ${rankLabels}
      ${bars}
      ${linePath ? `<path class="member-line" d="${linePath}" stroke="${lineColor}"></path>` : ''}
      ${lineDots}
      ${xLabels}
      <text class="chart-axis-title" x="${(left + plotRight) / 2}" y="${height - 6}" text-anchor="middle">Year</text>
      <text class="chart-axis-title" transform="translate(14 ${(top + plotBottom) / 2}) rotate(-90)" text-anchor="middle">Rank</text>
    </svg>`;
}

// Average actual placement (all seasons with a result), plus average and average
// absolute delta (expected minus actual, so positive = beat expectations) across
// seasons where both a preseason rank and a result exist.
function computeMemberMetrics(name, tierData, resultsData) {
  const tierManager = tierData.rankingData.find(manager => manager.name === name);
  const resultsManager = resultsData.rankingData.find(manager => manager.name === name);

  const knownActual = (resultsManager?.ranks ?? []).filter(rank => rank != null);
  const avgActual = knownActual.length ? knownActual.reduce((sum, rank) => sum + rank, 0) / knownActual.length : null;

  const overlapYears = tierData.years.filter(year => resultsData.years.includes(year));
  const deltas = [];
  overlapYears.forEach(year => {
    const tierIndex = tierData.years.indexOf(year);
    const resultIndex = resultsData.years.indexOf(year);
    const predicted = tierManager?.ranks[tierIndex];
    const actual = resultsManager?.ranks[resultIndex];
    if (predicted == null || actual == null) return;
    // Ranks count down from 1 (best), so "expected minus actual" is positive
    // when a manager finishes better than predicted (a smaller actual rank).
    deltas.push(predicted - actual);
  });
  const avgDelta = deltas.length ? deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length : null;
  const avgAbsDelta = deltas.length ? deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length : null;

  let verdict = 'Not enough data';
  if (avgDelta != null) {
    const magnitude = Math.abs(avgDelta);
    const direction = avgDelta > 0 ? 'Overperformer' : avgDelta < 0 ? 'Bust' : null;
    if (magnitude <= 1 || !direction) verdict = 'Meets Expectations';
    else if (magnitude <= 2.5) verdict = `Slight ${direction}`;
    else if (magnitude <= 4) verdict = direction;
    else verdict = `Massive ${direction}`;
  }

  return { avgActual, avgDelta, avgAbsDelta, verdict };
}

function renderMemberMetrics(metricsEl, name, tierData, resultsData) {
  const { avgActual, avgDelta, avgAbsDelta, verdict } = computeMemberMetrics(name, tierData, resultsData);
  const color = managerColors[name] ?? '#94a3b8';
  const formatSigned = value => value == null ? '\u2014' : `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
  const rows = [
    ['Average Actual Placement', avgActual != null ? avgActual.toFixed(2) : '\u2014'],
    ['Average Delta (Expected \u2212 Actual)', formatSigned(avgDelta)],
    ['Average Absolute Delta', avgAbsDelta != null ? avgAbsDelta.toFixed(2) : '\u2014'],
  ];
  const verdictClass = `member-verdict--${verdict.toLowerCase().replace(/\s+/g, '-')}`;
  metricsEl.innerHTML = `
    <h3 style="color:${color}">${name}</h3>
    <div class="member-metrics-table">
      ${rows.map(([label, value]) => `<div class="member-metric-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}
    </div>
    <p class="member-verdict ${verdictClass}">${verdict}</p>`;
}

function renderMemberProfile(profileEl, name) {
  const color = managerColors[name] ?? '#94a3b8';
  const image = profileImages[name];
  profileEl.innerHTML = image
    ? `<img class="member-avatar" src="assets/profiles/${image}" alt="${name}'s profile photo" style="border-color:${color}">`
    : '';
}

function initMemberExplorer() {
  const buttonsEl = document.getElementById('member-buttons');
  const chartEl = document.getElementById('member-chart');
  const metricsEl = document.getElementById('member-metrics');
  const profileEl = document.getElementById('member-profile');
  if (!buttonsEl || !chartEl || !metricsEl) return;

  Promise.all([
    loadRankingCSV(buttonsEl.dataset.tierSrc),
    loadRankingCSV(buttonsEl.dataset.resultsSrc),
  ])
    .then(([tierData, resultsData]) => {
      const names = tierData.rankingData.map(manager => manager.name);

      function selectMember(name) {
        buttonsEl.querySelectorAll('.member-button').forEach(button => {
          const isActive = button.dataset.name === name;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-pressed', String(isActive));
        });
        renderMemberChart({ chartEl, name, tierData, resultsData });
        renderMemberMetrics(metricsEl, name, tierData, resultsData);
        if (profileEl) renderMemberProfile(profileEl, name);
      }

      buttonsEl.innerHTML = names.map(name => {
        const color = managerColors[name] ?? '#94a3b8';
        return `<button type="button" class="member-button" data-name="${name}" aria-pressed="false" style="--member-color:${color}">${name}</button>`;
      }).join('');

      buttonsEl.addEventListener('click', event => {
        const button = event.target.closest('.member-button');
        if (!button) return;
        selectMember(button.dataset.name);
      });

      selectMember(names[0]);
    })
    .catch(error => {
      console.error(error);
      buttonsEl.innerHTML = '<p>Unable to load manager data.</p>';
    });
}

initMemberExplorer();


// Light/dark toggle. The initial theme is already applied by a small inline
// script in <head> (before first paint, reading the same storage key) so
// there's no flash of the wrong theme; this just wires up the button click
// and keeps its label/icon in sync with the current theme.
const THEME_KEY = 'meaux-burreax-theme';

function reflectTheme(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(theme === 'light'));
    const icon = button.querySelector('.theme-toggle__icon');
    const label = button.querySelector('.theme-toggle__label');
    if (icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
    if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
  });
}

document.querySelectorAll('[data-theme-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (error) { /* storage unavailable; theme just won't persist */ }
    reflectTheme(next);
  });
});

reflectTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
