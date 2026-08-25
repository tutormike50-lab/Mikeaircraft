module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({
    name: "MikeAircraft Operations Hub",
    short_name: "MikeAircraft",
    description: "MikeAircraft control centre",
    id: "/api/hub",
    start_url: "/api/hub",
    scope: "/api/",
    display: "standalone",
    background_color: "#050d16",
    theme_color: "#06111d",
    icons: [
      {
        src: "/api/app-icon",
        sizes: "128x128",
        type: "image/webp",
        purpose: "any"
      },
      {
        src: "/api/app-icon",
        sizes: "128x128",
        type: "image/webp",
        purpose: "maskable"
      }
    ]
  });
};

