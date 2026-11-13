// One-off: add the three ebooks to the OWNER tenant's inventory (no file picker).
// Reads .env.local for Supabase and PLATFORM_OWNER_TENANT_ID. Run: node scripts/add-books-inventory.js
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);
Object.assign(process.env, env);
const { uploadPublicImage } = require("../lib/supabaseStorage");
const { publishToInventory } = require("../lib/supabaseInventory");

const STUDIO = "C:/Users/jjard/claude/bookmaker-station/data/storyforge2";
const BOOKS = [
  { sku: "BOOK-CLOCK-EBOOK", title: "The Clock That Stopped (ebook)", slug: "the-clock-that-stopped",
    description: "A village clock stops at midnight, and an eleven-year-old climbs the tower to find out why. Ebook (EPUB and PDF)." },
  { sku: "BOOK-IRON-LEGENDS-EBOOK", title: "Iron Legends: The Council Wakes (ebook)", slug: "iron-legends-the-council-wakes",
    description: "A young pilot named Kael wakes an ancient iron mech, Ironheart, in the desert. The Iron Council has gone silent and calls out from the Spire. General Null leads a fleet and believes humans should serve the machines. Ebook (EPUB and PDF)." },
  { sku: "BOOK-LITTLE-ZEUS-EBOOK", title: "Little Zeus Gets His Thunderbolt (ebook)", slug: "little-zeus-gets-his-thunderbolt",
    description: "Little Zeus, a child god, is handed a thunderbolt that is too powerful for him. He learns that kindness matters more than power when a frightened cloud, Stormy, needs his help. Ebook (EPUB and PDF)." },
];

(async () => {
  const tenantId = env.PLATFORM_OWNER_TENANT_ID;
  if (!tenantId) throw new Error("PLATFORM_OWNER_TENANT_ID missing");
  for (const b of BOOKS) {
    const buf = fs.readFileSync(path.join(STUDIO, b.slug, "covers", "cover_ebook.png"));
    const url = await uploadPublicImage(buf, `${b.sku}.png`, "image/png");
    const rows = await publishToInventory({ sku: b.sku, title: b.title, description: b.description,
      price: 4.99, quantity: 999, imageUrl: url, condition: "New" }, tenantId);
    console.log("added", b.sku, rows ? "ok" : "no row returned");
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
