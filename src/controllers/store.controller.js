const db = require("../config/db");

exports.listProducts = async (req, res) => {
  const [products] = await db.query(`
    SELECT 
      m.id,
      m.name,
      m.price,
      m.image_url,
      m.stock,
      m.created_at,
      s.id   AS sport_id,
      s.name AS sport_name
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

  res.render("store/detail", {
    title: product.name,
    product,
    currentUser: req.session.user
  });
};
