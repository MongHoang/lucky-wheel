// src/routes/public_api.js
import { Router } from 'express';
import { query } from '../db.js';
import { randomUUID } from 'crypto';
const api = Router();

/* ===================== Helpers ===================== */
async function getActiveWheelWithSegments() {
  const { rows: wheels } = await query(
      'SELECT id FROM wheels WHERE is_active=true ORDER BY created_at DESC LIMIT 1'
  );
  if (!wheels.length) return { wheelId: null, segments: [] };
  const wheelId = wheels[0].id;
  const { rows: segs } = await query(`
    SELECT id, idx, label, color, weight, requires_code
    FROM wheel_segments
    WHERE wheel_id=$1
    ORDER BY idx ASC
  `, [wheelId]);
  return { wheelId, segments: segs };
}

async function upsertCustomer({ name = '', phone = '', province = '' }) {
  if (!phone) return null;
  const { rows: ex } = await query('SELECT id FROM customers WHERE phone=$1 LIMIT 1', [phone]);
  if (ex.length) {
    await query(`
      UPDATE customers
         SET name = COALESCE(NULLIF($2,''), name),
             province = COALESCE(NULLIF($3,''), province)
       WHERE id=$1
    `, [ex[0].id, name, province]);
    return ex[0].id;
  }
  const { rows: ins } = await query(
      'INSERT INTO customers (name, phone, province) VALUES ($1,$2,$3) RETURNING id',
      [name, phone, province]
  );
  return ins[0].id;
}

function pickIndexByWeight(segments) {
  const weights = segments.map(s => Number(s.weight || 0));
  const total = weights.reduce((a,b)=>a+b,0);
  if (total <= 0) return Math.floor(Math.random()*segments.length);
  let r = Math.random()*total;
  for (let i=0; i<weights.length; i++) { if ((r -= weights[i]) < 0) return i; }
  return segments.length-1;
}

async function assignVoucherToCustomer(segmentId, customerId) {
  const { rows: v } = await query(`
    SELECT id, code
    FROM vouchers
    WHERE segment_id=$1
      AND (status IS NULL OR LOWER(status) IN ('', 'new', 'available'))
      AND (assigned_to IS NULL OR assigned_to::text = '')
    ORDER BY id
    LIMIT 1
  `, [segmentId]);

  if (!v.length) return null;

  const voucherId = v[0].id;
  await query(`
    UPDATE vouchers
       SET assigned_to=$1, status='assigned', assigned_at=now()
     WHERE id=$2
  `, [customerId, voucherId]);

  return { id: voucherId, code: v[0].code };
}

async function sendSmsEsms({ to, content }) {
  const API_KEY = process.env.E_SMS_API_KEY;
  const SECRET  = process.env.E_SMS_SECRET_KEY;
  const BRAND   = process.env.E_SMS_BRANDNAME;
  const SANDBOX = /^1|true$/i.test(process.env.E_SMS_SANDBOX || '');
  if (!API_KEY || !SECRET || !to || !content) {
    return { ok:false, error:'missing-config-or-params' };
  }
  const url = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';
  const payload = {
    ApiKey: API_KEY, SecretKey: SECRET, Brandname: BRAND,
    SmsType: 2, IsUnicode: 0, Sandbox: SANDBOX ? 1 : 0,
    Phone: to, Content: content
  };
  try {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const data = await r.json().catch(()=> ({}));
    if (String(data?.CodeResult) === '100') {
      return { ok:true, smsId: data.SMSID || data?.SMSID || null, raw: data };
    }
    return { ok:false, error: data?.ErrorMessage || data?.CodeResult || 'send-failed', raw: data };
  } catch (e) {
    return { ok:false, error: e?.message || 'network-error' };
  }
}

/* ===================== API ===================== */

// Wheel config cho FE (trả label + color để FE ưu tiên color DB, fallback PALETTE)
api.get('/api/wheel', async (_req,res)=>{
  try {
    const { segments } = await getActiveWheelWithSegments();
    if (!segments.length) {
      // fallback đủ 10 lát (giữ cấu trúc có color cho FE)
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
    res.json(segments.map(s => ({ label: s.label, color: s.color || null })));
  } catch {
    res.status(500).json([]);
  }
});

// Đăng ký/ cập nhật khách (giữ từ public.js)
api.post('/api/register', async (req,res)=>{
  const { name, phone, province } = req.body || {};
  if (!name || !phone || !province) return res.status(400).json({ error:'invalid' });
  const up = await query(`
    INSERT INTO customers (name, phone, province)
    VALUES ($1,$2,$3)
    ON CONFLICT (phone) DO UPDATE
      SET name=EXCLUDED.name, province=EXCLUDED.province
    RETURNING id
  `,[name, phone, province]);
  res.json({ ok:true, id: up.rows[0].id });
});

// Đánh dấu share (giữ từ public.js)
api.post('/api/share', async (req,res)=>{
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error:'phone required' });
  const { rows } = await query('SELECT id FROM customers WHERE phone=$1', [phone]);
  if (!rows.length) return res.status(404).json({ error:'not found' });
  await query('UPDATE customers SET shared_fb=true WHERE id=$1', [rows[0].id]);
  await query('INSERT INTO share_events (customer_id) VALUES ($1)', [rows[0].id]);
  res.json({ ok:true });
});

// Spin: chọn index theo trọng số + log  (schema khớp export spins hiện có)
api.post('/api/spin', async (req,res)=>{
  try {
    const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    const ua  = req.headers['user-agent'] || '';
    const name     = (req.body?.name || '').trim();
    const phone    = (req.body?.phone || '').trim();
    const province = (req.body?.province || '').trim();

    const { wheelId, segments } = await getActiveWheelWithSegments();
    if (!wheelId || segments.length !== 10) return res.status(400).json({ error:'wheel-not-ready' });

    const idx = pickIndexByWeight(segments);
    const seg = segments[idx];

    const customerId = phone ? await upsertCustomer({ name, phone, province }) : null;

    await query(`
      INSERT INTO spins (result_id, customer_id, wheel_id, segment_id, index_hit, label_snap, phone_snap, ip, ua)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      randomUUID(),            // $1  result_id
      customerId,              // $2
      wheelId,                 // $3
      seg.id,                  // $4
      idx,                     // $5
      seg.label,               // $6
      phone || null,           // $7
      ip,                      // $8
      ua                       // $9
    ]);

    res.json({ index: idx, label: seg.label });
  } catch {
    res.status(500).json({ error:'spin-failed' });
  }
});

// Notify-win: cấp mã + gửi eSMS (nếu requires_code). Chỉ bắt buộc phone & prize.
api.post('/api/notify-win', async (req,res)=>{
  try {
    const name     = (req.body?.name || '').trim();
    const phone    = (req.body?.phone || '').trim();
    const province = (req.body?.province || '').trim();
    const prize    = (req.body?.prize || '').trim();

    if (!phone || !prize) {
      return res.status(400).json({
        ok:false,
        error:'missing-phone-or-prize',
        details:{ gotPhone:Boolean(phone), gotPrize:Boolean(prize), hint:'POST JSON with Content-Type: application/json' }
      });
    }

    const { wheelId, segments } = await getActiveWheelWithSegments();
    if (!wheelId || !segments.length) return res.status(400).json({ ok:false, error:'wheel-not-ready' });

    const seg = segments.find(s => (s.label || '').trim().toLowerCase() === prize.toLowerCase());
    if (!seg) return res.json({ ok:true, note:'segment-not-found-by-label' });

    const customerId = await upsertCustomer({ name, phone, province });

    if (seg.requires_code) {
      const voucher = await assignVoucherToCustomer(seg.id, customerId);
      if (!voucher) return res.json({ ok:true, note:'no-voucher-available' });

      const content = `Ma voucher cua ban: ${voucher.code}. Ap dung cho ${seg.label}. Cam on ban da tham gia!`;
      const smsRes = await sendSmsEsms({ to: phone, content });
      if (smsRes.ok && smsRes.smsId) {
        await query('UPDATE vouchers SET sms_id=$1 WHERE id=$2', [String(smsRes.smsId), voucher.id]);
      }
      return res.json({ ok:true, voucher: voucher.code, sms: smsRes });
    }

    // Lát không yêu cầu mã
    return res.json({ ok:true, note:'prize-without-code' });
  } catch {
    res.status(500).json({ ok:false, error:'notify-failed' });
  }
});

export default api;
