//src/controllers/seller.controller.js
const db = require("../config/db");

/**
 * SELLER DASHBOARD
 * route: GET /seller
 */
exports.dashboard = async (req, res) => {
    try {
        const sellerId = req.session.user.id;

        // ===== STATS =====
        const [[cProducts]] = await db.query(
            `SELECT COUNT(*) AS total FROM merchandises WHERE seller_id = ?`,
            [sellerId]
        );

        const [[cOrders]] = await db.query(
            `
      SELECT COUNT(DISTINCT mo.id) AS total
      FROM merchandise_orders mo
      JOIN merchandise_order_items moi ON moi.order_id = mo.id
      JOIN merchandises m ON m.id = moi.merchandise_id
      WHERE m.seller_id = ?
      `,
            [sellerId]
        );

        const [[cPaidOrders]] = await db.query(
            `
      SELECT COUNT(DISTINCT mo.id) AS total
      FROM merchandise_orders mo
      JOIN merchandise_order_items moi ON moi.order_id = mo.id
      JOIN merchandises m ON m.id = moi.merchandise_id
      WHERE m.seller_id = ? AND mo.status = 'paid'
      `,
            [sellerId]
        );

        const [[cActiveStock]] = await db.query(
            `
      SELECT IFNULL(SUM(stock),0) AS total
      FROM merchandises
      WHERE seller_id = ? AND status = 'active'
      `,
            [sellerId]
        );

        const stats = {
            products: cProducts.total,
            orders: cOrders.total,
            paidOrders: cPaidOrders.total,
            activeStock: cActiveStock.total
        };

        // ===== RECENT MERCHANDISE =====
        const [merchandises] = await db.query(`
        SELECT 
            m.id,
            m.name,
            m.price,
            m.stock,
            m.status,
            s.name AS sport_name,
            (
            SELECT mi.image_url
            FROM merchandise_images mi
            WHERE mi.merchandise_id = m.id
            ORDER BY mi.id ASC
            LIMIT 1
            ) AS image_url
        FROM merchandises m
        LEFT JOIN sports s ON s.id = m.sport_id
        WHERE m.seller_id = ?
        ORDER BY m.created_at DESC
        LIMIT 5
        `, [sellerId]);

        // ===== RECENT ORDERS =====
        const [orders] = await db.query(
            `
      SELECT DISTINCT mo.id, mo.buyer_name, mo.total, mo.status, mo.created_at
      FROM merchandise_orders mo
      JOIN merchandise_order_items moi ON moi.order_id = mo.id
      JOIN merchandises m ON m.id = moi.merchandise_id
      WHERE m.seller_id = ?
      ORDER BY mo.created_at DESC
      LIMIT 5
      `,
            [sellerId]
        );

        return res.render("seller/dashboard", {
            title: "Seller Dashboard",
            stats,
            merchandises,
            orders,
            currentUser: req.session.user
        });

    } catch (err) {
        console.error("ERROR seller dashboard:", err);
        return res.status(500).send("Gagal memuat seller dashboard");
    }
};

/**
 * LIST MERCHANDISE
 * route: GET /seller/merchandise
 */
exports.listMerchandise = async (req, res) => {
    try {
        const sellerId = req.session.user.id;

        const [rows] = await db.query(
            `
            SELECT
            m.*,
            s.name AS sport_name,
            (
                SELECT mi.image_url
                FROM merchandise_images mi
                WHERE mi.merchandise_id = m.id
                ORDER BY mi.id ASC
                LIMIT 1
            ) AS image_url
            FROM merchandises m
            LEFT JOIN sports s ON s.id = m.sport_id
            WHERE m.seller_id = ?
            ORDER BY m.created_at DESC
            `,
            [sellerId]
        );

        res.render("seller/merchandise/index", {
            title: "Kelola Merchandise",
            merchandises: rows
        });

    } catch (err) {
        console.error("ERROR list merchandise:", err);
        req.flash("error", "Gagal memuat merchandise");
        res.redirect("/seller");
    }
};

/**
 * RENDER CREATE MERCHANDISE
 * route: GET /seller/merchandise/create
 */
exports.renderCreateMerchandise = async (req, res) => {
    try {
        const [sports] = await db.query(
            "SELECT id, name FROM sports ORDER BY name"
        );

        res.render("seller/merchandise/form", {
            title: "Tambah Merchandise",
            mode: "create",
            merchandise: {},
            sports
        });

    } catch (err) {
        console.error("ERROR render create merchandise:", err);
        req.flash("error", "Gagal memuat form");
        res.redirect("/seller/merchandise");
    }
};

/**
 * CREATE MERCHANDISE
 * route: POST /seller/merchandise/create
 */
exports.createMerchandise = async (req, res) => {
    try {
        const sellerId = req.session.user.id;
        const {
            name,
            description,
            price,
            stock,
            status,
            sport_id
        } = req.body;

        if (!req.files || req.files.length === 0) {
            req.flash("error", "Minimal 1 foto wajib diunggah");
            return res.redirect("/seller/merchandise/create");
        }

        if (!name || !price || stock === undefined) {
            req.flash("error", "Nama, harga, dan stok wajib diisi");
            return res.redirect("/seller/merchandise/create");
        }

        const [result] = await db.query(`
            INSERT INTO merchandises
            (seller_id, sport_id, name, description, price, stock, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
            sellerId,
            sport_id || null,
            name,
            description || null,
            price,
            stock,
            status || "active"
        ]);

        const merchandiseId = result.insertId;

        for (const file of req.files) {
            await db.query(`
      INSERT INTO merchandise_images (merchandise_id, image_url)
      VALUES (?, ?)
    `, [
                merchandiseId,
                "/uploads/merchandise/" + file.filename
            ]);
        }

        req.flash("success", "Merchandise berhasil ditambahkan");
        res.redirect("/seller/merchandise");

    } catch (err) {
        console.error("ERROR create merchandise:", err);
        req.flash("error", "Gagal menambahkan merchandise");
        res.redirect("/seller/merchandise/create");
    }
};

/**
 * RENDER EDIT MERCHANDISE
 * route: GET /seller/merchandise/:id/edit
 */
exports.renderEditMerchandise = async (req, res) => {
    try {
        const sellerId = req.session.user.id;
        const id = Number(req.params.id);

        const [[merch]] = await db.query(
            `
      SELECT * FROM merchandises
      WHERE id = ? AND seller_id = ?
      LIMIT 1
      `,
            [id, sellerId]
        );

        if (!merch) {
            req.flash("error", "Merchandise tidak ditemukan");
            return res.redirect("/seller/merchandise");
        }

        const [images] = await db.query(
            "SELECT * FROM merchandise_images WHERE merchandise_id = ?",
            [id]
        );

        const [sports] = await db.query(
            "SELECT id, name FROM sports ORDER BY name"
        );

        res.render("seller/merchandise/form", {
            title: "Edit Merchandise",
            mode: "edit",
            merchandise: merch,
            merchandiseImages: images,
            sports
        });
    } catch (err) {
        console.error("ERROR render edit merchandise:", err);
        req.flash("error", "Gagal memuat form edit");
        res.redirect("/seller/merchandise");
    }
};

/**
 * UPDATE MERCHANDISE
 * route: POST /seller/merchandise/:id/edit
 */
exports.updateMerchandise = async (req, res) => {
    try {
        const sellerId = req.session.user.id;
        const id = Number(req.params.id);

        const {
            name,
            description,
            price,
            stock,
            status,
            sport_id
        } = req.body;

        const [[exists]] = await db.query(
            `SELECT id FROM merchandises WHERE id = ? AND seller_id = ?`,
            [id, sellerId]
        );

        if (!exists) {
            req.flash("error", "Merchandise tidak ditemukan");
            return res.redirect("/seller/merchandise");
        }

        const { delete_images = [] } = req.body;

        if (delete_images.length) {
            const ids = Array.isArray(delete_images)
                ? delete_images
                : [delete_images];

            await db.query(
                `DELETE FROM merchandise_images WHERE id IN (?) AND merchandise_id = ?`,
                [ids, id]
            );
        }

        await db.query(`
            UPDATE merchandises
            SET sport_id=?, name=?, description=?, price=?, stock=?, status=?, updated_at=NOW()
            WHERE id=? AND seller_id=?
            `, [
            sport_id || null,
            name,
            description || null,
            price,
            stock,
            status || "active",
            id,
            sellerId
        ]);

        if (req.files && req.files.length) {
            for (const file of req.files) {
                await db.query(`
          INSERT INTO merchandise_images (merchandise_id, image_url)
          VALUES (?, ?)
        `, [
                    id,
                    "/uploads/merchandise/" + file.filename
                ]);
            }
        }
        req.flash("success", "Merchandise berhasil diperbarui");
        res.redirect("/seller/merchandise");

    } catch (err) {
        console.error("ERROR update merchandise:", err);
        req.flash("error", "Gagal memperbarui merchandise");
        res.redirect("/seller/merchandise");
    }
};

/**
 * DELETE MERCHANDISE
 * route: POST /seller/merchandise/:id/delete
 */
exports.deleteMerchandise = async (req, res) => {
    try {
        const sellerId = req.session.user.id;
        const id = Number(req.params.id);

        await db.query(
            `
      DELETE FROM merchandises
      WHERE id = ? AND seller_id = ?
      `,
            [id, sellerId]
        );

        req.flash("success", "Merchandise dihapus");
        res.redirect("/seller/merchandise");

    } catch (err) {
        console.error("ERROR delete merchandise:", err);
        req.flash("error", "Gagal menghapus merchandise");
        res.redirect("/seller/merchandise");
    }
};

/**
 * LIST ORDERS
 * route: GET /seller/orders
 */
exports.listOrders = async (req, res) => {
    try {
        const sellerId = req.session.user.id;

        const [orders] = await db.query(
            `
      SELECT DISTINCT mo.*
      FROM merchandise_orders mo
      JOIN merchandise_order_items moi ON moi.order_id = mo.id
      JOIN merchandises m ON m.id = moi.merchandise_id
      WHERE m.seller_id = ?
      ORDER BY mo.created_at DESC
      `,
            [sellerId]
        );

        res.render("seller/orders/index", {
            title: "Order Merchandise",
            orders
        });

    } catch (err) {
        console.error("ERROR list orders:", err);
        req.flash("error", "Gagal memuat order");
        res.redirect("/seller");
    }
};

/**
 * UPDATE ORDER STATUS
 * route: POST /seller/orders/:id/status
 */
exports.updateOrderStatus = async (req, res) => {
    try {
        const sellerId = req.session.user.id;
        const orderId = Number(req.params.id);
        const { status } = req.body;

        const allowed = ["paid", "packed", "shipped", "done", "cancelled"];
        if (!allowed.includes(status)) {
            req.flash("error", "Status tidak valid");
            return res.redirect("/seller/orders");
        }

        const [[exists]] = await db.query(
            `
      SELECT mo.id
      FROM merchandise_orders mo
      JOIN merchandise_order_items moi ON moi.order_id = mo.id
      JOIN merchandises m ON m.id = moi.merchandise_id
      WHERE mo.id = ? AND m.seller_id = ?
      LIMIT 1
      `,
            [orderId, sellerId]
        );

        if (!exists) {
            req.flash("error", "Order tidak ditemukan");
            return res.redirect("/seller/orders");
        }

        await db.query(
            `UPDATE merchandise_orders SET status = ? WHERE id = ?`,
            [status, orderId]
        );

        req.flash("success", "Status order diperbarui");
        res.redirect("/seller/orders");

    } catch (err) {
        console.error("ERROR update order status:", err);
        req.flash("error", "Gagal update status order");
        res.redirect("/seller/orders");
    }
};

exports.orderDetailJson = async (req, res) => {
    const sellerId = req.session.user.id;
    const orderId = Number(req.params.id);

    const [[order]] = await db.query(`
    SELECT DISTINCT mo.*
    FROM merchandise_orders mo
    JOIN merchandise_order_items moi ON moi.order_id=mo.id
    JOIN merchandises m ON m.id=moi.merchandise_id
    WHERE mo.id=? AND m.seller_id=?
    LIMIT 1
  `, [orderId, sellerId]);

    if (!order) return res.status(404).json({});

    const [items] = await db.query(`
    SELECT m.name, moi.price, moi.qty
    FROM merchandise_order_items moi
    JOIN merchandises m ON m.id=moi.merchandise_id
    WHERE moi.order_id=?
  `, [orderId]);

    res.json({ ...order, items });
};
