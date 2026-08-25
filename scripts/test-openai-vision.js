/* eslint-disable no-console */
const { parseVisionPayload } = require("../lib/openaiVision");

const cases = [
  '{"itemTitle":"Hot Wheels Nissan Skyline","brand":"Hot Wheels","category":"toys","condition":"New","keyDetails":["carded","premium die-cast"],"quantity":"single item","resaleLow":12,"resaleSuggested":18,"resaleHigh":24,"shippingNotes":"Small boxed collectible","upc":"194735123456","productLine":"Car Culture","itemNumber":"HKC28","variant":"Nissan Skyline","edition":"Premium","demand":"high","sellThrough":"fast","bestMatches":[{"name":"Hot Wheels Nissan Skyline","brand":"Hot Wheels","confidence":0.93}],"confidence":0.93,"summary":"Carded die-cast car visible."}',
  '```json\n{"itemTitle":"MDR-7506","brand":"Sony","category":"electronics","condition":"Used","keyDetails":["studio headphones","coiled cable"],"quantity":"single item","resaleLow":55,"resaleSuggested":70,"resaleHigh":85,"shippingNotes":"Compact electronics item","bestMatches":[{"name":"MDR-7506","brand":"Sony","confidence":0.82}],"confidence":0.82,"summary":"Headphones and model label visible."}\n```',
  "not json"
];

for (const value of cases) {
  console.log(parseVisionPayload(value));
}
