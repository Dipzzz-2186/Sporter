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

    if (!sport) {
      return res.status(404).send("Sport tidak ditemukan");
    }
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
    res.render("sports/detail", {
      title: sport.name,
      sport,
      matches
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
