// src/controllers/purchase.controller.js
const db = require('../config/db');

// src/controllers/purchase.controller.js
exports.buyTicket = async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Silakan login.');
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const { ticket_type_id, quantity = 1 } = req.body;
    const qty = Math.max(1, Number(quantity));

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [[tt]] = await conn.query(
            'SELECT * FROM ticket_types WHERE id = ?',
            [ticket_type_id]
        );
        if (!tt) throw new Error('Tiket tidak ditemukan.');

        // ❗ hanya validasi waktu & quota kasar
        if (tt.quota - tt.sold < qty) {
            throw new Error('Tiket tidak cukup.');
        }

        // 1️⃣ order
        const total = tt.price * qty;
        const [orderRes] = await conn.query(
            `INSERT INTO orders (user_id, total_amount, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
            [userId, total]
        );
        const orderId = orderRes.insertId;

        // 2️⃣ order_items
        const [itemRes] = await conn.query(
            `INSERT INTO order_items (order_id, ticket_type_id, quantity, price, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
            [orderId, ticket_type_id, qty, tt.price]
        );
        const orderItemId = itemRes.insertId;

        // 3️⃣ tickets (BELUM RESMI)
        const inserts = [];
        for (let i = 0; i < qty; i++) {
            inserts.push([
                orderItemId,
                `TCKT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
                null,
                new Date(),
                new Date()
            ]);
        }

        await conn.query(
            `INSERT INTO tickets (order_item_id, ticket_code, holder_name, created_at, updated_at)
       VALUES ?`,
            [inserts]
        );

        await conn.commit();
        return res.redirect('/orders/' + orderId);

    } catch (err) {
        await conn.rollback();
        req.flash('error', err.message);
        return res.redirect('back');
    } finally {
        conn.release();
    }
};
