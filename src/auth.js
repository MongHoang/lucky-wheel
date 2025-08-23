import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { query } from './db.js';

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await query(
        'SELECT id, username, display_name, role, is_active FROM admin_users WHERE id=$1',
        [id]
    );
    done(null, rows[0] || false);
  } catch (e) { done(e); }
});

passport.use(new LocalStrategy(
    { usernameField: 'username', passwordField: 'password' },
    async (username, password, done) => {
      try {
        const { rows } = await query(
            'SELECT * FROM admin_users WHERE username=$1',
            [username]
        );
        const user = rows[0];
        if (!user) return done(null, false, { message: 'Sai thông tin đăng nhập' });
        if (!user.is_active) return done(null, false, { message: 'Tài khoản đã bị khóa' });
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return done(null, false, { message: 'Sai thông tin đăng nhập' });
        return done(null, user);
      } catch (e) { return done(e); }
    }
));

export async function seedSuperAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const pass  = process.env.ADMIN_PASSWORD;
  const name  = process.env.ADMIN_DISPLAY_NAME || 'Super Admin';
  if (!username || !pass) return;

  const { rows } = await query('SELECT id FROM admin_users WHERE username=$1', [username]);
  if (rows.length) return; // đã có

  const hash = await bcrypt.hash(pass, 10);
  await query(
      `INSERT INTO admin_users (username, display_name, password_hash, role, is_active)
     VALUES ($1,$2,$3,'super_admin', true)`,
      [username, name, hash]
  );
  console.log('✓ Seeded super admin:', username);
}

export default passport;
