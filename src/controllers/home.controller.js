const Event = require("../models/event.model");

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

exports.renderHome = async (req, res) => {
  try {
    const featured = await Event.getFeaturedEvents();
    const latest = await Event.getLatestEvents();

    const featuredEvents = featured.map((e) => ({
      ...e,
      start_date_formatted: formatDate(e.start_date),
      end_date_formatted: formatDate(e.end_date),
    }));

    const latestEvents = latest.map((e) => ({
      ...e,
      start_date_formatted: formatDate(e.start_date),
      end_date_formatted: formatDate(e.end_date),
    }));

    res.render("home", {
      title: "Sporter - Event Olahraga Indonesia",
      featuredEvents,
      latestEvents,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
