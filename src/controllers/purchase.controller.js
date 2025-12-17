// src/controllers/purchase.controller.js
const db = require('../config/db');

exports.buyTicket = async (req, res) => {
    if (!req.session.user) {
        req.flash('error', 'Silakan login untuk membeli tiket.');
        return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    const userId = req.session.user.id;
    const { ticket_type_id, quantity = 1 } = req.body;
    const qty = Math.max(1, Number(quantity));

    const conn = await db.getConnection(); // mysql2 pool connection
    try {
        await conn.beginTransaction();

        // lock the ticket_type row for update
        const [ttRows] = await conn.query('SELECT * FROM ticket_types WHERE id = ? FOR UPDATE', [ticket_type_id]);
        if (ttRows.length === 0) throw new Error('Ticket type tidak ditemukan.');
        const tt = ttRows[0];
        // ambil sport slug untuk redirect
        const [[sportRow]] = await conn.query(
            `SELECT s.slug
            FROM sports s
            JOIN matches m ON m.sport_id = s.id
            WHERE m.id = ?`,
            [tt.match_id]
        );

        if (!sportRow) {
            throw new Error('Sport tidak ditemukan.');
        }
        
        // determine related start time (event or match)
        let startTime = null;
        if (tt.match_id) {
            const [mRows] = await conn.query('SELECT start_time FROM matches WHERE id = ? LIMIT 1', [tt.match_id]);
            if (mRows.length) startTime = mRows[0].start_time;
        } else if (tt.event_id) {
            const [eRows] = await conn.query('SELECT start_date FROM events WHERE id = ? LIMIT 1', [tt.event_id]);
            if (eRows.length) startTime = eRows[0].start_date;
        }

        // check start_time > now
        if (startTime) {
            const now = new Date();
            if (new Date(startTime) <= now) {
                throw new Error('Jadwal sudah lewat. Tidak bisa membeli tiket.');
            }
        }

        // check quota
        const available = tt.quota - tt.sold;
        if (available < qty) {
            throw new Error('Tiket tidak cukup tersedia.');
        }
        if (tt.max_per_user && qty > tt.max_per_user) {
            throw new Error(`Maksimal ${tt.max_per_user} tiket per akun.`);
        }
        const [[row]] = await conn.query(`
        SELECT COALESCE(SUM(oi.quantity), 0) AS bought
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ?
            AND oi.ticket_type_id = ?
        `, [userId, ticket_type_id]);

        if (tt.max_per_user && row.bought + qty > tt.max_per_user) {
            throw new Error('Limit pembelian tiket telah tercapai.');
        }

        // create order
        const total = parseFloat(tt.price || 0) * qty;
        const [orderRes] = await conn.query('INSERT INTO orders (user_id, total_amount, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [userId, total, 'paid']); // mark paid for now
        const orderId = orderRes.insertId;

        // insert order_items and tickets
        const [itemRes] = await conn.query('INSERT INTO order_items (order_id, ticket_type_id, quantity, price, created_at) VALUES (?, ?, ?, ?, NOW())', [orderId, ticket_type_id, qty, tt.price]);
        const orderItemId = itemRes.insertId;

        // create tickets rows (generate codes)
        const ticketInserts = [];
        for (let i = 0; i < qty; i++) {
            const code = `TCKT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
            ticketInserts.push([orderItemId, code, null, 'valid', new Date(), new Date()]);
        }
        if (ticketInserts.length) {
            await conn.query('INSERT INTO tickets (order_item_id, ticket_code, holder_name, status, created_at, updated_at) VALUES ?', [ticketInserts]);
        }

        // update sold counter
        await conn.query('UPDATE ticket_types SET sold = sold + ? WHERE id = ?', [qty, ticket_type_id]);

        await conn.commit();
        req.flash('success', 'Pembelian berhasil. Tiket telah dikirim/tersedia.');
        return res.redirect('/orders/' + orderId);
    } catch (err) {
        await conn.rollback();
        console.error('buyTicket error', err);
        req.flash('error', err.message || 'Gagal membeli tiket.');
        return res.redirect(req.get('Referer') || '/sports');
    } finally {
        conn.release();
    }
};
