/* eslint-disable no-console */
const { parseVisionPayload } = require("../lib/openaiVision");

const cases = [
  '{"productName":"Hot Wheels Nissan Skyline","brand":"Hot Wheels","category":"toys","conditionGuess":"New","quantity":"single item","confidence":0.93,"summary":"Carded die-cast car visible."}',
  '```json\n{"productName":"MDR-7506","brand":"Sony","category":"electronics","conditionGuess":"Used","quantity":"single item","confidence":0.82,"summary":"Headphones and model label visible."}\n```',
  "not json"
];

for (const value of cases) {
  console.log(parseVisionPayload(value));
}
