#!/usr/bin/env node
/**
 * Test the AI image analyzer with White Castle shorts
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic.default();

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  AI IMAGE ANALYZER TEST: White Castle Shorts                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('📸 Reading image...\n');
    const imagePath = '/c/Users/jjard/.claude/uploads/8249f1ca-0d20-4d06-b0a3-8fad6e4feeea/e6d80722-image.jpg';
    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');
    console.log(`✓ Image loaded (${imageData.length} bytes)\n`);

    console.log('🤖 Analyzing with Claude vision...\n');
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64,
              },
            },
            {
              type: "text",
              text: `Analyze this product image and extract ALL product information visible on the label/packaging.

Return ONLY a JSON object with these fields (use null for missing info):
{
  "title": "Product name/title",
  "brand": "Brand name",
  "sku": "SKU or product code",
  "upc": "UPC/Barcode number",
  "price": "Price if visible (as number)",
  "description": "Product description from label",
  "materials": "Material composition (e.g., 95% Polyester 5% Spandex)",
  "care_instructions": "Laundry/care instructions",
  "sizes": {
    "XS": "24-25",
    "S": "26-27",
    "M": "28-29",
    "L": "30-32",
    "XL": "33-35"
  },
  "origin": "Made in... (country)",
  "features": ["feature1", "feature2"],
  "quantity_per_package": "1PK, 2PK, etc"
}

IMPORTANT: Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent) {
      throw new Error("No text response from Claude");
    }

    console.log('✓ Analysis complete!\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const productData = JSON.parse(textContent.text);
    console.log('EXTRACTED PRODUCT DATA:\n');
    console.log(JSON.stringify(productData, null, 2));

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('\n✓ AI Brain is working!');
    console.log('✓ Photo → Extracted data → Ready to push to platforms\n');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
})();
