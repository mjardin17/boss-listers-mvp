const fs = require('fs');

const items = JSON.parse(fs.readFileSync('./_real_inventory.json', 'utf8'));

// Category/subcategory mapping — keyword-based, using ONLY real values
// confirmed from Whatnot's own template (Values tab + Condition Dropdown
// tab), screenshotted 2026-08-19. Items that don't clearly match anything
// fall to a flagged default so they're easy to find and fix as drafts.
function categorize(title) {
  const t = title.toLowerCase();

  if (/pokemon|pokémon|tcg|yugioh|yu-gi-oh|magic the gathering|\bmtg\b/.test(t)) {
    return { category: 'Trading Card Games', subCategory: 'Pokemon', flagged: false };
  }
  if (/\brookie\b|\brc\b|topps|bowman|panini|score #|hof\b/.test(t)) {
    return { category: 'Sports Cards', subCategory: 'Football', flagged: false };
  }
  if (/transformers|optimus|primal|autobot|decepticon/.test(t)) {
    return { category: 'Action Figures', subCategory: 'Transformers Figures', flagged: false };
  }
  if (/hasbro|action figure|marvel|star wars|dragon ball|mandalorian|wwe|wrestling/.test(t)) {
    return { category: 'Action Figures', subCategory: 'Other Action Figures', flagged: false };
  }
  if (/hot wheels|matchbox|die-?cast|1:64|1:32|1:43/.test(t)) {
    return { category: 'Toys & Hobbies', subCategory: 'Diecast & Toy Vehicles', flagged: true };
  }
  if (/squishmallow|plush|stuffed animal|beanie/.test(t)) {
    return { category: 'Toys & Hobbies', subCategory: 'Plush', flagged: true };
  }
  if (/lip stain|lip liner|lip gloss|lip oil|lip balm/.test(t)) {
    return { category: 'Beauty', subCategory: 'Makeup & Skincare', flagged: false };
  }
  if (/cleanser|toner|moisturiz|lotion|body butter|serum|exfoliat|scrub|niacinamide/.test(t)) {
    return { category: 'Beauty', subCategory: 'Makeup & Skincare', flagged: false };
  }
  if (/nike|jordan|sneaker|athletic shoes/.test(t)) {
    return { category: 'Sneakers & Streetwear', subCategory: '', flagged: true };
  }
  if (/little people|littlest pet shop|gabby|fisher-price/.test(t)) {
    return { category: 'Toys & Hobbies', subCategory: 'Other Toys', flagged: true };
  }
  return { category: 'Toys & Hobbies', subCategory: 'Other Toys', flagged: true };
}

// Condition mapping from real Condition Dropdown values:
// Graded, New, Mint, Near Mint, Light Played, Moderately Played, Heavily Played, Damaged
function mapCondition(ebayCondition, category) {
  if (category === 'Sports Cards' || category === 'Trading Card Games') {
    return 'Near Mint'; // safest default for ungraded singles; Josh can correct per-card
  }
  return 'New';
}

// Shipping profile — from real Values tab weight tiers.
function shippingProfile(category) {
  if (category === 'Sports Cards' || category === 'Trading Card Games') return 'Sports singles (3oz)';
  if (category === 'Action Figures') return '12-15 oz'; // per Josh: figures run 12-14oz+
  if (category === 'Toys & Hobbies') return '12-15 oz';
  if (category === 'Beauty') return '4-7 oz';
  return '8-11 oz';
}

const header = ['Category', 'Sub Category', 'Title', 'Description', 'Quantity', 'Type', 'Price', 'Shipping Profile', 'Condition', 'Image URL 1'];

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const rows = [header.map(csvEscape).join(',')];
let flaggedCount = 0;

for (const item of items) {
  const { category, subCategory, flagged } = categorize(item.title);
  if (flagged) flaggedCount++;
  const condition = mapCondition(item.condition, category);
  const shipping = shippingProfile(category);
  const row = [
    category,
    subCategory,
    item.title.slice(0, 80),
    item.title,
    1,
    'Fixed Price',
    item.price,
    shipping,
    condition,
    item.image_url,
  ];
  rows.push(row.map(csvEscape).join(','));
}

fs.writeFileSync('./whatnot_import.csv', rows.join('\n'));
console.log(`Wrote whatnot_import.csv: ${items.length} rows, ${flaggedCount} flagged as low-confidence category (review these in Whatnot before publishing)`);
