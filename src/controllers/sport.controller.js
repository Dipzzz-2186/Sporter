const Sport = require("../models/sport.model");

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

    res.render("sports/detail", {
      title: sport.name,
      sport,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
