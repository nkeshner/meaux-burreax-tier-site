// ESPN Power Rankings page. Loaded after assets/site.js (see
// pages/power-rankings.html) and reuses that file's `renderRankingChart`,
// which draws the same line chart + "Average placement" table used on the
// homepage. Classic <script> tags share one top-level scope, so that
// function is already in scope here.
//
// Data: assets/data/espn-weekly-rankings.csv, a "long" CSV with one row per
// manager per week:  year,week,manager,rank
// Add new rows to that file and this page picks them up automatically: a new
// week extends the chart to the right, and a new year adds a new chart block
// (newest year first).

async function loadWeeklyRankings(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load ${src}: ${response.status}`);
  const lines = (await response.text()).trim().split(/\r?\n/).filter(line => line.length > 0);
  return lines.slice(1).map(line => {
    const [year, week, manager, rank] = line.split(',').map(cell => cell.trim());
    return { year, week: Number(week), manager, rank: Number(rank) };
  });
}

// Turns the long rows into one entry per year, newest year first. Each entry
// has the sorted list of weeks plus one { name, ranks } series per manager,
// with ranks aligned to `weeks` (null if a manager has no rank for a week),
// which is the shape renderRankingChart expects.
function buildYearData(rows) {
  const byYear = {};
  rows.forEach(row => { (byYear[row.year] ??= []).push(row); });
  return Object.entries(byYear)
    .map(([year, yearRows]) => {
      const weeks = Array.from(new Set(yearRows.map(row => row.week))).sort((a, b) => a - b);
      const managers = Array.from(new Set(yearRows.map(row => row.manager)));
      const rankingData = managers.map(name => ({
        name,
        ranks: weeks.map(week => {
          const match = yearRows.find(row => row.manager === name && row.week === week);
          return match ? match.rank : null;
        }),
      }));
      return { year, weeks, rankingData };
    })
    .sort((a, b) => Number(b.year) - Number(a.year));
}

function weekRangeLabel(weeks) {
  const first = weeks[0], last = weeks.at(-1);
  return first === last ? `Week ${first}` : `Weeks ${first}\u2013${last}`;
}

function initPowerRankings() {
  const stackEl = document.getElementById('power-stack');
  if (!stackEl) return;

  loadWeeklyRankings(stackEl.dataset.src)
    .then(rows => {
      const yearData = buildYearData(rows);

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

      yearData.forEach(({ year, weeks, rankingData }) => {
        renderRankingChart({
          chartEl: document.getElementById(`power-chart-${year}`),
          averageEl: document.getElementById(`power-average-table-${year}`),
          years: weeks.map(String), // x-axis labels: the week numbers
          rankingData,
          title: `${year} ESPN power rankings by week`,
          description: `Line chart showing each manager's ESPN power ranking, where 1 is the highest position, for each week of the ${year} season.`,
          xTitle: 'Week',
          assetPrefix: '../assets/',
        });
      });
    })
    .catch(error => {
      console.error(error);
      stackEl.innerHTML = '<p>Unable to load power rankings data.</p>';
    });
}

initPowerRankings();
