const db = require('../config/db');

exports.renderOrderDetail = async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Silakan login.');
        return res.redirect('/login');
    }

    const orderId = Number(req.params.id);
    const userId = req.session.user.id;

    const [[order]] = await db.query(
        'SELECT * FROM orders WHERE id = ? AND user_id = ?',
        [orderId, userId]
    );
    if (!order) return res.status(404).send('Order tidak ditemukan');

    const [tickets] = await db.query(
        `SELECT t.id, t.ticket_code, t.holder_name
     FROM tickets t
     JOIN order_items oi ON oi.id = t.order_item_id
     WHERE oi.order_id = ?`,
        [orderId]
    );

    res.render('orders/detail', {
        order,
        tickets,
        qrDemo: '/images/qr-demo.png' // DEMO
    });
};

exports.saveTicketHolders = async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Silakan login.');
        return res.redirect('/login');
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const orderId = Number(req.params.id);
        const names = req.body.names || [];

        // simpan nama
        for (const t of names) {
            if (!t.name || !t.ticket_id) continue;
            await conn.query(
                'UPDATE tickets SET holder_name = ? WHERE id = ?',
                [t.name.trim(), t.ticket_id]
            );
        }

        // ambil ticket_type + qty
        const [[row]] = await conn.query(`
      SELECT oi.ticket_type_id, SUM(oi.quantity) qty
      FROM order_items oi
      WHERE oi.order_id = ?
      GROUP BY oi.ticket_type_id
    `, [orderId]);

        // 🔥 SEKARANG BARU UPDATE SOLD
        await conn.query(
            'UPDATE ticket_types SET sold = sold + ? WHERE id = ?',
            [row.qty, row.ticket_type_id]
        );

        await conn.commit();

        req.flash('success', 'Tiket berhasil dikonfirmasi.');
        return res.redirect('/sports');

    } catch (err) {
        await conn.rollback();
        req.flash('error', err.message);
        return res.redirect('back');
    } finally {
        conn.release();
    }
};
