const Event = require("../models/event.model");

exports.renderHome = async (req, res) => {
  try {
    const featured = await Event.getFeaturedEvents();
    const latest   = await Event.getLatestEvents();

    res.render("home", {
      title: "Sporter - Event Olahraga Indonesia",
      featuredEvents: featured,
      latestEvents: latest,
      currentUser: req.user || null, // kalau nanti pakai auth
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
