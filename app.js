/* ==========================================
   StatGambler — app.js
   ESPN Public API Player Analytics
   with Candlestick Chart Visualizations
   ========================================== */

// ─── ESPN API Endpoints ─────────────────
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports';
const ESPN_SITE = 'https://site.web.api.espn.com/apis/common/v3/sports';

const SPORT_CONFIG = {
  basketball: {
    league: 'nba',
    statLabels: ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%', 'MIN'],
    statKeys: ['points', 'totalRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fieldGoalPct', 'threePointPct', 'freeThrowPct', 'minutes'],
    primaryStats: ['PTS', 'REB', 'AST', 'BLK'],
    chartStats: ['PTS', 'REB', 'AST', 'STL'],
    season: 2026,
  },
  football: {
    league: 'nfl',
    statLabels: ['YDS', 'TD', 'INT', 'CMP', 'ATT', 'RTG', 'RYDS', 'RTD'],
    statKeys: ['passingYards', 'passingTouchdowns', 'interceptions', 'completions', 'passingAttempts', 'QBRating', 'rushingYards', 'rushingTouchdowns'],
    primaryStats: ['YDS', 'TD', 'INT', 'RTG'],
    chartStats: ['YDS', 'TD', 'CMP', 'RTG'],
    season: 2025,
  },
  baseball: {
    league: 'mlb',
    statLabels: ['H', 'HR', 'RBI', 'R', 'BB', 'SO', 'AVG', 'OBP', 'SLG', 'AB'],
    statKeys: ['hits', 'homeRuns', 'RBIs', 'runs', 'walks', 'strikeouts', 'avg', 'OBP', 'sluggingPct', 'atBats'],
    primaryStats: ['H', 'HR', 'RBI', 'AVG'],
    chartStats: ['H', 'HR', 'RBI', 'R'],
    season: 2024,
  }
};

const POPULAR_PROPS = {
  basketball: [
    { stat: 'PTS', val: 25, label: '25+ Points' },
    { stat: 'PTS', val: 20, label: '20+ Points' },
    { stat: 'REB', val: 8, label: '8+ Rebounds' },
    { stat: 'REB', val: 6, label: '6+ Rebounds' },
    { stat: 'AST', val: 8, label: '8+ Assists' },
    { stat: 'AST', val: 6, label: '6+ Assists' }
  ],
  football: [
    { stat: 'YDS', val: 250, label: '250+ Pass Yds' },
    { stat: 'YDS', val: 200, label: '200+ Pass Yds' },
    { stat: 'TD', val: 2, label: '2+ Pass TDs' },
    { stat: 'RYDS', val: 50, label: '50+ Rush Yds' },
  ],
  baseball: [
    { stat: 'H', val: 1, label: '1+ Hits' },
    { stat: 'H', val: 2, label: '2+ Hits' },
    { stat: 'HR', val: 1, label: '1+ Home Runs' },
    { stat: 'R', val: 1, label: '1+ Runs' }
  ]
};

// ─── State ──────────────────────────────
const state = {
  sport: 'basketball',
  player: null,
  playerTeamId: null,
  gamelog: [],       // array of { eventData, stats[] }
  opponents: [],     // unique opponents from gamelog
  selectedOpponent: null,
  customThresholds: {}, // statLabel -> custom number
};

// ─── DOM Refs ───────────────────────────
const dom = {
  searchInput: document.getElementById('player-search'),
  searchBtn: document.getElementById('search-btn'),
  dropdown: document.getElementById('player-dropdown'),
  playerCard: document.getElementById('player-card'),
  playerHeadshot: document.getElementById('player-headshot'),
  playerName: document.getElementById('player-name'),
  playerMeta: document.getElementById('player-meta'),
  clearPlayer: document.getElementById('clear-player'),
  opponentSection: document.getElementById('opponent-section'),
  opponentGrid: document.getElementById('opponent-grid'),
  selectedOpponent: document.getElementById('selected-opponent'),
  oppLogoWrap: document.getElementById('opp-logo-wrap'),
  oppNameText: document.getElementById('opp-name-text'),
  clearOpponent: document.getElementById('clear-opponent'),
  intro: document.getElementById('intro-section'),
  loading: document.getElementById('loading-overlay'),
  results: document.getElementById('results-section'),
  averagesBar: document.getElementById('averages-bar'),
  chartsContainer: document.getElementById('charts-container'),
  gamelogTable: document.getElementById('gamelog-table'),
  errorToast: document.getElementById('error-toast'),
  teamDropdown: document.getElementById('team-dropdown'),
  rosterContainer: document.getElementById('roster-container'),
  rosterSection: document.getElementById('roster-section'),
};

// ─── Utilities ──────────────────────────
function debounce(fn, delay) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
}
function showError(msg) {
  dom.errorToast.textContent = '⚠ ' + msg;
  dom.errorToast.classList.add('visible');
  setTimeout(() => dom.errorToast.classList.remove('visible'), 4000);
}
function showLoading(show) {
  dom.loading.classList.toggle('active', show);
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

// ─── ESPN API: Search Players ───────────
async function searchPlayers(query) {
  const cfg = SPORT_CONFIG[state.sport];
  const url = `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(query)}&limit=10&type=player&sport=${state.sport}&league=${cfg.league}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    // ESPN search returns data.items[] directly
    if (data.items && data.items.length > 0) {
      return data.items.filter(a => a.type === 'player').map(a => {
        // Extract team info from teamRelationships
        const teamRel = a.teamRelationships?.[0]?.core || {};
        const teamName = teamRel.displayName || a.label?.split(' - ')[1] || '';
        return {
          id: a.id,
          name: a.displayName,
          headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/${cfg.league}/players/full/${a.id}.png`,
          position: a.jersey ? `#${a.jersey}` : '',
          team: teamName,
          teamId: teamRel.id,
          uid: a.uid,
        };
      });
    }
    return [];
  } catch (e) {
    console.error('Search failed:', e);
    return [];
  }
}

// ─── ESPN API: Get Player Details ───────
async function getPlayerDetails(playerId) {
  const cfg = SPORT_CONFIG[state.sport];
  const url = `${ESPN_CORE}/${state.sport}/leagues/${cfg.league}/athletes/${playerId}?lang=en&region=us`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Player details failed:', e);
    return null;
  }
}

// ─── ESPN API: Get Gamelog ───────────────
async function getGamelog(playerId, fetchOpponentId = null) {
  const cfg = SPORT_CONFIG[state.sport];
  let allData = null;
  let gamesVsOpp = 0;

  // We loop backward up to 5 years if needed to hit the 5-game minimum
  for (let i = 0; i < 6; i++) {
    const s = cfg.season - i;
    const url = `${ESPN_SITE}/${state.sport}/${cfg.league}/athletes/${playerId}/gamelog?season=${s}&seasontype=2`;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!allData) {
        allData = data;
      } else if (data && data.events) {
        // Merge the event dictionary
        allData.events = { ...allData.events, ...data.events };
        // Cleanly append the new year's season categories
        if (data.seasonTypes) {
          allData.seasonTypes.push(...data.seasonTypes);
        }
      }

      // Count how many opponent games we've amassed
      if (fetchOpponentId && data && data.events) {
        Object.values(data.events).forEach(ev => {
          if (ev.opponent && String(ev.opponent.id) === String(fetchOpponentId)) {
            gamesVsOpp++;
          }
        });
      }

      // Stop fetching older years if we aren't filtering, or we have enough games
      if (!fetchOpponentId || gamesVsOpp >= 5) {
        break;
      }
    } catch (e) {
      console.error(`Gamelog failed for season ${s}:`, e);
    }
  }

  return allData;
}

// ─── ESPN API: Get Teams ─────────────────
async function getTeams() {
  const cfg = SPORT_CONFIG[state.sport];
  // Using core v2 API for general team list
  const url = `https://site.api.espn.com/apis/site/v2/sports/${state.sport}/${cfg.league}/teams`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    // Some ESPN APIs return teams inside sports[0].leagues[0].teams
    let teams = [];
    if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0] && data.sports[0].leagues[0].teams) {
      teams = data.sports[0].leagues[0].teams.map(t => t.team);
    } else if (data.teams) {
      teams = data.teams.map(t => t.team);
    }
    return teams;
  } catch (e) {
    console.error('Get teams failed:', e);
    return [];
  }
}

// ─── ESPN API: Get Team Roster ───────────
async function getTeamRoster(teamId) {
  const cfg = SPORT_CONFIG[state.sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${state.sport}/${cfg.league}/teams/${teamId}/roster`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.athletes) {
      return data.athletes;
    }
    return [];
  } catch (e) {
    console.error('Get roster failed:', e);
    return [];
  }
}

// ─── Parse Gamelog into usable format ────
function parseGamelog(rawGamelog) {
  if (!rawGamelog || !rawGamelog.events || !rawGamelog.seasonTypes) return [];

  const labels = rawGamelog.labels || [];
  const names = rawGamelog.names || [];
  const events = rawGamelog.events;

  // Get all categories (groups of events by month/week)
  const categories = [];
  for (const st of rawGamelog.seasonTypes) {
    if (st.categories) {
      for (const cat of st.categories) {
        if (cat.events) categories.push(cat);
      }
    }
  }

  const games = [];

  for (const cat of categories) {
    for (const evt of cat.events) {
      const eventId = evt.eventId;
      const eventData = events[eventId];
      if (!eventData) continue;

      const statsArr = evt.stats || [];

      // Build a stat object keyed by label
      const statObj = {};
      labels.forEach((label, i) => {
        statObj[label] = statsArr[i] || '0';
      });

      games.push({
        eventId,
        date: eventData.gameDate,
        opponent: eventData.opponent,
        atVs: eventData.atVs,
        score: eventData.score,
        result: eventData.gameResult,
        team: eventData.team,
        stats: statObj,
        rawStats: statsArr,
        eventNote: eventData.eventNote || '',
      });
    }
  }

  // Sort newest first
  games.sort((a, b) => new Date(b.date) - new Date(a.date));
  return games;
}

// ─── Extract unique opponents from gamelog ─
function extractOpponents(games) {
  const seen = new Map();
  games.forEach(g => {
    if (g.opponent && !seen.has(g.opponent.id)) {
      seen.set(g.opponent.id, {
        id: g.opponent.id,
        name: g.opponent.displayName,
        abbreviation: g.opponent.abbreviation,
        logo: g.opponent.logo,
      });
    }
  });
  return [...seen.values()];
}

// ─── Filter games by opponent ───────────
function getFilteredAndSlicedGames() {
  let games = state.gamelog;

  // If an opponent is selected, find all historical games vs that opponent 
  // (which already includes last year's data) and show exactly the last 5.
  if (state.selectedOpponent) {
    const oppGames = state.gamelog.filter(g => g.opponent && String(g.opponent.id) === String(state.selectedOpponent.id));
    return oppGames.slice(0, 5);
  }

  // Otherwise, respect the Game Count dropdown for the player's general recent games
  const dropdown = document.getElementById('game-count-dropdown');
  const limit = dropdown ? parseInt(dropdown.value, 10) : 20;
  return games.slice(0, limit);
}

// ─── Compute averages ──────────────────
function computeAverages(games) {
  const cfg = SPORT_CONFIG[state.sport];
  const avgs = {};
  if (!games.length) return avgs;

  cfg.primaryStats.forEach(label => {
    const values = games.map(g => {
      const v = g.stats[label];
      if (v === undefined || v === '-') return null;
      // Handle percentage strings like ".485"
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    }).filter(v => v !== null);

    if (values.length) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      avgs[label] = avg;
    } else {
      avgs[label] = 0;
    }
  });

  return avgs;
}

// ─── Render Averages Bar ────────────────
function renderAveragesBar(games) {
  const avgs = computeAverages(games);
  const cfg = SPORT_CONFIG[state.sport];
  const allAvgs = computeAverages(state.gamelog);
  const filtered = state.selectedOpponent;

  let html = '';
  cfg.primaryStats.forEach(label => {
    const val = avgs[label] || 0;
    const isPct = label.includes('%') || label === 'AVG' || label === 'OBP' || label === 'SLG' || label === 'RTG';
    const display = isPct ? val.toFixed(1) : val.toFixed(1);

    // Compare with overall average if filtering
    let arrow = '';
    if (filtered && allAvgs[label] !== undefined) {
      const diff = val - allAvgs[label];
      if (Math.abs(diff) > 0.1) {
        arrow = diff > 0
          ? `<span style="color:var(--accent-green);font-size:10px;margin-left:4px">▲</span>`
          : `<span style="color:var(--accent-red);font-size:10px;margin-left:4px">▼</span>`;
      }
    }

    html += `
      <div class="avg-card">
        <div class="avg-value">${display}${arrow}</div>
        <div class="avg-label">${label}</div>
      </div>
    `;
  });

  // Add Games count
  html += `
    <div class="avg-card">
      <div class="avg-value" style="color:var(--accent-blue)">${games.length}</div>
      <div class="avg-label">Games</div>
    </div>
  `;

  // Add W-L record
  const wins = games.filter(g => g.result === 'W').length;
  const losses = games.filter(g => g.result === 'L').length;
  html += `
    <div class="avg-card">
      <div class="avg-value"><span style="color:var(--accent-green)">${wins}</span>-<span style="color:var(--accent-red)">${losses}</span></div>
      <div class="avg-label">Record</div>
    </div>
  `;

  dom.averagesBar.innerHTML = html;
}

// ─── Render Candlestick Charts ──────────
function renderCandleCharts(games) {
  const cfg = SPORT_CONFIG[state.sport];
  const chartGames = [...games].reverse(); // oldest→newest

  if (!chartGames.length) {
    dom.chartsContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">No games to chart.</p>';
    return;
  }

  let html = '';

  cfg.chartStats.forEach(statLabel => {
    // Get values
    const values = chartGames.map(g => {
      const v = g.stats[statLabel];
      if (v === undefined || v === '-') return 0;
      return parseFloat(v) || 0;
    });

    const calculatedAvg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

    // Check if the user has defined a custom threshold
    const hasCustom = state.customThresholds[statLabel] !== undefined;
    const avg = hasCustom ? state.customThresholds[statLabel] : calculatedAvg;

    const max = Math.max(...values, avg * 1.3, 1);
    const chartHeight = 140; // px

    // Build candles
    const candles = chartGames.map((g, i) => {
      const val = values[i];
      const barH = Math.max((val / max) * chartHeight, 4);
      const isAbove = val >= avg;
      const cls = val === 0 ? 'neutral' : (isAbove ? 'above-avg' : 'below-avg');
      const oppAbbr = g.opponent ? g.opponent.abbreviation : '?';
      const dateStr = formatDate(g.date);
      const labelText = state.selectedOpponent ? formatDateShort(g.date) : oppAbbr;

      return `
        <div class="candle-col">
          <div class="candle-tooltip">${val} ${statLabel} vs ${oppAbbr}<br>${dateStr} · ${g.result || '?'}</div>
          <div class="candle-bar ${cls}" style="height:${barH}px">
            <span class="candle-value">${val}</span>
          </div>
          <div class="candle-label">${labelText}</div>
        </div>
      `;
    }).join('');

    // Average line position
    // If the average is higher than max (unlikely unless custom is huge), clamp it so it doesn't break the UI
    const avgLineH = Math.min((avg / max) * chartHeight, chartHeight + 20);
    const avgDisplay = avg % 1 === 0 ? avg.toString() : avg.toFixed(1);

    const filterLabel = state.selectedOpponent ? `vs ${state.selectedOpponent.abbreviation}` : 'Season';

    html += `
      <div class="chart-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <h4>📊 ${statLabel}</h4>
          <div class="custom-threshold">
            <label for="thresh-${statLabel}">Line:</label>
            <input type="number" id="thresh-${statLabel}" data-stat="${statLabel}" value="${avgDisplay}" step="0.5" />
          </div>
        </div>
        <div class="chart-subtitle">${filterLabel} · ${chartGames.length} games</div>
        <div class="candle-chart" style="height:${chartHeight + 22}px">
          <div class="avg-line" style="bottom:${avgLineH + 22}px">
            <span class="avg-line-label">LINE ${avgDisplay}</span>
          </div>
          ${candles}
        </div>
      </div>
    `;
  });

  dom.chartsContainer.innerHTML = html;

  // Bind threshold inputs
  dom.chartsContainer.querySelectorAll('.custom-threshold input').forEach(input => {
    input.addEventListener('change', (e) => {
      const stat = e.target.dataset.stat;
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        state.customThresholds[stat] = val;
        renderCandleCharts(getFilteredAndSlicedGames()); // Just rerender the charts
      }
    });
  });
}

// ─── Render Game Log Table ──────────────
function renderGamelogTable(games) {
  const cfg = SPORT_CONFIG[state.sport];
  const cols = cfg.statLabels.slice(0, 8); // show first 8 stat columns

  const headerCells = cols.map(c => `<th>${c}</th>`).join('');

  const rows = games.map(g => {
    const resultClass = g.result === 'W' ? 'result-w' : 'result-l';
    const oppLogo = g.opponent?.logo || '';
    const oppName = g.opponent?.abbreviation || '?';

    const statCells = cols.map(label => {
      const v = g.stats[label] || '—';
      return `<td>${v}</td>`;
    }).join('');

    return `
      <tr>
        <td>${formatDate(g.date)}</td>
        <td>
          <div class="opp-cell">
            ${g.atVs || ''}
            ${oppLogo ? `<img src="${oppLogo}" alt="${oppName}" onerror="this.style.display='none'">` : ''}
            ${oppName}
          </div>
        </td>
        <td class="${resultClass}">${g.result || '?'}</td>
        <td>${g.score || '—'}</td>
        ${statCells}
      </tr>
    `;
  }).join('');

  dom.gamelogTable.innerHTML = `
    <h3>📋 Game Log</h3>
    <div style="overflow-x:auto">
      <table class="game-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opp</th>
            <th>W/L</th>
            <th>Score</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Render all results ─────────────────
function renderResults() {
  const games = getFilteredAndSlicedGames();

  // Toggle the Game Count Dropdown container's visibility
  const countContainer = document.getElementById('game-count-container');
  if (countContainer) {
    countContainer.style.display = state.selectedOpponent ? 'none' : 'block';
  }

  if (!games.length && state.selectedOpponent) {
    dom.averagesBar.innerHTML = `<div class="avg-card" style="grid-column:1/-1"><div class="avg-value" style="font-size:16px;color:var(--text-muted)">No games found vs ${state.selectedOpponent.name}</div></div>`;
    dom.chartsContainer.innerHTML = '';
    dom.gamelogTable.innerHTML = '';
    return;
  }

  renderAveragesBar(games);
  renderCandleCharts(games);
  renderGamelogTable(games);
}

// ─── Render opponent picker ─────────────
function renderOpponentPicker() {
  const opps = state.opponents;
  if (!opps.length) {
    dom.opponentSection.classList.add('hidden');
    return;
  }

  dom.opponentSection.classList.remove('hidden');

  dom.opponentGrid.innerHTML = opps.map(opp => {
    const active = state.selectedOpponent && state.selectedOpponent.id === opp.id ? 'active' : '';
    return `
      <button class="opp-btn ${active}" data-opp-id="${opp.id}">
        ${opp.logo ? `<img src="${opp.logo}" alt="${opp.abbreviation}" onerror="this.style.display='none'">` : ''}
        ${opp.abbreviation || opp.name}
      </button>
    `;
  }).join('');

  // Attach click handlers
  dom.opponentGrid.querySelectorAll('.opp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const oppId = btn.dataset.oppId;
      const opp = opps.find(o => o.id === oppId);
      if (opp) selectOpponent(opp);
    });
  });
}

// ─── Select opponent ────────────────────
async function selectOpponent(opp) {
  state.selectedOpponent = opp;

  // Update selected indicator
  dom.selectedOpponent.classList.remove('hidden');
  dom.oppLogoWrap.innerHTML = opp.logo ? `<img src="${opp.logo}" alt="${opp.abbreviation}">` : '';
  dom.oppNameText.textContent = `Filtering: vs ${opp.name}`;

  // Update grid active states
  dom.opponentGrid.querySelectorAll('.opp-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.oppId === opp.id);
  });

  // Fetch historical seasons until we bag 5 games
  showLoading(true);
  dom.results.classList.add('hidden');
  const rawGamelog = await getGamelog(state.player.id, opp.id);
  if (rawGamelog) {
    state.gamelog = parseGamelog(rawGamelog);
  }
  showLoading(false);
  dom.results.classList.remove('hidden');

  renderResults();
}

// ─── Clear opponent filter ──────────────
async function clearOpponent() {
  state.selectedOpponent = null;
  dom.selectedOpponent.classList.add('hidden');
  dom.opponentGrid.querySelectorAll('.opp-btn').forEach(btn => btn.classList.remove('active'));

  // reset dropdown
  const dropdown = document.getElementById('game-count-dropdown');
  if (dropdown) dropdown.value = "20";

  // Re-fetch only this year
  showLoading(true);
  dom.results.classList.add('hidden');
  const rawGamelog = await getGamelog(state.player.id, null);
  if (rawGamelog) {
    state.gamelog = parseGamelog(rawGamelog);
  }
  showLoading(false);
  dom.results.classList.remove('hidden');

  renderResults();
}

// ─── Select a player ───────────────────
async function selectPlayer(player) {
  dom.dropdown.classList.remove('visible');
  dom.searchInput.value = '';
  dom.intro.style.display = 'none';

  // Show player card immediately
  dom.playerCard.classList.remove('hidden');
  dom.playerHeadshot.src = player.headshot;
  dom.playerHeadshot.alt = player.name;
  dom.playerName.textContent = player.name;
  dom.playerMeta.innerHTML = `
    <span>🏅 ${player.position || 'Player'}</span>
    <span>🏠 ${player.team || '—'}</span>
  `;

  // Track search in "database" (localStorage)
  trackPlayerSearch(player);

  // Fetch gamelog
  showLoading(true);
  dom.results.classList.add('hidden');
  dom.opponentSection.classList.add('hidden');

  try {
    // Get player details for more info
    const details = await getPlayerDetails(player.id);
    if (details) {
      const pos = details.position?.displayName || player.position;
      const jersey = details.jersey ? `#${details.jersey}` : '';
      dom.playerMeta.innerHTML = `
        <span>🏅 ${pos} ${jersey}</span>
        <span>🏠 ${player.team || '—'}</span>
        <span>📏 ${details.displayHeight || ''} ${details.displayWeight || ''}</span>
      `;
      if (details.headshot?.href) {
        dom.playerHeadshot.src = details.headshot.href;
      }
    }

    // Fetch gamelog
    const rawGamelog = await getGamelog(player.id);
    if (!rawGamelog) {
      showError('Could not load game log data.');
      showLoading(false);
      return;
    }

    state.player = player;
    state.gamelog = parseGamelog(rawGamelog);
    state.opponents = extractOpponents(state.gamelog);
    state.selectedOpponent = null;

    if (!state.gamelog.length) {
      showError('No games found for this season.');
      showLoading(false);
      return;
    }

    // Show everything
    dom.results.classList.remove('hidden');
    renderOpponentPicker();
    renderResults();
  } catch (e) {
    console.error('Error loading player:', e);
    showError('Failed to load player data. Try again.');
  }
  showLoading(false);
}

// ─── Clear player ───────────────────────
function clearPlayer() {
  state.player = null;
  state.gamelog = [];
  state.opponents = [];
  state.selectedOpponent = null;
  state.customThresholds = {};

  dom.playerCard.classList.add('hidden');
  dom.rosterSection.classList.add('hidden');
  dom.opponentSection.classList.add('hidden');
  dom.results.classList.add('hidden');
  dom.selectedOpponent.classList.add('hidden');
  dom.intro.style.display = 'block';
  dom.searchInput.value = '';
}

// ─── Render search dropdown ─────────────
function renderDropdown(players) {
  if (!players.length) {
    dom.dropdown.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted)">No players found</div>';
    dom.dropdown.classList.add('visible');
    return;
  }

  dom.dropdown.innerHTML = players.slice(0, 8).map(p => `
    <div class="autocomplete-item" data-id="${p.id}">
      <img src="${p.headshot}" alt="${p.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23161b26%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2224%22 text-anchor=%22middle%22 fill=%22%23505a70%22 font-size=%2216%22>?</text></svg>'">
      <div class="autocomplete-item-info">
        <div class="autocomplete-item-name">${p.name}</div>
        <div class="autocomplete-item-meta">${p.position ? p.position + ' · ' : ''}${p.team || ''}</div>
      </div>
    </div>
  `).join('');

  dom.dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      const pid = item.dataset.id;
      const p = players.find(x => String(x.id) === String(pid));
      if (p) selectPlayer(p);
    });
  });

  dom.dropdown.classList.add('visible');
}

// ─── Search handler ─────────────────────
const onSearch = debounce(async () => {
  const q = dom.searchInput.value.trim();
  if (q.length < 2) { dom.dropdown.classList.remove('visible'); return; }

  try {
    const players = await searchPlayers(q);
    renderDropdown(players);
  } catch (e) {
    showError('Search failed. Check internet connection.');
  }
}, 400);

// ─── Init ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Search input
  dom.searchInput.addEventListener('input', onSearch);
  dom.searchInput.addEventListener('focus', () => {
    if (dom.dropdown.children.length) dom.dropdown.classList.add('visible');
  });
  dom.searchBtn.addEventListener('click', onSearch);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!dom.searchInput.contains(e.target) && !dom.dropdown.contains(e.target)) {
      dom.dropdown.classList.remove('visible');
    }
  });

  // Clear buttons
  dom.clearPlayer.addEventListener('click', clearPlayer);
  dom.clearOpponent.addEventListener('click', clearOpponent);

  // Game count dropdown listener
  const gameCountDropdown = document.getElementById('game-count-dropdown');
  if (gameCountDropdown) {
    gameCountDropdown.addEventListener('change', () => {
      if (state.player) {
        renderResults();
      }
    });
  }

  // Sport selector
  document.querySelectorAll('.sport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sport = btn.dataset.sport;
      // Clear current data
      clearPlayer();
      loadHotProps();
      if (typeof loadDailyParlays === 'function') loadDailyParlays();
      loadTeamsDropdown();
    });
  });

  // Example pills
  document.querySelectorAll('.example-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      // Set the right sport first
      const query = pill.dataset.query;
      if (query.includes('LeBron')) {
        document.querySelector('.sport-btn[data-sport="basketball"]').click();
      } else if (query.includes('Mahomes')) {
        document.querySelector('.sport-btn[data-sport="football"]').click();
      } else if (query.includes('Soto')) {
        document.querySelector('.sport-btn[data-sport="baseball"]').click();
      }

      dom.searchInput.value = query;
      dom.searchInput.dispatchEvent(new Event('input'));
      dom.searchInput.focus();
    });
  });

  // Load initial data
  loadHotProps();
  if (typeof loadDailyParlays === 'function') loadDailyParlays();
  loadTeamsDropdown();
});

// ─── Load Teams Dropdown ────────────────
async function loadTeamsDropdown() {
  if (!dom.teamDropdown) return;

  dom.teamDropdown.innerHTML = '<option value="">Loading teams...</option>';
  dom.rosterSection.classList.add('hidden');

  const teams = await getTeams();

  if (!teams.length) {
    dom.teamDropdown.innerHTML = '<option value="">Failed to load teams</option>';
    return;
  }

  // Sort teams alphabetically
  teams.sort((a, b) => a.displayName.localeCompare(b.displayName));

  let optionsHtml = '<option value="">Select a Team...</option>';
  teams.forEach(t => {
    optionsHtml += `<option value="${t.id}">${t.displayName}</option>`;
  });

  dom.teamDropdown.innerHTML = optionsHtml;
}

// ─── Handle Team Selection/Roster ───────
if (dom.teamDropdown) {
  dom.teamDropdown.addEventListener('change', async (e) => {
    const teamId = e.target.value;
    if (!teamId) {
      dom.rosterSection.classList.add('hidden');
      return;
    }

    dom.rosterSection.classList.remove('hidden');
    dom.rosterContainer.innerHTML = `<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:20px auto"></div><p style="text-align:center;color:var(--text-muted);font-size:12px">Loading roster...</p>`;

    const roster = await getTeamRoster(teamId);

    if (!roster.length) {
      dom.rosterContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">Could not load active roster for this team.</p>`;
      return;
    }

    const teamName = dom.teamDropdown.options[dom.teamDropdown.selectedIndex].text;

    // Render athletes
    dom.rosterContainer.innerHTML = roster.map(p => {
      const headshot = p.headshot?.href || `https://a.espncdn.com/i/headshots/${SPORT_CONFIG[state.sport].league}/players/full/${p.id}.png`;
      return `
                <div class="autocomplete-item roster-item" data-id="${p.id}" data-name="${p.fullName}" data-team="${teamName}" data-headshot="${headshot}" data-pos="${p.position?.displayName || ''}">
                  <img src="${headshot}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23161b26%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2224%22 text-anchor=%22middle%22 fill=%22%23505a70%22 font-size=%2216%22>?</text></svg>'">
                  <div class="autocomplete-item-info">
                    <div class="autocomplete-item-name">${p.fullName}</div>
                    <div class="autocomplete-item-meta">${p.position?.displayName || ''} ${p.jersey ? '#' + p.jersey : ''}</div>
                  </div>
                </div>
            `;
    }).join('');

    // Bind clicks
    dom.rosterContainer.querySelectorAll('.roster-item').forEach(item => {
      item.addEventListener('click', () => {
        const player = {
          id: item.dataset.id,
          name: item.dataset.name,
          team: item.dataset.team,
          headshot: item.dataset.headshot,
          position: item.dataset.pos
        };
        selectPlayer(player);
        dom.rosterSection.classList.add('hidden'); // hide roster after selecting
        dom.teamDropdown.value = ""; // reset dropdown
      });
    });
  });
}

// ─── Mock Database: Track Searches ────────
function trackPlayerSearch(player) {
  const sport = state.sport;
  const key = `sg_searches_${sport}`;
  let data = JSON.parse(localStorage.getItem(key)) || {};

  if (!data[player.name]) {
    data[player.name] = { count: 0, headshot: player.headshot, team: player.team };
  }
  data[player.name].count++;

  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Get Top Searched Players ─────────────
function getTopSearchedPlayers(sport, count = 5) {
  const key = `sg_searches_${sport}`;
  let data = JSON.parse(localStorage.getItem(key)) || {};

  // Seed with fake search data if empty (to simulate real users)
  if (Object.keys(data).length < count) {
    if (sport === 'basketball') {
      data = {
        'LeBron James': { count: 1420, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png', team: 'Los Angeles Lakers' },
        'Nikola Jokic': { count: 1105, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png', team: 'Denver Nuggets' },
        'Luka Doncic': { count: 980, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png', team: 'Dallas Mavericks' },
        'Jayson Tatum': { count: 850, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4065648.png', team: 'Boston Celtics' },
        'Shai Gilgeous-Alexander': { count: 720, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278073.png', team: 'Oklahoma City Thunder' }
      };
    } else if (sport === 'football') {
      data = {
        'Patrick Mahomes': { count: 2100, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png', team: 'Kansas City Chiefs' },
        'Lamar Jackson': { count: 1850, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3924365.png', team: 'Baltimore Ravens' },
        'Josh Allen': { count: 1620, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png', team: 'Buffalo Bills' },
        'Christian McCaffrey': { count: 1400, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3117251.png', team: 'San Francisco 49ers' },
        'Jalen Hurts': { count: 1150, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4040715.png', team: 'Philadelphia Eagles' }
      };
    } else if (sport === 'baseball') {
      data = {
        'Shohei Ohtani': { count: 3200, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/39832.png', team: 'Los Angeles Dodgers' },
        'Aaron Judge': { count: 2450, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/33236.png', team: 'New York Yankees' },
        'Juan Soto': { count: 1980, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/38908.png', team: 'New York Yankees' },
        'Bobby Witt Jr.': { count: 1450, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/42403.png', team: 'Kansas City Royals' },
        'Gunnar Henderson': { count: 1100, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/42401.png', team: 'Baltimore Orioles' }
      };
    }
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Sort by highest count
  const sorted = Object.entries(data).map(([name, info]) => ({ name, ...info })).sort((a, b) => b.count - a.count);
  return sorted.slice(0, count);
}

// ─── AI Hot Streaks ─────────────────────
async function loadHotProps() {
  const container = document.getElementById('hot-props-container');
  if (!container) return;

  container.innerHTML = `<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:20px auto"></div><p style="text-align:center;color:var(--text-muted);font-size:12px">Analyzing top searched players...</p>`;

  const sport = state.sport;
  const topPlayers = getTopSearchedPlayers(sport, 5); // Get most requested from "database"
  const props = POPULAR_PROPS[sport];

  let bestBets = [];

  try {
    // Fetch data in parallel for the top 5 most searched players
    const promises = topPlayers.map(async (searchInfo) => {
      const pList = await searchPlayers(searchInfo.name);
      if (!pList.length) return null;
      const p = pList[0];
      const gamelogRaw = await getGamelog(p.id);
      if (!gamelogRaw) return null;

      const games = parseGamelog(gamelogRaw).slice(0, 10); // L10 games
      if (games.length < 5) return null; // not enough data

      let bestProp = null;
      let highestRate = -1;

      // Find the absolute best hit-rate prop for THIS specific player
      props.forEach(prop => {
        let hits = 0;
        const validGames = games.filter(g => g.stats[prop.stat] !== undefined && g.stats[prop.stat] !== '-');
        if (validGames.length < 5) return;

        const results = validGames.map(g => {
          const val = parseFloat(g.stats[prop.stat]) || 0;
          const hit = val >= prop.val;
          if (hit) hits++;
          return hit;
        });

        const rate = hits / validGames.length;
        // Prioritize higher strike rate lines (e.g. 100% hits > 80% hits)
        if (rate > highestRate && rate >= 0.6) {
          highestRate = rate;
          bestProp = { ...prop, rate, hits, total: validGames.length, results };
        }
      });

      if (bestProp) {
        return { player: p, prop: bestProp, searchCount: searchInfo.count };
      }
      return null;
    });

    const results = await Promise.all(promises);
    bestBets = results.filter(r => r !== null).sort((a, b) => b.prop.rate - a.prop.rate);

    if (!bestBets.length) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">No high-confidence trends found today.</p>`;
      return;
    }

    // Render the cards
    container.innerHTML = bestBets.map(bet => {
      const pct = Math.round(bet.prop.rate * 100);

      // Build tiny L10 history bar
      const historyHtml = bet.prop.results.reverse().map(hit =>
        `<div style="width:12px; height:12px; border-radius:2px; background: ${hit ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>`
      ).join('');

      return `
        <div class="hot-card" onclick="document.getElementById('player-search').value='${bet.player.name}'; document.getElementById('search-btn').click(); window.scrollTo({top:0, behavior:'smooth'});">
          <div class="hot-card-left">
            <div style="position:relative">
              <img src="${bet.player.headshot || 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png'}" alt="${bet.player.name}">
              <div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); font-size:9px; background:var(--accent); color:#fff; padding:2px 4px; border-radius:4px; font-weight:800; white-space:nowrap;">🔥 Top Pick</div>
            </div>
            <div style="margin-left: 8px;">
              <div class="hot-player-name">${bet.player.name} <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:4px;">(${bet.searchCount.toLocaleString()} searches)</span></div>
              <div class="hot-player-meta">${bet.player.team || 'Pro Player'}</div>
            </div>
          </div>
          <div class="hot-card-right">
            <div class="hot-prop-label">${bet.prop.label}</div>
            <div class="hot-prop-history">
              ${historyHtml}
              <span class="hot-prop-pct">${pct}%</span>
            </div>
            <div class="hot-prop-sub">(${bet.prop.hits}/${bet.prop.total} in L10)</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error('Failed to load hot props', e);
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px">Check back later for automated trends.</p>`;
  }
}

// ─── Mock Database: Track Searches ────────
function trackPlayerSearch(player) {
  const sport = state.sport;
  const key = `sg_searches_${sport}`;
  let data = JSON.parse(localStorage.getItem(key)) || {};

  if (!data[player.name]) {
    data[player.name] = { count: 0, headshot: player.headshot, team: player.team };
  }
  data[player.name].count++;

  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Get Top Searched Players ─────────────
function getTopSearchedPlayers(sport, count = 5) {
  const key = `sg_searches_${sport}`;
  let data = JSON.parse(localStorage.getItem(key)) || {};

  if (Object.keys(data).length < count) {
    if (sport === 'basketball') {
      data = {
        'LeBron James': { count: 1420, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png', team: 'Los Angeles Lakers' },
        'Nikola Jokic': { count: 1105, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png', team: 'Denver Nuggets' },
        'Luka Doncic': { count: 980, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png', team: 'Dallas Mavericks' },
        'Jayson Tatum': { count: 850, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4065648.png', team: 'Boston Celtics' },
        'Shai Gilgeous-Alexander': { count: 720, headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278073.png', team: 'Oklahoma City Thunder' }
      };
    } else if (sport === 'football') {
      data = {
        'Patrick Mahomes': { count: 2100, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png', team: 'Kansas City Chiefs' },
        'Lamar Jackson': { count: 1850, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3924365.png', team: 'Baltimore Ravens' },
        'Josh Allen': { count: 1620, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png', team: 'Buffalo Bills' },
        'Christian McCaffrey': { count: 1400, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3117251.png', team: 'San Francisco 49ers' },
        'Jalen Hurts': { count: 1150, headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4040715.png', team: 'Philadelphia Eagles' }
      };
    } else if (sport === 'baseball') {
      data = {
        'Shohei Ohtani': { count: 3200, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/39832.png', team: 'Los Angeles Dodgers' },
        'Aaron Judge': { count: 2450, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/33236.png', team: 'New York Yankees' },
        'Juan Soto': { count: 1980, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/38908.png', team: 'New York Yankees' },
        'Bobby Witt Jr.': { count: 1450, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/42403.png', team: 'Kansas City Royals' },
        'Gunnar Henderson': { count: 1100, headshot: 'https://a.espncdn.com/i/headshots/mlb/players/full/42401.png', team: 'Baltimore Orioles' }
      };
    }
    localStorage.setItem(key, JSON.stringify(data));
  }

  const sorted = Object.entries(data).map(([name, info]) => ({ name, ...info })).sort((a, b) => b.count - a.count);
  return sorted.slice(0, count);
}

// ─── AI Hot Streaks ─────────────────────
async function loadHotProps() {
  const container = document.getElementById('hot-props-container');
  if (!container) return;

  container.innerHTML = `<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:20px auto"></div><p style="text-align:center;color:var(--text-muted);font-size:12px">Analyzing top searched players...</p>`;

  const sport = state.sport;
  const topPlayers = getTopSearchedPlayers(sport, 5); // Get most requested from "database"
  const props = POPULAR_PROPS[sport];

  let bestBets = [];

  try {
    // Fetch data in parallel for the top 5 most searched players
    const promises = topPlayers.map(async (searchInfo) => {
      const pList = await searchPlayers(searchInfo.name);
      if (!pList.length) return null;
      const p = pList[0];
      const gamelogRaw = await getGamelog(p.id);
      if (!gamelogRaw) return null;

      const games = parseGamelog(gamelogRaw).slice(0, 10); // L10 games
      if (games.length < 5) return null; // not enough data

      let bestProp = null;
      let highestRate = -1;

      // Find the absolute best hit-rate prop for THIS specific player
      props.forEach(prop => {
        let hits = 0;
        const validGames = games.filter(g => g.stats[prop.stat] !== undefined && g.stats[prop.stat] !== '-');
        if (validGames.length < 5) return;

        const results = validGames.map(g => {
          const val = parseFloat(g.stats[prop.stat]) || 0;
          const hit = val >= prop.val;
          if (hit) hits++;
          return hit;
        });

        const rate = hits / validGames.length;
        // Prioritize higher strike rate lines (e.g. 100% hits > 80% hits)
        if (rate > highestRate && rate >= 0.6) {
          highestRate = rate;
          bestProp = { ...prop, rate, hits, total: validGames.length, results };
        }
      });

      if (bestProp) {
        return { player: p, prop: bestProp, searchCount: searchInfo.count };
      }
      return null;
    });

    const results = await Promise.all(promises);
    bestBets = results.filter(r => r !== null).sort((a, b) => b.prop.rate - a.prop.rate);

    if (!bestBets.length) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">No high-confidence trends found today.</p>`;
      return;
    }

    // Render the cards
    container.innerHTML = bestBets.map(bet => {
      const pct = Math.round(bet.prop.rate * 100);

      // Build tiny L10 history bar
      const historyHtml = bet.prop.results.reverse().map(hit =>
        `<div style="width:12px; height:12px; border-radius:2px; background: ${hit ? 'var(--accent-green)' : 'var(--accent-red)'}"></div>`
      ).join('');

      return `
        <div class="hot-card" onclick="document.getElementById('player-search').value='${bet.player.name}'; document.getElementById('search-btn').click(); window.scrollTo({top:0, behavior:'smooth'});">
          <div class="hot-card-left">
            <div style="position:relative">
              <img src="${bet.player.headshot || 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png'}" alt="${bet.player.name}">
              <div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); font-size:9px; background:var(--accent); color:#fff; padding:2px 4px; border-radius:4px; font-weight:800; white-space:nowrap;">🔥 Top Pick</div>
            </div>
            <div style="margin-left: 8px;">
              <div class="hot-player-name">${bet.player.name} <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:4px;">(${bet.searchCount.toLocaleString()} searches)</span></div>
              <div class="hot-player-meta">${bet.player.team || 'Pro Player'}</div>
            </div>
          </div>
          <div class="hot-card-right">
            <div class="hot-prop-label">${bet.prop.label}</div>
            <div class="hot-prop-history">
              ${historyHtml}
              <span class="hot-prop-pct">${pct}%</span>
            </div>
            <div class="hot-prop-sub">(${bet.prop.hits}/${bet.prop.total} in L10)</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error('Failed to load hot props', e);
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px">Check back later for automated trends.</p>`;
  }
}
// ─── AI Daily Parlay Builder ─────────────────────
async function loadDailyParlays() {
  const container = document.getElementById('daily-parlay-container');
  if (!container) return;

  container.innerHTML = `<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:20px auto"></div><p style="text-align:center;color:var(--text-muted);font-size:12px">Analyzing today's matchups and historical hit rates...</p>`;

  const cfg = SPORT_CONFIG[state.sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${state.sport}/${cfg.league}/scoreboard`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.events || data.events.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">No games scheduled today.</p>`;
      return;
    }

    // Get up to 5 matchups to keep API requests reasonable
    const matchups = data.events.slice(0, 5).map(e => {
      const comp = e.competitions[0];
      return {
        home: comp.competitors.find(c => c.homeAway === 'home').team,
        away: comp.competitors.find(c => c.homeAway === 'away').team
      };
    });

    let candidateBets = [];
    const props = POPULAR_PROPS[state.sport];

    // Analyze top players from each team to keep requests low
    const promises = matchups.flatMap(match => {
      return [
        { teamId: match.home.id, opponentId: match.away.id, opponentName: match.away.displayName, opponentLogo: match.away.logo },
        { teamId: match.away.id, opponentId: match.home.id, opponentName: match.home.displayName, opponentLogo: match.home.logo }
      ].map(async (side) => {
        let roster = await getTeamRoster(side.teamId);
        if (!roster || roster.length === 0) return null;

        // Just grab the first active player on the roster who matches a trend (up to 3 tries per team)
        for (let i = 0; i < Math.min(3, roster.length); i++) {
          const p = roster[i];
          if (!p || !p.id) continue;

          const rawLog = await getGamelog(p.id, side.opponentId); // Fetch current + historical until 5 games found
          if (!rawLog) continue;

          const allGames = parseGamelog(rawLog);
          // Filter specifically to games against tonight's opponent
          const vsOpponent = allGames.filter(g => g.opponent && g.opponent.id === side.opponentId);
          if (vsOpponent.length < 3) continue; // Need at least 3 games against them for a trend

          let bestProp = null;
          let highestRate = -1;

          props.forEach(prop => {
            let hits = 0;
            const validGames = vsOpponent.filter(g => g.stats[prop.stat] !== undefined && g.stats[prop.stat] !== '-');
            if (validGames.length < 3) return;

            const results = validGames.map(g => {
              const val = parseFloat(g.stats[prop.stat]) || 0;
              const hit = val >= prop.val;
              if (hit) hits++;
              return hit;
            });

            const rate = hits / validGames.length;
            if (rate > highestRate && rate >= 0.6) {
              highestRate = rate;
              bestProp = { ...prop, rate, hits, total: validGames.length, results };
            }
          });

          if (bestProp) {
            return { player: p, prop: bestProp, matchup: `vs ${side.opponentName}`, oppId: side.opponentId };
          }
        }
        return null;
      });
    });

    const results = await Promise.all(promises);
    candidateBets = results.filter(r => r !== null).sort((a, b) => b.prop.rate - a.prop.rate);

    // Take top 3 for the parlay
    const bestBets = candidateBets.slice(0, 3);

    if (!bestBets.length) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">No high-confidence historical trends found for today's matchups.</p>`;
      return;
    }

    container.innerHTML = bestBets.map(bet => {
      const pct = Math.round(bet.prop.rate * 100);
      return `
        <div class="parlay-card" onclick="document.getElementById('player-search').value='${bet.player.fullName || bet.player.displayName}'; document.getElementById('search-btn').click(); window.scrollTo({top:0, behavior:'smooth'});">
          <div class="parlay-card-header">
            <img class="parlay-card-headshot" src="${bet.player.headshot?.href || 'https://a.espncdn.com/i/headshots/nba/players/full/1966.png'}" alt="${bet.player.displayName}">
            <div class="parlay-card-info">
              <div class="parlay-player-name">${bet.player.displayName}</div>
              <div class="parlay-matchup">${bet.matchup}</div>
            </div>
            <div class="parlay-hit-rate">✓ ${pct}%</div>
          </div>
          <div class="parlay-prop-box">
            <div class="parlay-prop-label">${bet.prop.label}</div>
            <div class="parlay-prop-value">${bet.prop.val}+</div>
          </div>
          <div class="parlay-footer">
            <div class="parlay-odds">Top Trend</div>
            <div style="font-size: 11px; color: var(--text-muted);">${bet.prop.hits}/${bet.prop.total} times</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    console.error('Failed to load daily parlays', e);
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px">Check back later for automated trends.</p>`;
  }
}
