const http = require("http");
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "client", "dist");
const port = Number(process.env.PORT) || 3000;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let raw;
  try {
    raw = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  let file = path.normalize(path.join(dist, raw));
  if (file !== dist && !file.startsWith(dist + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, "index.html");
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Build missing. Run npm run build.");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log("Gameme listening on " + port);
});
