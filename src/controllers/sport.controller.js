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
    const [tickets] = await db.query(`
      SELECT 
        tt.id,
        tt.match_id,
        tt.name,
        tt.price,
        tt.quota,
        tt.sold,
        (tt.quota - tt.sold) AS available,
        tt.max_per_user
      FROM ticket_types tt
      JOIN matches m ON m.id = tt.match_id
      WHERE m.sport_id = ?
    `, [sport.id]);
    let userTicketMap = {};

    if (req.session.user) {
      const userId = req.session.user.id;

      const [rows] = await db.query(`
    SELECT 
      oi.ticket_type_id,
      SUM(oi.quantity) AS total_bought
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = ?
    GROUP BY oi.ticket_type_id
  `, [userId]);

      rows.forEach(r => {
        userTicketMap[r.ticket_type_id] = r.total_bought;
      });
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
    ORDER BY m.start_time DESC`,
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
      standings,
      tickets,
      userTicketMap,
      isLoggedIn: !!req.session.user 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Terjadi kesalahan server");
  }
};

