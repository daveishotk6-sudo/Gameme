/**
 * GET/POST /api/reset/:room
 * Deletes that room's permanent map on Holder and returns a page that
 * clears this browser's local world cache for the room.
 */
const HOLDER =
  process.env.HOLDER_URL || "https://holder-production.up.railway.app";

function safeRoom(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48) || "world";
}

async function wipeHolder(room) {
  const url = `${HOLDER.replace(/\/$/, "")}/api/worlds/${encodeURIComponent(room)}`;
  const r = await fetch(url, { method: "DELETE" });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

module.exports = async function handler(req, res) {
  const room = safeRoom(req.query.room);
  if (!room) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "missing room" }));
    return;
  }

  let holder;
  try {
    holder = await wipeHolder(room);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err.message || err), room }));
    return;
  }

  const accept = String(req.headers.accept || "");
  const wantHtml = accept.includes("text/html") || req.method === "GET";

  if (wantHtml) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Reset ${room}</title>
<style>
  body{font:15px system-ui,sans-serif;background:#0a0a0c;color:#e4e4e7;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{background:#18181b;border:1px solid #3f3f46;border-radius:12px;padding:24px 28px;max-width:420px}
  code{background:#27272a;padding:2px 6px;border-radius:4px}
  a{color:#a78bfa}
</style></head><body>
<div class="card">
  <h1>World reset</h1>
  <p>Room <code>${room}</code> map deleted on Holder.</p>
  <p id="local">Clearing this browser’s local cache…</p>
  <p><a href="/">Back to Gameme</a></p>
</div>
<script>
(function () {
  var room = ${JSON.stringify(room)};
  var keys = [
    "gameme:save:v1:room-" + room,
    "gameme:edits:" + room,
    "gameme:ghosts:" + room
  ];
  try {
    for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
    // Also clear any slot variants
    for (var j = localStorage.length - 1; j >= 0; j--) {
      var k = localStorage.key(j);
      if (!k) continue;
      if (k.indexOf("gameme:save:") === 0 && k.indexOf(room) !== -1) localStorage.removeItem(k);
      if (k.indexOf("gameme:edits:") === 0 && k.indexOf(room) !== -1) localStorage.removeItem(k);
      if (k.indexOf("gameme:ghosts:") === 0 && k.indexOf(room) !== -1) localStorage.removeItem(k);
    }
    document.getElementById("local").textContent = "Local cache cleared for this browser.";
  } catch (e) {
    document.getElementById("local").textContent = "Could not clear localStorage: " + e;
  }
})();
</script>
</body></html>`);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, room, holder }));
};
