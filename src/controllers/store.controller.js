const db = require("../config/db");

exports.listProducts = async (req, res) => {
    const [products] = await db.query(`
    SELECT m.id, m.name, m.price, m.image_url, m.stock, u.name AS seller_name
    FROM merchandises m
    JOIN users u ON u.id = m.seller_id
    WHERE m.status = 'active' AND m.stock > 0
    ORDER BY m.created_at DESC
  `);

    res.render("store/index", {
        title: "Store",
        products,
        currentUser: req.session.user,
        currentPage: "store"
    });
};

exports.productDetail = async (req, res) => {
    const id = Number(req.params.id);

    const [[product]] = await db.query(`
    SELECT m.*, u.name AS seller_name
    FROM merchandises m
    JOIN users u ON u.id = m.seller_id
    WHERE m.id = ? AND m.status = 'active'
    LIMIT 1
  `, [id]);

    if (!product) return res.redirect("/store");

    res.render("store/detail", {
        title: product.name,
        product,
        currentUser: req.session.user
    });
};
