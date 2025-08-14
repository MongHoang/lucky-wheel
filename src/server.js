import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// serve static (trang web 1 trang)
app.use(express.static(path.join(__dirname, "..", "public")));

const seedPath = path.join(__dirname, "..", "config", "wheel.json");
const loadSeed = () => JSON.parse(fs.readFileSync(seedPath, "utf-8"));

// GET /api/wheel -> trả public info (id, label) để client vẽ
app.get("/api/wheel", (_req, res) => {
  const seed = loadSeed();
  const publicSlices = seed.slices.map(({ id, label }) => ({ id, label }));
  res.json({ version: seed.version, slices: publicSlices });
});

// POST /api/spin -> chọn theo trọng số (POC, chưa lock tồn kho/credit)
app.post("/api/spin", (_req, res) => {
  const seed = loadSeed();
  const weights = seed.slices.map(s => s.weight ?? 1);
  const index = pickWeighted(weights);
  const slice = seed.slices[index];
  res.json({ index, sliceId: slice.id, label: slice.label });
});

function pickWeighted(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 http://localhost:${port}`);
});
