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


function pad(n) { return String(n).padStart(2, '0'); }

function toICSDate(dateStr, timeStr) {
  // kalau timeStr null, set default 09:00
  const t = timeStr ? timeStr.slice(0,5) : '09:00';
  const d = new Date(`${dateStr}T${t}:00`);
  // pakai UTC biar konsisten
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    '00Z'
  );
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

exports.addToGoogleCalendar = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const event = await Event.getBySlugOrId(slugOrId);
    if (!event) return res.status(404).send("Event tidak ditemukan");

    // Google Calendar URL format: dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
    const start = event.start_date ? toICSDate(event.start_date, event.start_time) : null;
    const end = event.end_date
      ? toICSDate(event.end_date, event.end_time || event.start_time)
      : (event.start_date ? toICSDate(event.start_date, event.end_time || event.start_time) : null);

    const text = encodeURIComponent(event.title || 'Event');
    const details = encodeURIComponent(event.description || '');
    const location = encodeURIComponent(event.venue_name || '');
    const dates = (start && end) ? `${start}/${end}` : '';

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&details=${details}&location=${location}${dates ? `&dates=${dates}` : ''}`;

    return res.redirect(url);
  } catch (err) {
    console.error("ERROR addToGoogleCalendar:", err);
    res.status(500).send("Terjadi kesalahan server");
  }
};
