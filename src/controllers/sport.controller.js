const Sport = require("../models/sport.model");
const db = require("../config/db");

// Halaman list semua cabang olahraga
exports.renderSports = async (req, res) => {
  try {
    const sports = await Sport.getAll();

    res.render("sports/index", {
      title: "Cabang Olahraga",
      sports,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Terjadi kesalahan server");
  }
};

// Halaman detail satu sport (optional)
exports.renderSportDetail = async (req, res) => {
  try {
    const slug = req.params.slug;
    const sport = await Sport.getBySlug(slug);

    if (!sport) return res.status(404).send("Sport tidak ditemukan");

    const [matches] = await db.query(
      `SELECT 
        m.id, m.title, m.start_time, m.end_time,
        ht.name AS home_team_name,
        at.name AS away_team_name,
        v.name AS venue_name
      FROM matches m
      LEFT JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      LEFT JOIN venues v ON v.id = m.venue_id
      WHERE m.sport_id = ?
      ORDER BY m.start_time ASC`,
      [sport.id]
    );

    // ✅ ADD: standings
    const [standings] = await db.query(
      `SELECT 
        s.id, s.team_id, t.name AS team_name,
        s.played, s.win, s.draw, s.loss,
        s.goals_for, s.goals_against,
        (s.goals_for - s.goals_against) AS goal_diff,
        s.pts, s.rank_no
      FROM standings s
      LEFT JOIN teams t ON t.id = s.team_id
      WHERE s.sport_id = ?
      ORDER BY s.pts DESC, goal_diff DESC, s.goals_for DESC, t.name ASC`,
      [sport.id]
    );

    return res.render("sports/detail", {
      title: sport.name,
      sport,
      matches,
      standings, // ✅ kirim ke pug
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Terjadi kesalahan server");
  }
};

