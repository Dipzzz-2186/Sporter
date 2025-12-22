const athleteModel = require('../models/athlete.model');

exports.updateAthlete = async (req, res) => {
  try {
    const id = req.params.id;

    // ambil data lama (buat redirect + optional delete foto lama kalau mau)
    const old = await athleteModel.findById(id);
    if (!old) {
      req.flash?.('error', 'Atlet tidak ditemukan');
      return res.redirect('back');
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
      req.flash?.('error', 'Nama wajib diisi');
      return res.redirect('back');
    }

    // kalau ada upload foto
    if (req.file) {
      payload.photo_url = `/uploads/athletes/${req.file.filename}`;
    }

    await athleteModel.updateById(id, payload);

    req.flash?.('success', 'Profil atlet berhasil diupdate');

    // redirect balik ke halaman athlete show (pakai slug lama / baru)
    const slug = old.slug; // kalau kamu punya field slug
    if (slug) return res.redirect(`/athletes/${slug}`);
    return res.redirect('back');
  } catch (err) {
    console.error(err);
    req.flash?.('error', 'Gagal update atlet');
    return res.redirect('back');
  }
};
