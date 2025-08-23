import { Router } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';

export const publicRouter = Router();

publicRouter.get('/api/wheel', async (_req, res) => {
  const { rows: wheels } = await query('SELECT id FROM wheels WHERE is_active=true LIMIT 1');
  if (!wheels.length) {
    return res.json([
      { label: 'Voucher 10k', color: '#f94144' },
      { label: 'Chúc may mắn lần sau', color: '#f3722c' },
      { label: 'Voucher 20k', color: '#f8961e' },
      { label: 'Thử lại nhé', color: '#f9844a' },
      { label: 'Voucher 50k', color: '#f9c74f' },
      { label: 'Chúc may mắn lần sau', color: '#90be6d' },
      { label: 'Voucher 100k', color: '#43aa8b' },
      { label: 'Thử lại nhé', color: '#577590' },
      { label: 'Voucher 200k', color: '#277da1' },
      { label: 'Jackpot 🎉', color: '#9d4edd' }
    ]);
  }
  const id = wheels[0].id;
  const { rows: segs } = await query(
      'SELECT label FROM wheel_segments WHERE wheel_id=$1 ORDER BY idx ASC',
      [id]
  );
  res.json(segs.map(s => ({ label: s.label })));
});

publicRouter.post('/api/register', async (req, res) => {
  const { name, phone, province } = req.body || {};
  if (!name || !phone || !province) return res.status(400).json({ error: 'invalid' });
  const up = await query(
      `INSERT INTO customers (name, phone, province)
     VALUES ($1,$2,$3)
     ON CONFLICT (phone) DO UPDATE
       SET name=EXCLUDED.name, province=EXCLUDED.province
     RETURNING id`,
      [name, phone, province]
  );
  res.json({ ok: true, id: up.rows[0].id });
});

publicRouter.post('/api/share', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const { rows } = await query('SELECT id FROM customers WHERE phone=$1', [phone]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  await query('UPDATE customers SET shared_fb=true WHERE id=$1', [rows[0].id]);
  await query('INSERT INTO share_events (customer_id) VALUES ($1)', [rows[0].id]);
  res.json({ ok: true });
});

function pickIndexByWeights(weights) {
  const t = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * t;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

publicRouter.post('/api/spin', async (req, res) => {
  const user = req.body?.user;
  const ip = req.ip;
  const ua = req.get('user-agent');

  const { rows: wheels } = await query('SELECT id FROM wheels WHERE is_active=true LIMIT 1');
  if (!wheels.length) {
    const i = Math.floor(Math.random() * 8);
    return res.json({ index: i, label: 'Try again' });
  }
  const wheelId = wheels[0].id;

  const { rows: segs } = await query(
      'SELECT id, idx, label, weight, requires_code FROM wheel_segments WHERE wheel_id=$1 ORDER BY idx ASC',
      [wheelId]
  );
  if (segs.length !== 10 || segs.reduce((a, s) => a + s.weight, 0) !== 100) {
    return res.status(500).json({ error: 'wheel not ready' });
  }

  let customerId = null;
  let phoneSnap = null;
  if (user?.phone) {
    phoneSnap = user.phone;
    const up = await query(
        `INSERT INTO customers (name, phone, province)
       VALUES ($1,$2,$3)
       ON CONFLICT (phone) DO UPDATE
         SET name=EXCLUDED.name, province=EXCLUDED.province
       RETURNING id`,
        [user.name || '', user.phone, user.province || '']
    );
    customerId = up.rows[0].id;
  }

  const idx = pickIndexByWeights(segs.map(s => s.weight));
  const chosen = segs[idx];
  const result_id = randomUUID();

  await query(
      `INSERT INTO spins (result_id, customer_id, wheel_id, segment_id, index_hit, label_snap, phone_snap, ip, ua)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [result_id, customerId, wheelId, chosen.id, chosen.idx, chosen.label, phoneSnap, ip, ua]
  );

  res.json({ index: chosen.idx, label: chosen.label });
});

publicRouter.post('/api/notify-win', async (req, res) => {
  const { name, phone, province, prize } = req.body || {};
  if (!name || !phone || !province || !prize) return res.status(400).json({ error: 'invalid' });

  const up = await query(
      `INSERT INTO customers (name, phone, province)
     VALUES ($1,$2,$3)
     ON CONFLICT (phone) DO UPDATE
       SET name=EXCLUDED.name, province=EXCLUDED.province
     RETURNING id`,
      [name, phone, province]
  );
  const customerId = up.rows[0].id;

  const { rows: wheels } = await query('SELECT id FROM wheels WHERE is_active=true LIMIT 1');
  if (!wheels.length) return res.json({ ok: true });
  const wheelId = wheels[0].id;

  const { rows: segs } = await query(
      'SELECT id, requires_code FROM wheel_segments WHERE wheel_id=$1 AND label=$2 LIMIT 1',
      [wheelId, prize]
  );
  if (!segs.length) return res.json({ ok: true });
  const seg = segs[0];

  let code = null;
  if (seg.requires_code) {
    // <-- dòng lỗi trước đây, đã đổi sang backticks -->
    const r = await query(
        `
      UPDATE vouchers
         SET status='assigned', assigned_to=$1, assigned_at=now()
       WHERE id IN (
         SELECT id FROM vouchers
          WHERE segment_id=$2 AND status='available'
          LIMIT 1
       )
      RETURNING code
      `,
        [customerId, seg.id]
    );
    if (r.rows.length) {
      code = r.rows[0].code;
      await query(
          'UPDATE vouchers SET status=\'sent\', sms_id=$2 WHERE code=$1',
          [code, 'demo-sms-id']
      );
    }
  }
  res.json({ ok: true, code });
});
