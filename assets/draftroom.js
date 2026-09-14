// Draft Room page. Loaded after assets/site.js (see pages/draftroom.html),
// and reuses that file's `managerColors`, `profileImages`, and `smoothPath`
// — classic <script> tags share one top-level scope, so those `const`s are
// already in scope here.

const DRAFT_GUY_THRESHOLD = 40; // a player needs a >40% average score to be "claimed"
const DRAFT_TABLE_PAGE_SIZE = 50;
const TOP_GUYS_COUNT = 6;

// One color per roster position, used to color-code the "Pos" column on the
// full draft board and the position badge wherever a bare position appears.
const positionColors = {
  QB: '#f87171',
  RB: '#34d399',
  WR: '#60a5fa',
  TE: '#fbbf24',
  K: '#c084fc',
};

// ---- CSV parsing --------------------------------------------------------

// Parses the "pivot" CSVs (manager-player-draft-pct.csv, -spend-pct.csv,
// -spend-pct-per-manager.csv). Each has a throwaway first row, then a real
// header row of "player_pos,Manager1,Manager2,...", then one row per
// player. Blank cells (a manager who never drafted that player) become 0.
function parsePivotCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.length > 0);
  const headerLine = lines[1] ?? '';
  const managers = headerLine.split(',').slice(1).map(cell => cell.trim()).filter(Boolean);
  const rows = {};
  lines.slice(2).forEach(line => {
    const cells = line.split(',');
    const key = (cells[0] ?? '').trim();
    if (!key) return;
    const values = {};
    managers.forEach((manager, index) => {
      const raw = (cells[index + 1] ?? '').trim();
      values[manager] = raw ? parseFloat(raw.replace('%', '')) : 0;
    });
    rows[key] = values;
  });
  return { managers, rows };
}

async function loadPivotCSV(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  return parsePivotCSV(await response.text());
}

// Parses draft-recap.csv: year,player,position,player_pos,price,manager
function parseDraftRecap(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.length > 0);
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    return {
      year: cells[0].trim(),
      player: cells[1].trim(),
      position: cells[2].trim(),
      playerPos: cells[3].trim(),
      price: Number(cells[4]),
      manager: cells[5].trim(),
    };
  });
}

async function loadDraftRecap(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  return parseDraftRecap(await response.text());
}

// ---- Shared helpers: association + gradient tiles ------------------------

// For every player, averages their manager-player-draft-pct.csv row with
// their manager-player-spend-pct.csv row, manager by manager. This single
// "average row" per player drives both which manager (if any) is credited
// as the player's association, and the gradient used on that player's tile.
function computeAverageRows(draftPct, spendPct) {
  const players = new Set([...Object.keys(draftPct.rows), ...Object.keys(spendPct.rows)]);
  const managers = draftPct.managers;
  const rows = {};
  players.forEach(player => {
    const dRow = draftPct.rows[player] ?? {};
    const sRow = spendPct.rows[player] ?? {};
    const row = {};
    managers.forEach(manager => {
      row[manager] = ((dRow[manager] ?? 0) + (sRow[manager] ?? 0)) / 2;
    });
    rows[player] = row;
  });
  return { managers, rows };
}

// A player is "[Manager]'s guy" if that manager has the single highest
// average of (draft %, spend %) across all managers, and that average is
// above the threshold. Ties, or nobody clearing the threshold, => Free Agent
// (represented here as `null`).
function computeAssociations(averageRows) {
  const associations = {};
  Object.entries(averageRows.rows).forEach(([player, row]) => {
    let best = null, bestAvg = -Infinity, tieCount = 0;
    Object.entries(row).forEach(([manager, avg]) => {
      if (avg > bestAvg + 1e-9) {
        bestAvg = avg;
        best = manager;
        tieCount = 1;
      } else if (Math.abs(avg - bestAvg) <= 1e-9) {
        tieCount += 1;
      }
    });
    associations[player] = (bestAvg > DRAFT_GUY_THRESHOLD && tieCount === 1) ? best : null;
  });
  return associations;
}

function labelForAssociation(manager) {
  return manager ? `${manager}'s Guy` : 'Free Agent';
}

// Colored, manager-tinted markup for the "Association" table cell.
function associationCellHtml(manager) {
  if (!manager) return `<span class="association-tag association-tag--free-agent">Free Agent</span>`;
  const color = managerColors[manager] ?? '#94a3b8';
  return `<span class="association-tag" style="color:${color}">${manager}'s Guy</span>`;
}

// Colored badge for the "Pos" table cell.
function positionBadge(position) {
  const color = positionColors[position] ?? '#94a3b8';
  return `<span class="position-pill" style="background:${color}">${position}</span>`;
}

// Builds a smoothly-blended CSS gradient for a player's tile: one color per
// manager who has a share of `row` (their average draft/spend %), placed at
// the midpoint of that manager's share so colors blend into each other
// rather than sitting in hard-edged blocks. Ordered highest share first.
function playerGradient(row) {
  const entries = Object.entries(row ?? {}).filter(([, pct]) => pct > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return 'linear-gradient(135deg, var(--surface-2), var(--surface))';
  if (entries.length === 1) {
    const color = managerColors[entries[0][0]] ?? '#94a3b8';
    return `linear-gradient(135deg, ${color}, ${color})`;
  }
  let cumulative = 0;
  const stops = entries.map(([manager, pct]) => {
    const color = managerColors[manager] ?? '#94a3b8';
    const midpoint = cumulative + pct / 2;
    cumulative += pct;
    return { color, midpoint };
  });
  return `linear-gradient(135deg, ${stops.map(stop => `${stop.color} ${stop.midpoint.toFixed(2)}%`).join(', ')})`;
}

function stripPosition(playerPos) {
  return playerPos.replace(/\s*\([A-Z]+\)\s*$/, '');
}

// ---- Section 1: Manager's Guys -------------------------------------------

// Top 6 players associated with `manager`, ranked by the share of that
// manager's own budget spent on the player (manager-player-spend-pct-per-manager.csv).
function topGuysForManager(manager, associations, spendPerManager) {
  const rows = spendPerManager.rows;
  return Object.keys(associations)
    .filter(player => associations[player] === manager)
    .map(player => ({ player, value: rows[player]?.[manager] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_GUYS_COUNT);
}

function renderGuysList(containerEl, manager, associations, spendPerManager, averageRows) {
  const guys = topGuysForManager(manager, associations, spendPerManager);
  if (guys.length === 0) {
    containerEl.innerHTML = `<p class="draft-history-empty">${manager} doesn't have any "guys" (yet).</p>`;
    return;
  }
  containerEl.innerHTML = `<div class="player-tile-grid">${guys.map(({ player, value }) => `
    <div class="player-tile">
      <button type="button" class="player-tile-swatch" style="background:${playerGradient(averageRows.rows[player])}" data-player="${player}">
        <span class="player-tile-name">${stripPosition(player)}</span>
      </button>
      <p class="player-tile-meta">${value.toFixed(1)}% of ${manager}'s budget</p>
    </div>`).join('')}</div>`;
}

// ---- Section 2: Draft Value Over Time ------------------------------------

function populatePlayerDropdown(selectEl, allYears, draftRecap) {
  const players = Array.from(new Set(draftRecap.map(row => row.playerPos))).sort((a, b) => a.localeCompare(b));
  selectEl.innerHTML = players.map(player => `<option value="${player}">${player}</option>`).join('');
}

function renderPlayerChart({ chartEl, tableEl, titleEl, playerPos, draftRecap, associations, allYears }) {
  const history = draftRecap
    .filter(row => row.playerPos === playerPos)
    .sort((a, b) => Number(a.year) - Number(b.year));
  const name = stripPosition(playerPos);
  if (titleEl) titleEl.textContent = `${name}: Draft Value Over Time`;

  if (history.length === 0) {
    chartEl.innerHTML = '<p class="draft-history-empty">No draft history for this player.</p>';
    if (tableEl) tableEl.innerHTML = '';
    return;
  }

  const manager = associations[playerPos];
  const lineColor = manager ? (managerColors[manager] ?? '#ffffff') : '#ffffff';

  const width = 820, height = 420, left = 64, right = 24, top = 24, bottom = 58;
  const plotRight = width - right, plotBottom = height - bottom;
  const maxPrice = Math.max(...history.map(row => row.price), 1);
  const x = year => {
    const index = allYears.indexOf(year);
    return allYears.length > 1 ? left + index * ((plotRight - left) / (allYears.length - 1)) : (left + plotRight) / 2;
  };
  const y = price => plotBottom - (price / maxPrice) * (plotBottom - top);

  const gridSteps = 4;
  const grid = Array.from({ length: gridSteps + 1 }, (_, index) => {
    const value = Math.round(maxPrice * index / gridSteps);
    const yy = y(value);
    return `<line class="chart-grid" x1="${left}" x2="${plotRight}" y1="${yy}" y2="${yy}"/><text class="chart-axis-text" x="${left - 10}" y="${yy + 5}" text-anchor="end">$${value}</text>`;
  }).join('');

  const xLabels = allYears.map(year => `<text class="chart-axis-text" x="${x(year)}" y="${plotBottom + 30}" text-anchor="middle">${year}</text>`).join('');

  const points = history.map(row => ({ x: x(row.year), y: y(row.price), row }));
  const path = points.length > 1 ? smoothPath(points) : '';

  const dots = points.map(({ x: px, y: py, row }) => {
    const dotColor = managerColors[row.manager] ?? lineColor;
    return `<circle class="chart-point" cx="${px}" cy="${py}" r="5" style="stroke:${dotColor};opacity:1"><title>${row.year}: $${row.price} by ${row.manager}</title></circle>`;
  }).join('');

  const avatarSize = 40;
  const avatars = points.map(({ x: px, y: py, row }) => {
    const image = profileImages[row.manager];
    if (!image) return '';
    const centerY = py - 34;
    const clipId = `draft-avatar-${playerPos.replace(/[^a-z0-9]/gi, '')}-${row.year}`;
    const swatch = managerColors[row.manager] ?? '#94a3b8';
    return `<g class="draft-avatar-group">
      <defs><clipPath id="${clipId}"><circle cx="${px}" cy="${centerY}" r="${avatarSize / 2}"></circle></clipPath></defs>
      <circle class="draft-avatar-shell" cx="${px}" cy="${centerY}" r="${avatarSize / 2 + 2}" style="stroke:${swatch}"></circle>
      <image href="../assets/profiles/${image}" x="${px - avatarSize / 2}" y="${centerY - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"></image>
    </g>`;
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${name}'s draft price by year, hover to see who drafted them each year">
    ${grid}
    ${path ? `<path class="chart-line" d="${path}" style="stroke:${lineColor};opacity:1"></path>` : ''}
    ${dots}
    ${avatars}
    ${xLabels}
    <text class="chart-axis-title" x="${(left + plotRight) / 2}" y="${height - 6}" text-anchor="middle">Year</text>
    <text class="chart-axis-title" transform="translate(14 ${(top + plotBottom) / 2}) rotate(-90)" text-anchor="middle">Draft Price</text>
  </svg>`;

  if (tableEl) {
    tableEl.innerHTML = `<div class="draft-history-table" role="table" aria-label="${name}'s draft history">
      <div class="draft-history-head" role="row"><span role="columnheader">Year</span><span role="columnheader">Manager</span><span role="columnheader">Value</span></div>
      ${history.map(row => {
        const image = profileImages[row.manager];
        return `<div class="draft-history-row" role="row">
          <span role="cell">${row.year}</span>
          <span class="draft-history-manager" role="cell">${image ? `<img class="draft-history-avatar" src="../assets/profiles/${image}" alt="">` : ''}${row.manager}</span>
          <span role="cell">$${row.price}</span>
        </div>`;
      }).join('')}
    </div>`;
  }
}

// ---- Section 3: Full Draft Board -----------------------------------------

function computePlayerAggregates(draftRecap, associations) {
  const byPlayer = {};
  draftRecap.forEach(row => {
    (byPlayer[row.playerPos] ??= []).push(row);
  });
  return Object.entries(byPlayer).map(([playerPos, entries]) => {
    const sortedByYear = entries.slice().sort((a, b) => Number(a.year) - Number(b.year));
    const mostRecent = sortedByYear.at(-1);
    const prices = entries.map(entry => entry.price);
    return {
      playerPos,
      player: entries[0].player,
      position: entries[0].position,
      avgPrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      association: associations[playerPos] ?? null,
      timesDrafted: entries.length,
      mostRecentYear: mostRecent.year,
      mostRecentManager: mostRecent.manager,
      mostRecentPrice: mostRecent.price,
    };
  });
}

const draftTableColumns = [
  { key: 'player', label: 'Player' },
  { key: 'position', label: 'Pos' },
  { key: 'avgPrice', label: 'Avg. Value', format: value => `$${value.toFixed(1)}` },
  { key: 'maxPrice', label: 'Highest', format: value => `$${value}` },
  { key: 'minPrice', label: 'Lowest', format: value => `$${value}` },
  { key: 'association', label: 'Association', format: associationCellHtml },
  { key: 'timesDrafted', label: 'Times Drafted' },
  { key: 'mostRecentYear', label: 'Last Year' },
  { key: 'mostRecentManager', label: 'Last Manager' },
  { key: 'mostRecentPrice', label: 'Last Value', format: value => `$${value}` },
];
const DEFAULT_ASCENDING_KEYS = new Set(['player', 'position', 'association', 'mostRecentManager']);

function applyDraftFilters(rows, filters) {
  return rows.filter(row => {
    if (filters.position !== 'all' && row.position !== filters.position) return false;
    if (filters.year !== 'all' && row.mostRecentYear !== filters.year) return false;
    return true;
  });
}

function sortDraftRows(rows, key, dir) {
  return rows.slice().sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'association') { va = labelForAssociation(va); vb = labelForAssociation(vb); }
    if (typeof va === 'string') {
      const cmp = va.localeCompare(vb);
      return dir === 'asc' ? cmp : -cmp;
    }
    return dir === 'asc' ? va - vb : vb - va;
  });
}

function renderDraftTable(state, allRows, averageRows) {
  const filtered = applyDraftFilters(allRows, state.filters);
  const sorted = sortDraftRows(filtered, state.sortKey, state.sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / DRAFT_TABLE_PAGE_SIZE));
  state.page = Math.min(state.page, totalPages - 1);
  const pageRows = sorted.slice(state.page * DRAFT_TABLE_PAGE_SIZE, state.page * DRAFT_TABLE_PAGE_SIZE + DRAFT_TABLE_PAGE_SIZE);

  const theadHtml = `<tr>${draftTableColumns.map(col => {
    const isSorted = state.sortKey === col.key;
    const ariaSort = isSorted ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th data-key="${col.key}" aria-sort="${ariaSort}" tabindex="0" role="columnheader">${col.label}</th>`;
  }).join('')}</tr>`;

  const tbodyHtml = pageRows.map(row => `<tr>
    <td class="draft-player-cell" style="background:${playerGradient(averageRows.rows[row.playerPos])}">${row.player}</td>
    <td>${positionBadge(row.position)}</td>
    ${draftTableColumns.slice(2).map(col => `<td>${col.format ? col.format(row[col.key]) : row[col.key]}</td>`).join('')}
  </tr>`).join('');

  return { theadHtml, tbodyHtml, totalPages, totalRows: sorted.length };
}

// ---- Wire everything up ---------------------------------------------------

function renderColorKey(keyEl, managers) {
  keyEl.innerHTML = managers.map(manager => {
    const color = managerColors[manager] ?? '#94a3b8';
    return `<span class="member-legend-item"><span class="member-swatch" style="--swatch-color:${color}"></span>${manager}</span>`;
  }).join('');
}

function initDraftRoom() {
  const root = document.querySelector('.draft-room');
  if (!root) return;

  const colorKeyEl = document.getElementById('draft-color-key');
  const guysTitleEl = document.getElementById('draft-guys-title');
  const guysButtonsEl = document.getElementById('draft-guys-buttons');
  const guysListEl = document.getElementById('draft-guys-list');
  const playerSelectEl = document.getElementById('draft-player-select');
  const chartTitleEl = document.getElementById('draft-chart-title');
  const chartEl = document.getElementById('draft-value-chart');
  const historyTableEl = document.getElementById('draft-history-table');
  const positionFilterEl = document.getElementById('draft-position-filter');
  const yearFilterEl = document.getElementById('draft-year-filter');
  const tableHeadEl = document.getElementById('draft-table-head');
  const tableBodyEl = document.getElementById('draft-table-body');
  const paginationEl = document.getElementById('draft-pagination');
  const rowCountEl = document.getElementById('draft-row-count');

  Promise.all([
    loadPivotCSV('../assets/data/manager-player-draft-pct.csv'),
    loadPivotCSV('../assets/data/manager-player-spend-pct.csv'),
    loadPivotCSV('../assets/data/manager-player-spend-pct-per-manager.csv'),
    loadDraftRecap('../assets/data/draft-recap.csv'),
  ])
    .then(([draftPct, spendPct, spendPerManager, draftRecap]) => {
      const averageRows = computeAverageRows(draftPct, spendPct);
      const associations = computeAssociations(averageRows);
      const managers = draftPct.managers;
      const allYears = Array.from(new Set(draftRecap.map(row => row.year))).sort();

      if (colorKeyEl) renderColorKey(colorKeyEl, managers);

      // --- Section 1: Manager's Guys ---
      function selectManager(manager) {
        guysButtonsEl.querySelectorAll('.member-button').forEach(button => {
          const isActive = button.dataset.name === manager;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-pressed', String(isActive));
        });
        if (guysTitleEl) guysTitleEl.textContent = `${manager}'s Guys`;
        renderGuysList(guysListEl, manager, associations, spendPerManager, averageRows);
      }

      guysButtonsEl.innerHTML = managers.map(manager => {
        const color = managerColors[manager] ?? '#94a3b8';
        return `<button type="button" class="member-button" data-name="${manager}" aria-pressed="false" style="--member-color:${color}">${manager}</button>`;
      }).join('');
      guysButtonsEl.addEventListener('click', event => {
        const button = event.target.closest('.member-button');
        if (!button) return;
        selectManager(button.dataset.name);
      });
      guysListEl.addEventListener('click', event => {
        const tile = event.target.closest('.player-tile-swatch');
        if (!tile) return;
        playerSelectEl.value = tile.dataset.player;
        updateChart();
        document.getElementById('draft-value-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      // --- Section 2: Draft Value Over Time ---
      populatePlayerDropdown(playerSelectEl, allYears, draftRecap);

      function updateChart() {
        renderPlayerChart({
          chartEl,
          tableEl: historyTableEl,
          titleEl: chartTitleEl,
          playerPos: playerSelectEl.value,
          draftRecap,
          associations,
          allYears,
        });
      }
      playerSelectEl.addEventListener('change', updateChart);

      selectManager(managers[0]);
      const defaultGuys = topGuysForManager(managers[0], associations, spendPerManager);
      if (defaultGuys.length && playerSelectEl.querySelector(`option[value="${CSS.escape(defaultGuys[0].player)}"]`)) {
        playerSelectEl.value = defaultGuys[0].player;
      }
      updateChart();

      // --- Section 3: Full Draft Board ---
      const allRows = computePlayerAggregates(draftRecap, associations);
      const positions = Array.from(new Set(draftRecap.map(row => row.position))).sort();
      positionFilterEl.innerHTML = '<option value="all">All positions</option>' + positions.map(position => `<option value="${position}">${position}</option>`).join('');
      yearFilterEl.innerHTML = '<option value="all">All years</option>' + allYears.map(year => `<option value="${year}">${year}</option>`).join('');

      const state = { filters: { position: 'all', year: 'all' }, sortKey: 'avgPrice', sortDir: 'desc', page: 0 };

      function renderTable() {
        const { theadHtml, tbodyHtml, totalPages, totalRows } = renderDraftTable(state, allRows, averageRows);
        tableHeadEl.innerHTML = theadHtml;
        tableBodyEl.innerHTML = tbodyHtml;
        paginationEl.innerHTML = `
          <button type="button" data-page="prev" ${state.page === 0 ? 'disabled' : ''}>&larr; Prev</button>
          <span>Page ${state.page + 1} of ${totalPages}</span>
          <button type="button" data-page="next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Next &rarr;</button>`;
        if (rowCountEl) rowCountEl.textContent = `${totalRows} player${totalRows === 1 ? '' : 's'}, ${DRAFT_TABLE_PAGE_SIZE} shown per page.`;
      }

      tableHeadEl.addEventListener('click', event => {
        const th = event.target.closest('th');
        if (!th) return;
        const key = th.dataset.key;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = DEFAULT_ASCENDING_KEYS.has(key) ? 'asc' : 'desc';
        }
        state.page = 0;
        renderTable();
      });
      tableHeadEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const th = event.target.closest('th');
        if (!th) return;
        event.preventDefault();
        th.click();
      });
      positionFilterEl.addEventListener('change', () => {
        state.filters.position = positionFilterEl.value;
        state.page = 0;
        renderTable();
      });
      yearFilterEl.addEventListener('change', () => {
        state.filters.year = yearFilterEl.value;
        state.page = 0;
        renderTable();
      });
      paginationEl.addEventListener('click', event => {
        const button = event.target.closest('button[data-page]');
        if (!button) return;
        state.page += button.dataset.page === 'prev' ? -1 : 1;
        renderTable();
      });

      renderTable();
    })
    .catch(error => {
      console.error(error);
      root.querySelectorAll('[aria-live]').forEach(el => { el.innerHTML = '<p>Unable to load draft data.</p>'; });
    });
}

initDraftRoom();
