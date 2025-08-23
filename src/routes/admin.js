import { Router } from 'express';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { ensureAuth, ensureRole, onLoginRecordSession, onManualLogout } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';

const admin = Router();
const loginLimiter = rateLimit({ windowMs: 10*60*1000, max: 30 });

// Login pages
admin.get('/login', (req,res)=> res.render('login', { query: req.query }));
admin.post('/login', loginLimiter, passport.authenticate('local', { failureRedirect: '/admin/login?err=1' }), async (req,res)=>{
  await onLoginRecordSession(req);
  res.redirect('/admin');
});

admin.post('/logout', ensureAuth, async (req,res)=>{
  await onManualLogout(req);
  req.logout(()=> res.redirect('/admin/login'));
});

// Dashboard
admin.get('/', ensureAuth, async (req,res)=>{
  const { rows: stats } = await query(`SELECT
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM spins) AS spins,
    (SELECT COUNT(*) FROM vouchers WHERE status='available') AS vouchers_left,
    (SELECT COUNT(*) FROM admin_logout_events WHERE at > now()-interval '7 days' AND type='AUTO') AS auto_logout_week
  `);
  res.render('admin/dashboard', { user:req.user, stats: stats[0] });
});

// Users
admin.get('/users', ensureAuth, ensureRole('super_admin','admin'), async (req,res)=>{
  const { rows } = await query('SELECT id, username, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at DESC');

  res.render('admin/users', { user:req.user, users: rows });
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

// Customers
function maskPhone(p){ return p ? p.replace(/(\d{3})\d+(\d{2})$/, '$1****$2') : ''; }
admin.get('/customers', ensureAuth, async (req,res)=>{
  const { rows } = await query('SELECT id, name, phone, province, shared_fb, created_at FROM customers ORDER BY created_at DESC LIMIT 500');
  const masked = rows.map(r => ({...r, phone_mask: (req.user.role==='editor') ? maskPhone(r.phone) : r.phone }));
  res.render('admin/customers', { user:req.user, customers: masked });
});
admin.get('/customers/:id/reveal-phone', ensureAuth, ensureRole('editor','admin','super_admin'), async (req,res)=>{
  const { rows } = await query('SELECT phone FROM customers WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json({ phone: rows[0].phone });
});

// Segments (10, sum 100)
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

// Vouchers: textarea import only (no export vouchers)
admin.get('/vouchers/:segmentId', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const { rows: seg } = await query('SELECT * FROM wheel_segments WHERE id=$1', [req.params.segmentId]);
  const { rows: v } = await query('SELECT * FROM vouchers WHERE segment_id=$1 ORDER BY created_at DESC LIMIT 200', [req.params.segmentId]);
  res.render('admin/vouchers', { user:req.user, seg: seg[0], vouchers: v });
});
admin.post('/vouchers/:segmentId/import', ensureAuth, ensureRole('admin','super_admin'), async (req,res)=>{
  const lines = (req.body?.codes||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  for (const code of lines) {
    try { await query('INSERT INTO vouchers (segment_id, code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING', [req.params.segmentId, code]); } catch {}
  }
  res.redirect(`/admin/vouchers/${req.params.segmentId}`);
});

// Export spins.xlsx (no voucher export)
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
