const athleteModel = require('../models/athlete.model');

exports.updateAthlete = async (req, res) => {
  try {
    const id = req.params.id;

    const old = await athleteModel.findById(id);
    if (!old) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ ok: false, message: 'Atlet tidak ditemukan' });
      }
      req.flash?.('error', 'Atlet tidak ditemukan');
      return res.redirect(`/athletes/${old.slug}`);
    }

    const payload = {
      name: (req.body.name || '').trim(),
      country_code: (req.body.country_code || '').trim() || null,
      playing_position: (req.body.playing_position || '').trim() || null,
      coach: (req.body.coach || '').trim() || null,
      born_in: (req.body.born_in || '').trim() || null,
      height_cm: req.body.height_cm ? Number(req.body.height_cm) : null,
      bio: (req.body.bio || '').trim() || null,
      titles: req.body.titles ? Number(req.body.titles) : 0,
      race: (req.body.race || '').trim() || null,
      best_rank: (req.body.best_rank || '').trim() || null,
    };

    if (!payload.name) {
      if (req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ ok: false, message: 'Nama wajib diisi' });
      }
      req.flash?.('error', 'Nama wajib diisi');
      return res.redirect(`/athletes/${old.slug}`);
    }

    if (req.file) {
      payload.photo_url = `/uploads/athletes/${req.file.filename}`;
    }

    await athleteModel.updateById(id, payload);

    // =========================
    // ✅ KUNCI UTAMA DI SINI
    // =========================
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ ok: true });
    }

    // fallback (submit biasa, NON modal)
    req.flash?.('success', 'Profil atlet berhasil diupdate');
    return res.redirect(`/athletes/${old.slug}`);

  } catch (err) {
    console.error(err);

    if (req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ ok: false, message: 'Gagal update atlet' });
    }

    req.flash?.('error', 'Gagal update atlet');
    return res.redirect(`/athletes/${old.slug}`);
  }
};
