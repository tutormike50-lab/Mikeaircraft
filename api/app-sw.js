module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Service-Worker-Allowed", "/api/");
  return res.status(200).send(
    'self.addEventListener("install",function(){self.skipWaiting()});' +
    'self.addEventListener("activate",function(event){event.waitUntil(self.clients.claim())});' +
    'self.addEventListener("fetch",function(){})'
  );
};

