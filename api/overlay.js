// MikeAircraft Livestream Overlay v1.0
// Thin API entrypoint; implementation lives under /lib.
// v1.0 uses one sticky CURRENT aircraft and no viewer-facing NEXT aircraft.
module.exports = require("../lib/overlay-wrapper.js");
