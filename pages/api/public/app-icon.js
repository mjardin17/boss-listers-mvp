// GET /api/public/app-icon — the 1024px Boss Listers icon with CORS open,
// so marketplace developer portals can pull it for app listings.
import fs from "fs";
import path from "path";

export default function handler(req, res) {
  const file = fs.readFileSync(path.join(process.cwd(), "public", "icon-1024.png"));
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(file);
}
