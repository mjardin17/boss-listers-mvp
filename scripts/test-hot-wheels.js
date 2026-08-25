/* eslint-disable no-console */
const { detectHotWheels } = require("../lib/imageHeuristics");

const cases = [
  ["hot", "wheels", "premium", "car", "culture", "nissan", "skyline"],
  ["hotwheels", "super", "treasure", "hunt"],
  ["sony", "mdr", "7506"]
];

for (const tokens of cases) {
  console.log(tokens.join(" "), "=>", detectHotWheels(tokens));
}
