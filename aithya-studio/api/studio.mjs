import { rulebookLimit } from "../src/lib/rulebook-limits.js";
import worker from "../dist/server/index.js";
import {supabaseUrl, supabasePublishableKey} from "../src/lib/supabase-config.js";
import {DB, storeScanPart, consumeScan} from "../server/vercel-storage.mjs";

const routes = new Set([
  "assist", "github/token", "setup/rulebook", "setup/rulebook/part", "planning", "planning/key", "vercel/token",
  "activity", "profile",
]);
const maxBody = 4 * 1024 * 1024;
const env = {...process.env, DB};
const scanMime = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const json = (error, status) => Response.json({error}, {
  status, headers: {"cache-control":"private, no-store"},
});

async function handle(req) {
  // Vercel rewrites preserve the original query alongside the route parameter.
  const host = req.headers.host;
  const url = new URL(req.url, "https://" + host);
  const route = url.pathname === "/api/studio" ?
    url.searchParams.get("studioRoute") : url.pathname.slice("/api/".length);
  if (!routes.has(route) && !/^ai\/[a-z][a-z0-9_.]{1,50}$/.test(route || "")) return json("Unknown Studio API.", 404);
  url.pathname = "/api/" + route;
  url.searchParams.delete("studioRoute");
  if (!["GET","HEAD"].includes(req.method) && req.headers.origin !== url.origin)
    return json("Open this action from Aithya Studio.", 403);

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "origin", "content-length"]) {
    if (typeof req.headers[name] === "string") headers.set(name, req.headers[name]);
  }
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json("Sign in to Aithya Studio.", 401);
  let identity;
  try {
    identity = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: {apikey:supabasePublishableKey, authorization},
      redirect:"error", signal:AbortSignal.timeout(8000),
    });
  } catch {
    return json("Sign-in verification is temporarily unavailable.", 503);
  }
  if (!identity.ok)
    return json("Your session has expired. Sign in again.", identity.status >= 500 ? 503 : 401);
  const account = await identity.json();
  if (!account.id) return json("Sign in to Aithya Studio.", 401);
  // These values come from Supabase, never from incoming identity headers.
  headers.set("oai-authenticated-user-id", account.id);
  if (account.email) headers.set("oai-authenticated-user-email", account.email);

  const options = {method:req.method, headers};
  if (!["GET","HEAD"].includes(req.method)) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) return json("Choose a file up to 4 MB on this deployment.", 413);
      chunks.push(chunk);
    }
    options.body = Buffer.concat(chunks);
    const scanId = url.searchParams.get("scan");
    if ((route === "setup/rulebook/part" || (route === "setup/rulebook" && scanId)) && req.method === "POST") {
      if (!uuid.test(scanId ?? "") || !scanMime.has(headers.get("content-type")))
        return json("Choose a supported rulebook file.", 400);
      if (!env.GEMINI_SETUP_API_KEY) return json("Gemini scanning needs a setup key.", 503);
      const part = url.searchParams.get("part");
      if (route.endsWith("/part")) {
        if (!["0","1","2"].includes(part) || size < 1 || size > 3 * 1024 * 1024)
          return json("Invalid rulebook upload part.", 400);
        await storeScanPart(account.id, scanId, Number(part), headers.get("content-type"), options.body);
        return new Response(null, {status:204});
      }
      const count = Number(url.searchParams.get("parts"));
      if (![2,3].includes(count)) return json("Incomplete rulebook upload.", 400);
      const rows = await consumeScan(account.id, scanId, headers.get("content-type"));
      if (rows.length !== count || rows.some((row, index) => row.part !== index))
        return json("Incomplete rulebook upload. Choose the file again.", 400);
      options.body = Buffer.concat(rows.map(row => row.bytes));
      if (options.body.length > rulebookLimit) return json("Choose a file up to 8 MB.", 413);
      headers.set("content-length", String(options.body.length));
    }
  }
  return worker.fetch(new Request(url, options), env);
}

export default async function handler(req, res) {
  let response;
  try {
    response = await handle(req);
  } catch {
    response = json("Studio is temporarily unavailable.", 503);
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
