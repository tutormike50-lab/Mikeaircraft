// MikeAircraft Livestream Overlay v0.9
// Thin API entrypoint; implementation lives under /lib so it does not consume
// an extra Serverless Function slot on the Vercel Hobby plan.
module.exports = require("../lib/overlay-wrapper.js");
