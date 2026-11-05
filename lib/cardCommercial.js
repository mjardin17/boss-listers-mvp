// lib/cardCommercial.js
// Turns the card vault's inventory feed into a commercial script. Only cards that are identified
// (needsReview false) are used, each card's title is the caption, and the front image is the visual.
// The script never carries a price: the price belongs to the live listing, not to a guess.

function buildCardCommercial(feedRows, options = {}) {
  const ready = (feedRows || []).filter((row) => row && row.needsReview === false && row.frontImage);
  if (ready.length === 0) return { scenes: [], audio: { volume_levels: { music: 0.3 } } };
  const scenes = [{ type: "title", duration: 3, text: options.title || "Listed now", product_images: [ready[0].frontImage] }];
  for (const row of ready) {
    scenes.push({
      type: "product_showcase",
      duration: 4,
      caption: row.title,
      product_images: [row.frontImage],
      motion: "1",
    });
  }
  scenes.push({ type: "product_loop", duration: 3, product_images: [ready[0].frontImage], caption: options.closing || "Ask about these today." });
  return { scenes, audio: { volume_levels: { music: 0.3 } } };
}

module.exports = { buildCardCommercial };
