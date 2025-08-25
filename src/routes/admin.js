import { Router } from 'express';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { ensureAuth, ensureRole, onLoginRecordSession, onManualLogout } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import multer from 'multer';

const admin = Router();
const loginLimiter = rateLimit({ windowMs: 10*60*1000, max: 30 });

// Multer cho import Excel vouchers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ===== Auth =====
admin.get('/login', (req,res)=> res.render('login', { query: req.query }));
admin.post('/login', loginLimiter, passport.authenticate('local', { failureRedirect: '/admin/login?err=1' }), async (req,res)=>{
  await onLoginRecordSession(req);
  res.redirect('/admin');   // sẽ redirect sang /admin/users (xem route dưới)
});

admin.post('/logout', ensureAuth, async (req,res)=>{
  await onManualLogout(req);
  req.logout(()=> res.redirect('/admin/login'));
});

// ===== BỎ hẳn Dashboard: chuyển hướng root sang /users =====
admin.get('/', ensureAuth, (req,res)=> res.redirect('/admin/users'));

// ===== Users =====
admin.get('/users', ensureAuth, ensureRole('super_admin','admin'), async (req,res)=>{
  // Lấy thêm số lần AUTO logout 7 ngày gần nhất cho từng user
  const { rows } = await query(`
    SELECT
      u.id, u.username, u.display_name, u.role, u.is_active, u.created_at,
      COALESCE(l.cnt,0) AS auto_week
    FROM admin_users u
    LEFT JOIN (
      SELECT admin_user_id, COUNT(*) AS cnt
      FROM admin_logout_events
      WHERE at > now()-interval '7 days' AND type='AUTO'
      GROUP BY admin_user_id
    ) l ON l.admin_user_id = u.id
    ORDER BY u.created_at DESC
  `);
  res.render('admin/users', { user:req.user, users: rows });
});

admin.get('/users/:id/auto-logout', ensureAuth, ensureRole('super_admin','admin'), async (req,res)=>{
  // Trang chi tiết thời điểm auto logout 7 ngày gần nhất cho 1 user
  const { rows: urows } = await query('SELECT id, username, display_name FROM admin_users WHERE id=$1', [req.params.id]);
  if (!urows.length) return res.status(404).send('User not found');
  const { rows: events } = await query(
      `SELECT at, type
     FROM admin_logout_events
     WHERE admin_user_id=$1 AND type='AUTO' AND at > now()-interval '7 days'
     ORDER BY at DESC`, [req.params.id]
  );
  res.render('admin/user_auto_logouts', { user:req.user, u: urows[0], events });
});

admin.post('/users', ensureAuth, ensureRole('super_admin','admin'), async (req,res)=>{
  const { username, display_name, role='editor', password } = req.body || {};
  if (!username || !display_name || !password) return res.redirect('/admin/users?err=1');
  const allowedRole = (req.user.role==='admin' && role==='super_admin') ? 'editor' : role;
  const hash = await bcrypt.hash(password, 10);
  await query('INSERT INTO admin_users (username, display_name, password_hash, role, is_active) VALUES ($1,$2,$3,$4,true)',
      [username, display_name, hash, allowedRole]);
  res.redirect('/admin/users');
});
admin.post('/users/:id/toggle', ensureAuth, ensureRole('super_admin','admin'), async (req,res)=>{
  await query('UPDATE admin_users SET is_active = NOT is_active WHERE id=$1', [req.params.id]);
  res.redirect('/admin/users');
});
admin.post('/users/:id/delete', ensureAuth, ensureRole('super_admin'), async (req,res)=>{
  await query("DELETE FROM admin_users WHERE id=$1 AND role <> 'super_admin'", [req.params.id]);
  res.redirect('/admin/users');
});

// ================== Customers ==================
function maskPhone(p){ return p ? p.replace(/(\d{3})\d+(\d{2})$/, '$1****$2') : ''; }

admin.get('/customers', ensureAuth, async (req,res)=>{
  const { q='', province='', shared='', from='', to='', page='1', size='20' } = req.query || {};
  const pg = Math.max(parseInt(page,10)||1, 1);
  const sz = [10,20,50,100].includes(parseInt(size,10)) ? parseInt(size,10) : 20;
  const offset = (pg - 1) * sz;

  const where = []; const params = []; let i = 1;
  if (q)        { where.push(`(LOWER(name) LIKE LOWER($${i}) OR phone LIKE $${i})`); params.push(`%${q}%`); i++; }
  if (province) { where.push(`province = $${i}`); params.push(province); i++; }
  if (shared==='1' || shared==='0') { where.push(`shared_fb = $${i}`); params.push(shared==='1'); i++; }
  if (from)     { where.push(`created_at >= $${i}`); params.push(new Date(`${from}T00:00:00Z`)); i++; }
  if (to)       { where.push(`created_at <= $${i}`); params.push(new Date(`${to}T23:59:59.999Z`)); i++; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: cntRows } = await query(`SELECT COUNT(*)::int AS n FROM customers ${whereSql}`, params);
  const total = cntRows[0].n;
  const totalPages = Math.max(Math.ceil(total / sz), 1);

  const pageSql = `
    SELECT id, name, phone, province, shared_fb, created_at
    FROM customers
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${i} OFFSET $${i+1}
  `;
  const { rows } = await query(pageSql, [...params, sz, offset]);
  const masked = rows.map(r => ({ ...r, phone_mask: (req.user.role==='editor') ? maskPhone(r.phone) : r.phone }));

  const { rows: provs } = await query(`SELECT DISTINCT province FROM customers WHERE province IS NOT NULL AND province <> '' ORDER BY 1`);
  res.render('admin/customers', {
    user: req.user,
    customers: masked,
    total, totalPages, page: pg, size: sz,
    q, province, shared, from, to,
    provinces: provs.map(p => p.province)
  });
});

admin.get('/customers/:id/reveal-phone', ensureAuth, ensureRole('editor','admin','super_admin'), async (req,res)=>{
  const { rows } = await query('SELECT phone FROM customers WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json({ phone: rows[0].phone });
});

admin.get('/customers/export.xlsx', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { q='', province='', shared='', from='', to='' } = req.query || {};
  const where = []; const params = []; let i = 1;
  if (q)        { where.push(`(LOWER(name) LIKE LOWER($${i}) OR phone LIKE $${i})`); params.push(`%${q}%`); i++; }
  if (province) { where.push(`province = $${i}`); params.push(province); i++; }
  if (shared==='1' || shared==='0') { where.push(`shared_fb = $${i}`); params.push(shared==='1'); i++; }
  if (from)     { where.push(`created_at >= $${i}`); params.push(new Date(`${from}T00:00:00Z`)); i++; }
  if (to)       { where.push(`created_at <= $${i}`); params.push(new Date(`${to}T23:59:59.999Z`)); i++; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(`
    SELECT created_at, name, phone, province, shared_fb
    FROM customers
    ${whereSql}
    ORDER BY created_at DESC
  `, params);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.addRow(['time','name','phone','province','shared_fb']);
  for (const r of rows) ws.addRow([r.created_at?.toISOString?.()||'', r.name||'', r.phone||'', r.province||'', r.shared_fb ? 1 : 0]);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="customers.xlsx"');
  await wb.xlsx.write(res); res.end();
});

// ================== Segments ==================
admin.get('/segments', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { rows: wheels } = await query('SELECT id, version, is_active, created_at FROM wheels ORDER BY created_at DESC');
  let wheelId = wheels[0]?.id;
  if (!wheelId) {
    const v = 'v'+Date.now();
    const w = await query('INSERT INTO wheels (version, is_active) VALUES ($1,false) RETURNING id,version', [v]);
    wheelId = w.rows[0].id;
  }
  const { rows: segs } = await query('SELECT * FROM wheel_segments WHERE wheel_id=$1 ORDER BY idx ASC', [wheelId]);
  res.render('admin/segments', { user:req.user, wheels, segs });
});
admin.post('/segments/save', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { wheel_id, segments } = req.body || {};
  const arr = Array.isArray(segments) ? segments : [];
  if (arr.length !== 10) return res.status(400).send('Need exactly 10 segments');
  const sum = arr.reduce((a,s)=>a+parseInt(s.weight||0,10),0);
  if (sum !== 100) return res.status(400).send('Weights must sum to 100');
  for (const s of arr) {
    if (s.id) {
      await query('UPDATE wheel_segments SET idx=$2, label=$3, color=$4, weight=$5 WHERE id=$1',
          [s.id, s.idx, s.label, s.color||null, s.weight]);
    } else {
      await query('INSERT INTO wheel_segments (wheel_id, idx, label, color, weight) VALUES ($1,$2,$3,$4,$5)',
          [wheel_id, s.idx, s.label, s.color||null, s.weight]);
    }
  }
  res.redirect('/admin/segments');
});
admin.post('/segments/activate', ensureAuth, ensureRole('super_admin'), async (req,res)=>{
  const { wheel_id } = req.body || {};
  const { rows: segs } = await query('SELECT weight FROM wheel_segments WHERE wheel_id=$1', [wheel_id]);
  if (segs.length !== 10 || segs.reduce((a,s)=>a+s.weight,0) !== 100) return res.status(400).send('Wheel invalid');
  await query('UPDATE wheels SET is_active=false');
  await query('UPDATE wheels SET is_active=true WHERE id=$1', [wheel_id]);
  res.redirect('/admin/segments');
});

// ================== Vouchers ==================
// Template (đặt TRƯỚC route :segmentId để không bị nuốt route)
admin.get('/vouchers/template.xlsx', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('template');
  ws.addRow(['code']);
  ws.addRow(['ABC123']);
  ws.addRow(['XYZ789']);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="voucher_template.xlsx"');
  await wb.xlsx.write(res); res.end();
});

admin.get('/vouchers/:segmentId', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { rows: seg } = await query('SELECT * FROM wheel_segments WHERE id=$1', [req.params.segmentId]);
  const { rows: v }  = await query('SELECT * FROM vouchers WHERE segment_id=$1 ORDER BY created_at DESC LIMIT 200', [req.params.segmentId]);
  res.render('admin/vouchers', { user:req.user, seg: seg[0], vouchers: v });
});

admin.post('/vouchers/:segmentId/import-excel',
    ensureAuth, ensureRole('admin','super_admin'), upload.single('file'),
    async (req,res)=>{
      if (!req.file) return res.status(400).send('No file uploaded');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).send('Invalid workbook');

      const seen = new Set(); const codes = [];
      ws.eachRow((row, rowNumber) => {
        const val = String(row.getCell(1).value ?? '').trim();
        if (!val) return;
        if (rowNumber === 1 && val.toLowerCase() === 'code') return; // skip header
        if (seen.has(val)) return;
        seen.add(val); codes.push(val);
      });

      for (const code of codes) {
        try {
          await query(
              'INSERT INTO vouchers (segment_id, code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING',
              [req.params.segmentId, code]
          );
        } catch {}
      }
      res.redirect(`/admin/vouchers/${req.params.segmentId}`);
    }
);

admin.post('/vouchers/:segmentId/:voucherId/delete',
    ensureAuth, ensureRole('admin','super_admin'),
    async (req,res)=>{
      const { voucherId, segmentId } = req.params;
      await query('DELETE FROM vouchers WHERE id=$1', [voucherId]);
      res.redirect(`/admin/vouchers/${segmentId}`);
    }
);

// ===== Export spins.xlsx =====
admin.get('/export/spins.xlsx', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { rows } = await query(`SELECT s.created_at, c.name, c.phone, c.province, s.label_snap, s.index_hit
                                FROM spins s LEFT JOIN customers c ON c.id=s.customer_id
                                ORDER BY s.created_at DESC LIMIT 10000`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Spins');
  ws.addRow(['time','name','phone','province','prize','index']);
  for (const r of rows) ws.addRow([r.created_at?.toISOString?.()||'', r.name||'', r.phone||'', r.province||'', r.label_snap||'', r.index_hit||0]);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="spins.xlsx"');
  await wb.xlsx.write(res); res.end();
});

export default admin;
