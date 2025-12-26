// src/controllers/standings.controller.js
const db = require('../config/db');
const { getStandings } = require('../services/standings.service');
const {
  syncPadelStandings,
  syncGenericStandings
} = require('../services/standingsSync.service');

async function hasPadelIndividualMatch(sportId) {
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS total
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    WHERE m.sport_id = ?
  `, [sportId]);

  return row.total > 0;
}

// tambahin helper di atas fungsi yang ada di file
function isValidPadelSet(homeScore, awayScore) {
  // harus integer
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return false;

  // tidak boleh negatif
  if (homeScore < 0 || awayScore < 0) return false;

  // tidak boleh seri
  if (homeScore === awayScore) return false;

  const max = Math.max(homeScore, awayScore);
  const min = Math.min(homeScore, awayScore);
  const diff = max - min;

  // skor maksimal 7
  if (max > 7) return false;

  // menang di 6 harus selisih 2 (6–4, 6–3, dst)
  if (max === 6) {
    return diff === 2;
  }

  // menang di 7:
  // 7–5 (lanjutan dari 6–5)
  // 7–6 (tie-break)
  if (max === 7) {
    return diff === 1 || diff === 2;
  }

  return false;
}

async function getAvailableSports(req) {
  if (!req.session.user) return [];

  if (req.session.user.role === 'admin') {
    const [rows] = await db.query(
      `SELECT id, name FROM sports ORDER BY name`
    );
    return rows;
  }

  // ✅ SUBADMIN: hanya cabang miliknya
  const [rows] = await db.query(`
    SELECT s.id, s.name
    FROM sports s
    JOIN user_sports us ON us.sport_id = s.id
    WHERE us.user_id = ?
    ORDER BY s.name
  `, [req.session.user.id]);

  return rows;
}

exports.listStandings = async (req, res) => {
  const mode = req.query.mode === 'individual' ? 'individual' : 'team';
  const sportId = Number(req.query.sport_id);

  // ✅ WAJIB: ambil sports
  const sports = await getAvailableSports(req);
  
  if (
    req.session.user.role === 'subadmin' &&
    sports.length === 1 &&
    !Number.isInteger(sportId)
  ) {
    return res.redirect(
      `/subadmin/standings?sport_id=${sports[0].id}&mode=${mode}`
    );
  }

  if (req.session.user.role === 'subadmin') {
    const allowedSportIds = sports.map(s => String(s.id));
    if (sportId && !allowedSportIds.includes(String(sportId))) {
      return res.status(403).send('Akses ditolak');
    }
  }

  // ✅ guard kalau sport_id kosong / NaN
  if (!Number.isInteger(sportId)) {
    return res.render('subadmin/standings', {
      standings: [],
      sports,
      query: req.query,
      isPadel: false,
      mode,
      isReadOnly: req.session.user.role === 'admin'
    });
  }

  const [[sport]] = await db.query(
    'SELECT name FROM sports WHERE id = ?',
    [sportId]
  );

  const isPadel = sport.name.toLowerCase() === 'padel';

  if (isPadel) {
    await syncPadelStandings(sportId, mode);
  } else {
    await syncGenericStandings(sportId);
  }

  const { rows } = await getStandings({ sportId, mode });

  const isAdmin = req.session.user.role === 'admin';

  res.render('subadmin/standings', {
    standings: rows,
    sports,
    query: { sport_id: sportId, mode },
    isPadel,
    mode,
    isReadOnly: isAdmin   // 🔥 ADMIN READ ONLY
  });
};

exports.addWin = async (req, res) => {
  const { id } = req.params;
  const { game_win = 0, game_loss = 0 } = req.query;

  await db.query(`
    UPDATE standings
    SET
      win = win + 1,
      game_win = game_win + ?,
      game_loss = game_loss + ?,
      pts = pts + 3
    WHERE id = ?
  `, [game_win, game_loss, id]);

  const mode = req.query.mode === 'individual' ? 'individual' : 'team';
  res.redirect(`/subadmin/standings?sport_id=${req.query.sport_id}&mode=${mode}`);

};

exports.addLoss = async (req, res) => {
  const { id } = req.params;
  const { game_win = 0, game_loss = 0 } = req.query;

  await db.query(`
    UPDATE standings
    SET
      loss = loss + 1,
      game_win = game_win + ?,
      game_loss = game_loss + ?
    WHERE id = ?
  `, [game_win, game_loss, id]);

  res.redirect(`/subadmin/standings?sport_id=${req.query.sport_id}`);
};

exports.submitScore = async (req, res) => {
  const { id } = req.params;               // ✅ AMBIL DARI PARAM
  const { game_win, game_loss, result } = req.query;

  if (!id || game_win == null || game_loss == null || !result) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak lengkap'
    });
  }

  const win = result === 'win' ? 1 : 0;
  const loss = result === 'loss' ? 1 : 0;
  const pts = win ? 3 : 0;

  await db.query(`
    UPDATE standings
    SET
      played    = played + 1,
      win       = win + ?,
      loss      = loss + ?,
      game_win  = game_win + ?,
      game_loss = game_loss + ?,
      pts       = pts + ?
    WHERE id = ?
  `, [win, loss, game_win, game_loss, pts, id]);

  res.json({ success: true });
};
function submitPadelScore() {
  const modal = document.getElementById('padelScoreModal');
  const mode = modal.dataset.mode;
  const matchId = document.getElementById('matchId').value;

  const home = Number(document.getElementById('homeScore').value);
  const away = Number(document.getElementById('awayScore').value);

  if (home === away) {
    alert('Skor tidak boleh seri');
    return;
  }

  const url =
    mode === 'individual'
      ? `/subadmin/matches/${matchId}/submit-individual-score`
      : `/subadmin/matches/${matchId}/submit-score`;

  const btnSave = document.querySelector('#padelScoreModal .btn-primary');
  // disable to prevent double submit + show spinner
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.dataset.orig = btnSave.innerHTML;
    btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Simpan';
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ home_score: home, away_score: away })
  })
    .then(res => res.json())
    .then(data => {
      // restore button
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = btnSave.dataset.orig || 'Simpan';
      }

      if (!data || data.success === false) {
        alert(data && data.message ? data.message : 'Gagal menyimpan skor');
        return;
      }

      // jika match selesai, update UI: tutup modal + ubah status/tombol di row
      if (data.finished) {
        // close modal
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();

        // update row DOM tanpa reload (best effort)
        const actionBtn = document.querySelector(`button[data-match-id="${matchId}"]`);
        if (actionBtn) {
          // replace input button with a finished badge
          const parent = actionBtn.parentElement;
          if (parent) {
            const finishedSpan = document.createElement('span');
            finishedSpan.className = 'status-badge status-finished';
            finishedSpan.innerHTML = '<i class="bi bi-check-circle me-1"></i> BO3 Selesai';
            parent.replaceChild(finishedSpan, actionBtn);
          }
        }

        // update status cell in the same row (if exists)
        const row = actionBtn ? actionBtn.closest('tr') : null;
        if (row) {
          const statusCell = row.querySelector('td:last-of-type .status-badge') || row.querySelector('.status-badge');
          if (statusCell) {
            statusCell.className = 'status-badge status-finished';
            statusCell.innerHTML = '<i class="bi bi-check-circle"></i> Selesai';
          }
        }

        // optional: reload if you want canonical state from server
        // location.reload();
      } else {
        // not finished yet -> close modal & optionally show notification or update small set-count
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();

        // small toast/notification
        (function () {
          const n = document.createElement('div');
          n.className = 'alert alert-success';
          n.style.position = 'fixed';
          n.style.right = '20px';
          n.style.top = '20px';
          n.style.zIndex = 9999;
          n.innerText = 'Skor tersimpan — match belum selesai.';
          document.body.appendChild(n);
          setTimeout(() => n.remove(), 2200);
        })();

        // simplest: reload to fetch updated set counts if you don't handle partial UI update
        // location.reload();
      }
    })
    .catch(err => {
      console.error(err);
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = btnSave.dataset.orig || 'Simpan';
      }
      alert('Terjadi kesalahan, coba lagi.');
    });
}

exports.submitPadelMatchScore = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const matchId = Number(req.params.id);
    let { home_score, away_score } = req.body;

    // coerce to ints
    home_score = Number(home_score);
    away_score = Number(away_score);

    if (!isValidPadelSet(home_score, away_score)) {
      return res.status(400).json({ message: 'Skor set tidak valid menurut aturan padel (6 dengan selisih 2, atau 7-6).' });
    }

    const [[match]] = await conn.query(`
      SELECT id, sport_id, home_team_id, away_team_id, is_finished
      FROM matches WHERE id = ?
      FOR UPDATE
    `, [matchId]);

    if (!match) return res.status(404).json({ message: 'Match tidak ditemukan' });
    if (match.is_finished) return res.status(400).json({ message: 'Match sudah selesai' });

    const [[{ total_game }]] = await conn.query(`
      SELECT COUNT(*) total_game FROM match_games WHERE match_id = ?
    `, [matchId]);

    if (total_game >= 3) // safety check
      return res.status(400).json({ message: 'BO3 sudah penuh' });

    const gameNo = total_game + 1;
    const winner = home_score > away_score ? 'home' : 'away';

    // insert set (match_games)
    await conn.query(`
      INSERT INTO match_games (match_id, game_no, home_score, away_score, winner)
      VALUES (?, ?, ?, ?, ?)
    `, [matchId, gameNo, home_score, away_score, winner]);

    // --- setelah insert match_games ---
    const homeTeamId = match.home_team_id;
    const awayTeamId = match.away_team_id;

    // set menang (1/0)
    const homeSet = home_score > away_score ? 1 : 0;
    const awaySet = home_score < away_score ? 1 : 0;

    // update legacy game_win/game_loss (biar kompatibel) + set_win/set_loss + score_for/score_against
    await conn.query(`
  UPDATE standings
  SET
    game_win     = game_win + ?,
    game_loss    = game_loss + ?,
    set_win      = set_win + ?,
    set_loss     = set_loss + ?,
    score_for    = score_for + ?,
    score_against= score_against + ?
  WHERE sport_id = ? AND team_id = ?
`, [homeSet, awaySet, homeSet, awaySet, home_score, away_score, match.sport_id, homeTeamId]);

    await conn.query(`
  UPDATE standings
  SET
    game_win     = game_win + ?,
    game_loss    = game_loss + ?,
    set_win      = set_win + ?,
    set_loss     = set_loss + ?,
    score_for    = score_for + ?,
    score_against= score_against + ?
  WHERE sport_id = ? AND team_id = ?
`, [awaySet, homeSet, awaySet, homeSet, away_score, home_score, match.sport_id, awayTeamId]);

    // hitung jumlah set dimenangkan masing2 setelah insert
    const [wins] = await conn.query(`
      SELECT winner, COUNT(*) total
      FROM match_games
      WHERE match_id = ?
      GROUP BY winner
    `, [matchId]);

    const homeWin = wins.find(w => w.winner === 'home')?.total || 0;
    const awayWin = wins.find(w => w.winner === 'away')?.total || 0;

    // kalau belum ada pemenang match (belum 2 set), commit dan return finished=false
    if (homeWin < 2 && awayWin < 2) {
      await conn.commit();
      return res.json({ success: true, finished: false, homeWin, awayWin });
    }

    // ada pemenang match (first to 2 sets) -> update standings played/win/loss/pts dan tandai match selesai
    const winnerId = homeWin >= 2 ? homeTeamId : awayTeamId;
    const loserId = homeWin >= 2 ? awayTeamId : homeTeamId;

    await conn.query(`
      UPDATE standings
      SET played = played + 1, win = win + 1, pts = pts + 3
      WHERE sport_id = ? AND team_id = ?
    `, [match.sport_id, winnerId]);

    await conn.query(`
      UPDATE standings
      SET played = played + 1, loss = loss + 1
      WHERE sport_id = ? AND team_id = ?
    `, [match.sport_id, loserId]);

    await conn.query(`UPDATE matches SET is_finished = 1 WHERE id = ?`, [matchId]);

    await conn.commit();
    return res.json({ success: true, finished: true, homeWin, awayWin, winnerId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.submitIndividualScore = async (req, res) => {
  // implementasi identik dengan submitPadelMatchScore,
  // tapi ambil home/away team dari match_participants
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const matchId = Number(req.params.id);
    let { home_score, away_score } = req.body;
    home_score = Number(home_score);
    away_score = Number(away_score);

    if (!isValidPadelSet(home_score, away_score)) {
      return res.status(400).json({ message: 'Skor set tidak valid menurut aturan padel (6 dengan selisih 2, atau 7-6).' });
    }

    const [[match]] = await conn.query(`
      SELECT id, sport_id, is_finished
      FROM matches WHERE id = ?
      FOR UPDATE
    `, [matchId]);

    if (!match) return res.status(404).json({ message: 'Match tidak ditemukan' });
    if (match.is_finished) return res.status(400).json({ message: 'Match sudah selesai' });

    const [[{ total_game }]] = await conn.query(`SELECT COUNT(*) total_game FROM match_games WHERE match_id = ?`, [matchId]);
    if (total_game >= 3) return res.status(400).json({ message: 'BO3 sudah penuh' });

    const [teams] = await conn.query(`
      SELECT team_id
      FROM match_participants
      WHERE match_id = ?
      ORDER BY position ASC
      FOR UPDATE
    `, [matchId]);

    if (teams.length !== 2) throw new Error('Match individual harus 2 peserta');

    const homeTeamId = teams[0].team_id;
    const awayTeamId = teams[1].team_id;

    await conn.query(`
      INSERT INTO match_games (match_id, game_no, home_score, away_score, winner)
      VALUES (?, ?, ?, ?, ?)
    `, [matchId, total_game + 1, home_score, away_score, home_score > away_score ? 'home' : 'away']);

    // after insert match_games
    const homeSet = home_score > away_score ? 1 : 0;
    const awaySet = home_score < away_score ? 1 : 0;

    await conn.query(`
  UPDATE standings
  SET
    game_win     = game_win + ?,
    game_loss    = game_loss + ?,
    set_win      = set_win + ?,
    set_loss     = set_loss + ?,
    score_for    = score_for + ?,
    score_against= score_against + ?
  WHERE sport_id = ? AND team_id = ?
`, [homeSet, awaySet, homeSet, awaySet, home_score, away_score, match.sport_id, homeTeamId]);

    await conn.query(`
  UPDATE standings
  SET
    game_win     = game_win + ?,
    game_loss    = game_loss + ?,
    set_win      = set_win + ?,
    set_loss     = set_loss + ?,
    score_for    = score_for + ?,
    score_against= score_against + ?
  WHERE sport_id = ? AND team_id = ?
`, [awaySet, homeSet, awaySet, homeSet, away_score, home_score, match.sport_id, awayTeamId]);

    const [wins] = await conn.query(`
      SELECT winner, COUNT(*) total
      FROM match_games
      WHERE match_id = ?
      GROUP BY winner
    `, [matchId]);

    const homeWin = wins.find(w => w.winner === 'home')?.total || 0;
    const awayWin = wins.find(w => w.winner === 'away')?.total || 0;

    if (homeWin < 2 && awayWin < 2) {
      await conn.commit();
      return res.json({ success: true, finished: false, homeWin, awayWin });
    }

    const winnerId = homeWin >= 2 ? homeTeamId : awayTeamId;
    const loserId = homeWin >= 2 ? awayTeamId : homeTeamId;

    await conn.query(`
      UPDATE standings
      SET played = played + 1, win = win + 1, pts = pts + 3
      WHERE sport_id = ? AND team_id = ?
    `, [match.sport_id, winnerId]);

    await conn.query(`
      UPDATE standings
      SET played = played + 1, loss = loss + 1
      WHERE sport_id = ? AND team_id = ?
    `, [match.sport_id, loserId]);

    await conn.query(`UPDATE matches SET is_finished = 1 WHERE id = ?`, [matchId]);

    await conn.commit();
    res.json({ success: true, finished: true, homeWin, awayWin, winnerId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
};
