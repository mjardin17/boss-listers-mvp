// Shared by the browser pages and the server poster (no server imports here).
// A post goes live only when the request carries confirmLive === LIVE_CONFIRM.
const LIVE_CONFIRM = "PUBLISH_LIVE";
module.exports = { LIVE_CONFIRM };
