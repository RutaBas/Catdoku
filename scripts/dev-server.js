// Minimal static file server for manual browser verification only — not part
// of the shipped app (no backend, per the spec). Not used by production code.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8934;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  // The win card's video and its poster. Without a real video/mp4 type the
  // fallthrough serves application/octet-stream, which Safari refuses to play —
  // and the result card would silently drop to the still, making a working
  // animation look broken on the one browser this game is mostly played in.
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
};

http
  .createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const filePath = path.join(ROOT, decodeURIComponent(urlPath));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
