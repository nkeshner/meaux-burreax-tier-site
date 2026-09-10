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

const rankingData = [
  { name: 'Noah', ranks: [2, 1, 1] },
  { name: 'Tom', ranks: [1, 2, 10] },
  { name: 'Goutham', ranks: [3, 10, 4] },
  { name: 'Peggy', ranks: [4, 7, 2] },
  { name: 'Vinny', ranks: [5, 5, 11] },
  { name: 'David', ranks: [6, 9, 5] },
  { name: 'Dongbo', ranks: [7, 11, 3] },
  { name: 'Theo', ranks: [8, 3, 9] },
  { name: 'Sam', ranks: [9, 8, 12] },
  { name: 'Michael', ranks: [10, 12, 6] },
  { name: 'Yiding', ranks: [11, 4, 8] },
  { name: 'Wenlong', ranks: [12, 6, 7] },
];
const profileImages = {
  Noah: 'noah-profile.jpg', Tom: 'tom-profile.jpg', Goutham: 'goutham-profile.jpeg', Peggy: 'peggy-profile.jpg',
  Vinny: 'vinny-profile.jpg', David: 'david-profile.jpeg', Dongbo: 'dongbo-profile.jpg', Theo: 'theo-profile.jpg',
  Sam: 'sam-profile.jpg', Michael: 'michael-profile.jpg', Yiding: 'yiding-profile.jpeg', Wenlong: 'wenlong-profile.jpg',
};

const chart = document.querySelector('#ranking-chart');
const averageTable = document.querySelector('#ranking-average-table');
if (averageTable) {
  const standings = rankingData
    .map(({ name, ranks }) => ({ name, average: ranks.reduce((total, rank) => total + rank, 0) / ranks.length, latest: ranks.at(-1) }))
    .sort((a, b) => a.average - b.average || a.latest - b.latest);
  averageTable.innerHTML = `<div class="standings-table" role="table" aria-label="Average placement standings"><div class="standings-head" role="row"><span role="columnheader">#</span><span role="columnheader">Member</span><span role="columnheader">Avg.</span></div>${standings.map(({ name, average }, index) => `<div class="standing-row standing-${index + 1}" role="row"><span class="standing-number" role="cell">${index + 1}</span><strong role="rowheader">${name}</strong><span role="cell">${average.toFixed(2)}</span></div>`).join('')}</div>`;
}
if (chart) {
  const years = [2024, 2025, 2026];
  const colors = ['#0f766e', '#dc2626', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#c2410c', '#4f46e5', '#a16207', '#475569'];
  const width = 820, height = 470, left = 180, right = 110, top = 68, bottom = 58;
  const plotRight = width - right;
  const x = index => left + index * ((plotRight - left) / (years.length - 1));
  const y = rank => top + (rank - 1) * ((height - top - bottom) / 11);
  const grid = Array.from({ length: 12 }, (_, index) => {
    const rank = index + 1;
    return `<line class="chart-grid" x1="${left}" x2="${plotRight}" y1="${y(rank)}" y2="${y(rank)}"/>`;
  }).join('');
  const xLabels = years.map((year, index) => `<text class="chart-axis-text" x="${x(index)}" y="${height - 28}" text-anchor="middle">${year}</text>`).join('');
  const smoothPath = points => {
    const [a, b, c] = points;
    const control = 1 / 6;
    return `M ${a.x},${a.y} C ${a.x + (b.x - a.x) * control},${a.y + (b.y - a.y) * control} ${b.x - (c.x - a.x) * control},${b.y - (c.y - a.y) * control} ${b.x},${b.y} C ${b.x + (c.x - a.x) * control},${b.y + (c.y - a.y) * control} ${c.x - (c.x - b.x) * control},${c.y - (c.y - b.y) * control} ${c.x},${c.y}`;
  };
  const lines = rankingData.map((manager, index) => {
    const points = manager.ranks.map((rank, yearIndex) => ({ x: x(yearIndex), y: y(rank) }));
    const path = smoothPath(points);
    const circles = points.map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" style="stroke:${colors[index]}"></circle>`).join('');
    const end = points.at(-1);
    const avatarX = plotRight + 18;
    const avatarSize = 76;
    const avatarId = `avatar-${manager.name.toLowerCase()}`;
    const avatarCenter = avatarX + avatarSize / 2;
    return `<g class="chart-series" data-manager="${manager.name}" tabindex="0" role="group" aria-label="${manager.name}: ranks ${manager.ranks.join(', ')} from 2024 to 2026"><defs><clipPath id="${avatarId}"><circle cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2}"></circle></clipPath></defs><path class="chart-line" d="${path}" style="stroke:${colors[index]}"></path><path class="chart-hit" d="${path}"></path>${circles}<text class="chart-name" x="${left - 18}" y="${end.y + 8}" text-anchor="end" style="fill:${colors[index]}">${manager.name}</text><circle class="chart-avatar-shell" cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2 + 3}" style="stroke:${colors[index]}"></circle><image class="chart-avatar" href="assets/profiles/${profileImages[manager.name]}" x="${avatarX}" y="${end.y - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avatarId})"></image></g>`;
  }).join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Meaux Burreax rankings from 2024 to 2026</title><desc id="chart-description">Line chart showing each manager's rank, where 1 is the highest position, across the 2024, 2025, and 2026 pre-season tier lists.</desc>${grid}${xLabels}<text class="chart-axis-title" x="${(left + plotRight) / 2}" y="${height - 6}" text-anchor="middle">Year</text><text class="chart-axis-title" transform="translate(22 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">Rank</text>${lines}</svg>`;
  chart.querySelectorAll('.chart-series').forEach(series => {
    const setHighlight = active => series.classList.toggle('is-highlighted', active);
    series.addEventListener('pointerenter', () => setHighlight(true));
    series.addEventListener('pointerleave', () => setHighlight(false));
    series.addEventListener('focus', () => setHighlight(true));
    series.addEventListener('blur', () => setHighlight(false));
  });
  const averagePanel = document.querySelector('.ranking-average');
  const alignStandings = () => {
    const svgHeight = chart.querySelector('svg').getBoundingClientRect().height;
    averagePanel.style.setProperty('--chart-height', `${svgHeight}px`);
    averagePanel.style.setProperty('--chart-top', `${svgHeight * top / height}px`);
    averagePanel.style.setProperty('--chart-step', `${svgHeight * (height - top - bottom) / 11}px`);
  };
  new ResizeObserver(alignStandings).observe(chart);
  alignStandings();
}
