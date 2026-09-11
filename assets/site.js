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
  Noah: '#0f766e',
  Tom: '#dc2626',
  Goutham: '#2563eb',
  Peggy: '#d97706',
  Vinny: '#7c3aed',
  David: '#0891b2',
  Dongbo: '#db2777',
  Theo: '#65a30d',
  Sam: '#c2410c',
  Michael: '#4f46e5',
  Yiding: '#a16207',
  Wenlong: '#475569',
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
