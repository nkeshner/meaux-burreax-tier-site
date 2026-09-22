// ESPN Power Rankings page. Loaded after assets/site.js (see
// pages/power-rankings.html) and reuses that file's `managerColors`,
// `profileImages`, and `smoothPath`. Classic <script> tags share one
// top-level scope, so those are already in scope here. This page does NOT
// reuse `renderRankingChart` — the two-metric toggle, percentage axis, and
// gap-filling below don't fit that function's shape, so this file has its
// own chart and average-table renderers.
//
// Data: assets/data/espn-weekly-rankings.csv, a "long" CSV with one row per
// manager per week: year,week,manager,rank,playoff_odds (playoff_odds is a
// fraction 0-1, or blank). Add new rows to that file and this page picks
// them up automatically: a new week extends the chart to the right, and a
// new year adds a new chart block (newest year first).

async function loadWeeklyRankings(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/).filter(line => line.length > 0);
  const header = lines[0].split(',').map(cell => cell.trim());
  const column = name => header.indexOf(name);
  const yearCol = column('year'), weekCol = column('week'), managerCol = column('manager'),
    rankCol = column('rank'), oddsCol = column('playoff_odds');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const rankRaw = (cells[rankCol] ?? '').trim();
    const oddsRaw = oddsCol === -1 ? '' : (cells[oddsCol] ?? '').trim();
    return {
      year: cells[yearCol].trim(),
      week: Number(cells[weekCol].trim()),
      manager: cells[managerCol].trim(),
      rank: rankRaw === '' ? null : Number(rankRaw),
      // Stored as a percentage (0-100) from here on, since that's how both
      // the chart and the average table display it.
      playoffOdds: oddsRaw === '' ? null : Number(oddsRaw) * 100,
    };
  });
}

// Builds one entry per week in `weeks` for a single manager/metric: the
// metric's value at that week if a row exists for it ("real": true, drawn
// as a dot), or the last real value carried forward flat if not
// ("real": false, included in the line but not drawn as a dot). This is
// what keeps a week with no data (or, like week 7 above, a row with an
// odds value but a blank rank) from reading as "everyone is rank 1", and
// what lets a gap between weeks (e.g. week 8 to week 14) draw as a flat
// continuation instead of a compressed jump.
function buildCarriedSeries(weeks, rowsByWeek, key) {
  let last = null;
  return weeks.map(week => {
    const raw = rowsByWeek.get(week)?.[key] ?? null;
    if (raw != null) {
      last = raw;
      return { value: raw, real: true };
    }
    return { value: last, real: false };
  });
}

// Turns the long rows into one entry per year, newest year first. `weeks`
// is every integer from that year's earliest to latest week in the data
// (not just the weeks that happen to have rows), so a gap in the data
// still gets an x-axis position and a flat carried-forward line rather
// than being skipped. Each entry's `rankingData` has one { name, rank,
// odds } per manager, where `rank` and `odds` are carried series aligned
// to `weeks` (see buildCarriedSeries).
function buildYearData(rows) {
  const byYear = {};
  rows.forEach(row => { (byYear[row.year] ??= []).push(row); });
  return Object.entries(byYear)
    .map(([year, yearRows]) => {
      const weekNumbers = yearRows.map(row => row.week);
      const minWeek = Math.min(...weekNumbers), maxWeek = Math.max(...weekNumbers);
      const weeks = Array.from({ length: maxWeek - minWeek + 1 }, (_, index) => minWeek + index);
      const managers = Array.from(new Set(yearRows.map(row => row.manager)));
      const rankingData = managers.map(name => {
        const rowsByWeek = new Map(yearRows.filter(row => row.manager === name).map(row => [row.week, row]));
        return {
          name,
          rank: buildCarriedSeries(weeks, rowsByWeek, 'rank'),
          odds: buildCarriedSeries(weeks, rowsByWeek, 'playoffOdds'),
        };
      });
      return { year, weeks, rankingData };
    })
    .sort((a, b) => Number(b.year) - Number(a.year));
}

function weekRangeLabel(weeks) {
  const first = weeks[0], last = weeks.at(-1);
  return first === last ? `Week ${first}` : `Weeks ${first}\u2013${last}`;
}

// Average table for the currently selected metric. Averages only "real"
// (actually recorded) values for each manager — carried-forward filler
// weeks aren't counted, so a long gap doesn't drag or pad anyone's average.
// Ranking sorts ascending (1 is best); Playoff Odds sorts descending
// (100% is best).
function renderPowerAverageTable(averageEl, rankingData, mode) {
  const isRankMode = mode === 'rank';
  const standings = rankingData
    .map(({ name, rank, odds }) => {
      const known = (isRankMode ? rank : odds).filter(entry => entry.real).map(entry => entry.value);
      const average = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
      return { name, average };
    })
    .filter(entry => entry.average != null)
    .sort((a, b) => (isRankMode ? a.average - b.average : b.average - a.average) || a.name.localeCompare(b.name));

  const formatValue = isRankMode ? value => value.toFixed(2) : value => `${value.toFixed(1)}%`;
  const valueLabel = isRankMode ? 'Avg.' : 'Avg. Odds';

  averageEl.innerHTML = `<div class="standings-table" role="table" aria-label="Average ${isRankMode ? 'placement' : 'playoff odds'} standings"><div class="standings-head" role="row"><span role="columnheader">#</span><span role="columnheader">Member</span><span role="columnheader">${valueLabel}</span></div>${standings.map(({ name, average }, index) => `<div class="standing-row standing-${index + 1}" role="row"><span class="standing-number" role="cell">${index + 1}</span><strong role="rowheader">${name}</strong><span role="cell">${formatValue(average)}</span></div>`).join('')}</div>`;
}

// Draws one year's chart for the given `mode` ('rank' or 'odds') and its
// paired average table. Rank mode keeps the original 1..N axis (no tick
// labels, just gridlines — a manager's own line + name is the reference).
// Odds mode uses a fixed 0-100% axis with tick labels, since unlike rank
// there's no fixed count of positions to imply gridlines from.
function renderPowerChart({ chartEl, averageEl, weeks, rankingData, mode, title, description, assetPrefix = '../assets/' }) {
  const isRankMode = mode === 'rank';
  const rankCount = rankingData.length;
  const width = 820, height = 470, left = 180, right = 110, top = 68, bottom = 58;
  const plotRight = width - right;
  const x = index => weeks.length > 1 ? left + index * ((plotRight - left) / (weeks.length - 1)) : left;
  const y = isRankMode
    ? value => top + (value - 1) * ((height - top - bottom) / (rankCount - 1 || 1))
    : value => top + (100 - value) * ((height - top - bottom) / 100);

  const gridValues = isRankMode ? Array.from({ length: rankCount }, (_, index) => index + 1) : [0, 25, 50, 75, 100];
  const grid = gridValues.map(value => `<line class="chart-grid" x1="${left}" x2="${plotRight}" y1="${y(value)}" y2="${y(value)}"/>${isRankMode ? '' : `<text class="chart-axis-text" x="${left - 14}" y="${y(value) + 5}" text-anchor="end">${value}%</text>`}`).join('');
  const xLabels = weeks.map((week, index) => `<text class="chart-axis-text" x="${x(index)}" y="${height - 28}" text-anchor="middle">${week}</text>`).join('');

  const lines = rankingData.map(manager => {
    const color = managerColors[manager.name] ?? '#475569';
    const series = isRankMode ? manager.rank : manager.odds;
    const points = series
      .map((entry, index) => (entry.value == null ? null : { x: x(index), y: y(entry.value), real: entry.real }))
      .filter(Boolean);

    if (points.length === 0) return '';

    const path = points.length > 1 ? smoothPath(points) : '';
    // Only real (recorded) weeks get a dot; carried-forward weeks still
    // shape the line but aren't marked as a data point.
    const circles = points.filter(point => point.real).map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" style="stroke:${color}"></circle>`).join('');
    const start = points[0];
    const end = points.at(-1);
    const avatarX = plotRight + 18;
    const avatarSize = 76;
    const avatarId = `avatar-${chartEl.id}-${mode}-${manager.name.toLowerCase()}`;
    const avatarCenter = avatarX + avatarSize / 2;
    const knownValues = series
      .filter(entry => entry.real)
      .map(entry => (isRankMode ? entry.value : `${entry.value.toFixed(0)}%`))
      .join(', ');

    return `<g class="chart-series" data-manager="${manager.name}" tabindex="0" role="group" aria-label="${manager.name}: ${isRankMode ? 'ranks' : 'playoff odds'} ${knownValues}"><defs><clipPath id="${avatarId}"><circle cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2}"></circle></clipPath></defs>${path ? `<path class="chart-line" d="${path}" style="stroke:${color}"></path><path class="chart-hit" d="${path}"></path>` : ''}${circles}<text class="chart-name" x="${left - 18}" y="${start.y}" text-anchor="end" dominant-baseline="middle" style="fill:${color}">${manager.name}</text><circle class="chart-avatar-shell" cx="${avatarCenter}" cy="${end.y}" r="${avatarSize / 2 + 3}" style="stroke:${color}"></circle><image class="chart-avatar" href="${assetPrefix}profiles/${profileImages[manager.name]}" x="${avatarX}" y="${end.y - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avatarId})"></image></g>`;
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${chartEl.id}-title ${chartEl.id}-description"><title id="${chartEl.id}-title">${title}</title><desc id="${chartEl.id}-description">${description}</desc>${grid}${xLabels}<text class="chart-axis-title" x="${(left + plotRight) / 2}" y="${height - 6}" text-anchor="middle">Week</text><text class="chart-axis-title" transform="translate(22 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">${isRankMode ? 'Rank' : 'Playoff Odds'}</text>${lines}</svg>`;

  chartEl.querySelectorAll('.chart-series').forEach(series => {
    const setHighlight = active => series.classList.toggle('is-highlighted', active);
    series.addEventListener('pointerenter', () => setHighlight(true));
    series.addEventListener('pointerleave', () => setHighlight(false));
    series.addEventListener('focus', () => setHighlight(true));
    series.addEventListener('blur', () => setHighlight(false));
  });

  if (averageEl) {
    renderPowerAverageTable(averageEl, rankingData, mode);
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

function initPowerRankings() {
  const stackEl = document.getElementById('power-stack');
  const modeButtonsEl = document.getElementById('power-mode-buttons');
  if (!stackEl) return;

  loadWeeklyRankings(stackEl.dataset.src)
    .then(rows => {
      const yearData = buildYearData(rows);
      let mode = 'rank';

      stackEl.innerHTML = yearData.map(({ year, weeks }) => `
        <div class="chart-block">
          <div class="chart-block__head">
            <h2 class="chart-title" id="power-title-${year}">${year}</h2>
            <p class="chart-subtitle">ESPN power rankings by week &middot; ${weekRangeLabel(weeks)}</p>
          </div>
          <div class="ranking-layout">
            <div id="power-chart-${year}" class="ranking-chart" aria-live="polite" aria-labelledby="power-title-${year}"></div>
            <section class="ranking-average" aria-labelledby="power-average-title-${year}">
              <h3 id="power-average-title-${year}">Average placement</h3>
              <div id="power-average-table-${year}"></div>
            </section>
          </div>
        </div>`).join('');

      function renderAll() {
        yearData.forEach(({ year, weeks, rankingData }) => {
          renderPowerChart({
            chartEl: document.getElementById(`power-chart-${year}`),
            averageEl: document.getElementById(`power-average-table-${year}`),
            weeks,
            rankingData,
            mode,
            title: mode === 'rank'
              ? `${year} ESPN power rankings by week`
              : `${year} ESPN-estimated playoff odds by week`,
            description: mode === 'rank'
              ? `Line chart showing each manager's ESPN power ranking, where 1 is the highest position, for each week of the ${year} season.`
              : `Line chart showing each manager's ESPN-estimated playoff odds, as a percentage, for each week of the ${year} season.`,
          });
          const headingEl = document.getElementById(`power-average-title-${year}`);
          if (headingEl) headingEl.textContent = mode === 'rank' ? 'Average placement' : 'Average playoff odds';
        });
      }

      renderAll();

      if (modeButtonsEl) {
        modeButtonsEl.addEventListener('click', event => {
          const button = event.target.closest('button[data-mode]');
          if (!button || button.dataset.mode === mode) return;
          mode = button.dataset.mode;
          modeButtonsEl.querySelectorAll('button[data-mode]').forEach(candidate => {
            const active = candidate === button;
            candidate.classList.toggle('is-active', active);
            candidate.setAttribute('aria-pressed', String(active));
          });
          renderAll();
        });
      }
    })
    .catch(error => {
      console.error(error);
      stackEl.innerHTML = '<p>Unable to load power rankings data.</p>';
    });
}

initPowerRankings();
