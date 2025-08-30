// src/server.js — production with CSP disabled
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import methodOverride from "method-override";
import ejsMate from "ejs-mate";

// Sessions/Auth/DB
import session from "express-session";
import pgSession from "connect-pg-simple";
import passport, { seedSuperAdmin } from "./auth.js";
import { pool } from "./db.js";

// Routers
import publicApi from "./routes/public_api.js";  // <-- dùng router hợp nhất /api/*
import adminRoutes from "./routes/admin.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===== Views (EJS + ejs-mate) =====
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// ===== Core middlewares =====
app.set("trust proxy", 1);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));                  // parse JSON bodies
app.use(express.urlencoded({ extended: true }));          // parse form bodies
app.use(methodOverride("_method"));

// ===== Helmet (CSP OFF in production per your request) =====
app.use(helmet({ contentSecurityPolicy: false }));

// ===== Session + Passport (store session in Postgres) =====
const PgStore = pgSession(session);
const maxAgeMs = (parseInt(process.env.SESSION_MAX_AGE_MIN || "30", 10)) * 60 * 1000;

app.use(
    session({
        store: new PgStore({ pool, tableName: "session", createTableIfMissing: true }),
        name: "sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production", // secure cookie in prod
            httpOnly: true,
            sameSite: "lax",
            maxAge: maxAgeMs,
        },
        rolling: true, // refresh cookie on activity (idle timeout)
    })
);

app.use(passport.initialize());
app.use(passport.session());

// ===== Serve FE static =====
const STATIC_DIR = process.env.STATIC_DIR
    ? path.resolve(__dirname, "..", process.env.STATIC_DIR)
    : path.join(__dirname, "..", "public");

app.use(express.static(STATIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

// ===== Public API (wheel, spin, notify-win, register, share) =====
app.use(publicApi); // /api/wheel, /api/spin, /api/notify-win, /api/register, /api/share

// ===== Admin UI (EJS + AdminLTE) =====
app.use("/admin", adminRoutes);

// ===== Start server =====
const port = process.env.PORT || 3000;
app.listen(port, async () => {
    await seedSuperAdmin(); // create default super admin from .env if missing
    console.log(`🌐 http://localhost:${port}`);
    console.log(`   FE static: ${STATIC_DIR}`);
});
