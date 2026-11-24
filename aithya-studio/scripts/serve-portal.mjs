import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("public-vercel");
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8",
  ".png": "image/png", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const portArgument = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (portArgument > 0 && process.argv[portArgument + 1]) || 4173);
createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const asset = resolve(root, path === "/" || path === "/shared" ? "index.html" : "." + path);
  if (path.startsWith("/api/")) {
    response.writeHead(503, {"content-type":"application/json"}).end(JSON.stringify({error:"This local preview serves static assets. Use the hosted runtime for integrations."}));
    return;
  }
  if (!asset.startsWith(root + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(asset);
    response.writeHead(200, { "content-type": types[extname(asset)] || "application/octet-stream" }).end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "0.0.0.0", () => console.log("Drafdeck is listening on port " + port));
