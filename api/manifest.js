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
    prefer_related_applications: false,
    background_color: "#050d16",
    theme_color: "#06111d",
    icons: [
      {
        src: "/mikeaircraft-192.webp",
        sizes: "192x192",
        type: "image/webp",
        purpose: "any"
      },
      {
        src: "/mikeaircraft-512.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "maskable"
      }
    ]
  });
};
