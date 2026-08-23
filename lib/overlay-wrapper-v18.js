const baseHandler = require("./overlay-wrapper-v17.js");

// MikeAircraft Overlay v1.8
// Small ticker pacing refinement:
// - reduce crawl speed from 0.25 to 0.15
// - increase end-of-cycle pause so short LIVE messages do not repeat too often
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v1.7", "Overlay v1.8");

    html = html.replace("const speed=.25;", "const speed=.15;");
    html = html.replace("const leadMs=1400,tailMs=1800;", "const leadMs=1400,tailMs=6500;");

    return originalSend(html);
  };

  return baseHandler(req, res);
};
