// Zero-dependency static server for local development: `npm start` → http://localhost:5173
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const port = Number(process.env.PORT) || 5173;

http.createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/") || p === "") p = join(p, "index.html");
    const body = await readFile(join(root, p));
    res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`PrivyLens → http://localhost:${port}`));
