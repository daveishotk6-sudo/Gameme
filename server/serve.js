const http = require("http");
const fs = require("fs");
const path = require("path");
const { createAccounts } = require("./accounts");

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

const accounts = createAccounts();
if (process.env.RENDER && !process.env.DATA_DIR) {
  console.warn(
    "[accounts] WARNING: running on Render without DATA_DIR. Render's filesystem is wiped on every redeploy/restart " +
      "unless a persistent disk is attached, which would delete every account. Attach a disk and set DATA_DIR (see README).",
  );
}
console.log(`[accounts] ${accounts.userCount()} account(s) loaded from ${accounts.dataFile}`);

const server = http.createServer(async (req, res) => {
  try {
    if (await accounts.handle(req, res)) return;
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
    return;
  }

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

// Render/Railway send SIGTERM on redeploy: make sure pending account changes reach the disk first.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    console.log(sig + ": saving accounts and shutting down");
    server.close();
    try {
      await accounts.flush();
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });
}
