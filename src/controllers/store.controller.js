const db = require("../config/db");

exports.listProducts = async (req, res) => {
  const [products] = await db.query(`
  SELECT
    m.id,
    m.name,
    m.price,
    m.stock,
    m.created_at,
    s.id   AS sport_id,
    s.name AS sport_name,
    (
      SELECT mi.image_url
      FROM merchandise_images mi
      WHERE mi.merchandise_id = m.id
      ORDER BY mi.is_primary DESC, mi.id ASC
      LIMIT 1
    ) AS image_url
  FROM merchandises m
  JOIN sports s ON s.id = m.sport_id
  WHERE m.status = 'active'
    AND m.stock > 0
  ORDER BY m.created_at DESC
  `);

  const [sports] = await db.query(`
    SELECT id, name FROM sports ORDER BY name
  `);

  res.render("store/index", {
    title: "Store",
    products,
    sports,              // ⬅️ penting untuk filter dropdown
    currentUser: req.session.user,
    currentPage: "store"
  });
};

exports.productDetail = async (req, res) => {
  const id = Number(req.params.id);

  const [[product]] = await db.query(`
    SELECT 
      m.*,
      s.id   AS sport_id,
      s.name AS sport_name
    FROM merchandises m
    JOIN sports s ON s.id = m.sport_id
    WHERE m.id = ?
      AND m.status = 'active'
    LIMIT 1
  `, [id]);

  if (!product) return res.redirect("/store");

  const [images] = await db.query(`
    SELECT image_url
    FROM merchandise_images
    WHERE merchandise_id = ?
    ORDER BY is_primary DESC, id ASC
  `, [id]);

  res.render("store/detail", {
    title: product.name,
    product,
    images, // ⬅️ kirim semua gambar
    currentUser: req.session.user
  });
};
