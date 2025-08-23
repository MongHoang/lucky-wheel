-- Requires UUID generator
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','admin','editor')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session tracking (for auto-logout stats)
CREATE TABLE IF NOT EXISTS admin_session_state (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  sid         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  logged_out_at TIMESTAMPTZ,
  UNIQUE (sid)
);

CREATE TABLE IF NOT EXISTS admin_logout_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('AUTO','MANUAL')),
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT UNIQUE NOT NULL,
  province   TEXT NOT NULL,
  shared_fb  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wheel versions
CREATE TABLE IF NOT EXISTS wheels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version    TEXT UNIQUE NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Segments (10 total, weights sum to 100)
CREATE TABLE IF NOT EXISTS wheel_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id      UUID NOT NULL REFERENCES wheels(id) ON DELETE CASCADE,
  idx           INT  NOT NULL CHECK (idx BETWEEN 0 AND 9),
  label         TEXT NOT NULL,
  color         TEXT,
  weight        INT  NOT NULL CHECK (weight >= 0),
  requires_code BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wheel_id, idx)
);

-- Vouchers
CREATE TABLE IF NOT EXISTS vouchers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id  UUID NOT NULL REFERENCES wheel_segments(id) ON DELETE CASCADE,
  code        TEXT UNIQUE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('available','assigned','sent')) DEFAULT 'available',
  assigned_to UUID REFERENCES customers(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  sms_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spins
CREATE TABLE IF NOT EXISTS spins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id   TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  wheel_id    UUID REFERENCES wheels(id) ON DELETE SET NULL,
  segment_id  UUID REFERENCES wheel_segments(id) ON DELETE SET NULL,
  index_hit   INT NOT NULL,
  label_snap  TEXT NOT NULL,
  phone_snap  TEXT,
  ip          INET,
  ua          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Share events
CREATE TABLE IF NOT EXISTS share_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
