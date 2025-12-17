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

    const orderId = Number(req.params.id);
    const names = req.body.names || [];

    for (const t of names) {
        if (!t.name || !t.ticket_id) continue;

        await db.query(
            'UPDATE tickets SET holder_name = ? WHERE id = ?',
            [t.name.trim(), t.ticket_id]
        );
    }

    // ambil sport slug dari order
    const [[row]] = await db.query(`
    SELECT s.slug
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN ticket_types tt ON tt.id = oi.ticket_type_id
    JOIN matches m ON m.id = tt.match_id
    JOIN sports s ON s.id = m.sport_id
    WHERE o.id = ?
    LIMIT 1
  `, [orderId]);

    req.flash('success', 'Nama pemegang tiket disimpan.');
    return res.redirect('/sports/' + row.slug);
};
