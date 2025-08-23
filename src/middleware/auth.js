import { query } from '../db.js';

export function ensureAuth(req, res, next) {
  if (req.isAuthenticated?.()) return next();
  return res.redirect('/admin/login');
}
export function ensureRole(...roles) {
  return (req, res, next) => {
    if (req.isAuthenticated?.() && roles.includes(req.user.role)) return next();
    return res.status(403).send('Forbidden');
  };
}

export async function onLoginRecordSession(req) {
  try {
    const maxAge = parseInt(process.env.SESSION_MAX_AGE_MIN || '30', 10);
    const sid = req.sessionID;
    const expiresAt = new Date(Date.now() + maxAge*60*1000);
    await query(`INSERT INTO admin_logout_events (user_id, type)
                 SELECT user_id, 'AUTO' FROM admin_session_state
                 WHERE user_id=$1 AND expires_at < now() AND logged_out_at IS NULL`, [req.user.id]);
    await query('INSERT INTO admin_session_state (user_id, sid, expires_at) VALUES ($1,$2,$3) ON CONFLICT (sid) DO UPDATE SET expires_at=$3',
      [req.user.id, sid, expiresAt]);
  } catch {}
}
export async function onManualLogout(req) {
  try {
    await query('UPDATE admin_session_state SET logged_out_at=now() WHERE sid=$1', [req.sessionID]);
    await query(
           'INSERT INTO admin_logout_events (user_id, type) VALUES ($1, $2)',
           [req.user?.id || null, 'MANUAL']);
  } catch {}
}
