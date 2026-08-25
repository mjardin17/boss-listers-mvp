/* eslint-disable no-console */
const {
  buildQuery,
  deriveCompsSignals,
  summarizePriceRange
} = require("../lib/compsIntelligence");

console.log(buildQuery({ brand: "Hot Wheels", model: "Nissan Skyline", categoryHint: "toys" }));
console.log(summarizePriceRange([10, 12, 14, 18, 22, 24, 30]));
console.log(
  deriveCompsSignals({
    active: { count: 80 },
    sold: { count: 20, soldWithinDays: 30 }
  })
);
