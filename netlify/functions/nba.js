// netlify/functions/nba.js
// Returns today's scoreboard + next upcoming Knicks game
// NBA CDN endpoints — no key required

const KNICKS_ID = 1610612752;

function parseGameClock(clock) {
  if (!clock) return '';
  // Format: "PT05M32.00S" -> "5:32"
  const m = clock.match(/PT(\d+)M([\d.]+)S/);
  if (!m) return clock;
  const mins = parseInt(m[1]);
  const secs = Math.floor(parseFloat(m[2]));
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

exports.handler = async () => {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://www.nba.com/',
      'Accept': 'application/json'
    };

    // Fetch scoreboard and schedule in parallel
    const [sbResp, schedResp] = await Promise.all([
      fetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json', { headers }),
      fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { headers })
    ]);

    if (!sbResp.ok) throw new Error('Scoreboard fetch failed: ' + sbResp.status);
    if (!schedResp.ok) throw new Error('Schedule fetch failed: ' + schedResp.status);

    const [sbData, schedData] = await Promise.all([sbResp.json(), schedResp.json()]);

    // ── SCOREBOARD: find Knicks game today if any ──
    const todayGames = sbData.scoreboard?.games || [];
    const knicksToday = todayGames.find(g =>
      g.homeTeam.teamId === KNICKS_ID || g.awayTeam.teamId === KNICKS_ID
    ) || null;

    let knicksGame = null;
    if (knicksToday) {
      const home = knicksToday.homeTeam;
      const away = knicksToday.awayTeam;
      const isHome = home.teamId === KNICKS_ID;
      knicksGame = {
        gameId: knicksToday.gameId,
        status: knicksToday.gameStatus,       // 1=scheduled, 2=live, 3=final
        statusText: knicksToday.gameStatusText,
        period: knicksToday.period,
        clock: parseGameClock(knicksToday.gameClock),
        gameTimeUTC: knicksToday.gameTimeUTC,
        knicks: {
          tricode: isHome ? home.teamTricode : away.teamTricode,
          score: isHome ? home.score : away.score,
          isHome
        },
        opponent: {
          tricode: isHome ? away.teamTricode : home.teamTricode,
          score: isHome ? away.score : home.score
        }
      };
    }

    // ── SCHEDULE: find next upcoming Knicks game ──
    let nextGame = null;
    if (!knicksGame || knicksGame.status === 3) {
      // Only look for next game if no live/scheduled game today
      const now = new Date();
      const gameDays = schedData.leagueSchedule?.gameDates || [];

      for (const day of gameDays) {
        for (const game of (day.games || [])) {
          const homeId = game.homeTeam?.teamId;
          const awayId = game.awayTeam?.teamId;
          if (homeId !== KNICKS_ID && awayId !== KNICKS_ID) continue;

          const gameTime = new Date(game.gameDateTimeUTC);
          if (gameTime <= now) continue;

          const isHome = homeId === KNICKS_ID;
          nextGame = {
            gameTimeUTC: game.gameDateTimeUTC,
            knicks: { tricode: 'NYK', isHome },
            opponent: {
              tricode: isHome ? game.awayTeam.teamTricode : game.homeTeam.teamTricode,
              city: isHome ? game.awayTeam.teamCity : game.homeTeam.teamCity,
              name: isHome ? game.awayTeam.teamName : game.homeTeam.teamName
            },
            arenaName: game.arenaName
          };
          break; // first upcoming game found
        }
        if (nextGame) break;
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30'
      },
      body: JSON.stringify({ knicksGame, nextGame })
    };

  } catch (err) {
    console.error('nba function error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message, knicksGame: null, nextGame: null })
    };
  }
};