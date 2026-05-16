/* eslint-disable no-console */
const { parseVisionPayload } = require("../lib/openaiVision");

const cases = [
  '{"productName":"Hot Wheels Nissan Skyline","brand":"Hot Wheels"}',
  '```json\n{"productName":"MDR-7506","brand":"Sony"}\n```',
  "not json"
];

for (const value of cases) {
  console.log(parseVisionPayload(value));
}
