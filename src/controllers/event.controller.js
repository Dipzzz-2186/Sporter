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

function applyComputedStatus(obj) {
  if (!obj) return obj;
  if (obj.computed_status) obj.status = obj.computed_status;
  return obj;
}


// GET /events
exports.listEvents = async (req, res) => {
  try {
    const events = await Event.getAllEvents();

    const mapped = events.map((e) => {
      applyComputedStatus(e);

      return {
        ...e,
        start_date_formatted: formatDate(e.start_date),
        end_date_formatted: formatDate(e.end_date),
      };
    }); 
    res.render("events/index", {
      title: "Daftar Event Olahraga - Sporter",
      events: mapped,
    });
  } catch (err) {
    console.error("ERROR listEvents:", err);
    res.status(500).send("Terjadi kesalahan server");
  }
};

// GET /events/:slugOrId
exports.viewEvent = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const event = await Event.getBySlugOrId(slugOrId);

    if (!event) {
      return res.status(404).render("events/detail", {
        title: "Event Tidak Ditemukan - Sporter",
        event: null,
      });
    }

    applyComputedStatus(event);

    event.start_date_formatted = formatDate(event.start_date);
    event.end_date_formatted = formatDate(event.end_date);

    res.render("events/detail", {
      title: `${event.title} - Sporter`,
      event,
    });
  } catch (err) {
    console.error("ERROR viewEvent:", err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
