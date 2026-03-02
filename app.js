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
    season: 2025,
  }
};

// ─── State ──────────────────────────────
const state = {
  sport: 'basketball',
  player: null,
  playerTeamId: null,
  gamelog: [],       // array of { eventData, stats[] }
  opponents: [],     // unique opponents from gamelog
  selectedOpponent: null,
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
async function getGamelog(playerId) {
  const cfg = SPORT_CONFIG[state.sport];
  const url = `${ESPN_SITE}/${state.sport}/${cfg.league}/athletes/${playerId}/gamelog?season=${cfg.season}&seasontype=2`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Gamelog failed:', e);
    return null;
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
function getFilteredGames() {
  if (!state.selectedOpponent) return state.gamelog;
  return state.gamelog.filter(g => g.opponent && g.opponent.id === state.selectedOpponent.id);
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
  const chartGames = games.slice(0, 20).reverse(); // oldest→newest, max 20

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

    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
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

      return `
        <div class="candle-col">
          <div class="candle-tooltip">${val} ${statLabel} vs ${oppAbbr}<br>${dateStr} · ${g.result || '?'}</div>
          <div class="candle-bar ${cls}" style="height:${barH}px"></div>
          <div class="candle-label">${oppAbbr}</div>
        </div>
      `;
    }).join('');

    // Average line position
    const avgLineBottom = (avg / max) * chartHeight;
    const avgDisplay = avg.toFixed(1);

    const filterLabel = state.selectedOpponent ? `vs ${state.selectedOpponent.abbreviation}` : 'Season';

    html += `
      <div class="chart-card">
        <h4>📊 ${statLabel}</h4>
        <div class="chart-subtitle">${filterLabel} · Avg: ${avgDisplay} · ${chartGames.length} games</div>
        <div class="candle-chart" style="height:${chartHeight + 22}px">
          <div class="avg-line" style="bottom:${avgLineBottom + 22}px">
            <span class="avg-line-label">AVG ${avgDisplay}</span>
          </div>
          ${candles}
        </div>
      </div>
    `;
  });

  dom.chartsContainer.innerHTML = html;
}

// ─── Render Game Log Table ──────────────
function renderGamelogTable(games) {
  const cfg = SPORT_CONFIG[state.sport];
  const cols = cfg.statLabels.slice(0, 8); // show first 8 stat columns

  const headerCells = cols.map(c => `<th>${c}</th>`).join('');

  const rows = games.slice(0, 25).map(g => {
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
  const games = getFilteredGames();

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
function selectOpponent(opp) {
  state.selectedOpponent = opp;

  // Update selected indicator
  dom.selectedOpponent.classList.remove('hidden');
  dom.oppLogoWrap.innerHTML = opp.logo ? `<img src="${opp.logo}" alt="${opp.abbreviation}">` : '';
  dom.oppNameText.textContent = `Filtering: vs ${opp.name}`;

  // Update grid active states
  dom.opponentGrid.querySelectorAll('.opp-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.oppId === opp.id);
  });

  renderResults();
}

// ─── Clear opponent filter ──────────────
function clearOpponent() {
  state.selectedOpponent = null;
  dom.selectedOpponent.classList.add('hidden');
  dom.opponentGrid.querySelectorAll('.opp-btn').forEach(btn => btn.classList.remove('active'));
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

  dom.playerCard.classList.add('hidden');
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

  // Sport selector
  document.querySelectorAll('.sport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sport = btn.dataset.sport;
      // Clear current data
      clearPlayer();
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
});
