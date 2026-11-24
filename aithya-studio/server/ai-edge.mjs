import { studioAI } from "./ai-service.mjs";
import { studioAssist } from "../assist-api.mjs";
import { planningResponse } from "../planning-api.mjs";
import { setupRulebookResponse } from "../setup-rulebook-api.mjs";
import { supabaseUrl, supabasePublishableKey } from "../src/lib/supabase-config.js";
import { json, timedFetch } from "./http.mjs";

export function createStudioAIEdge(env, verify = async authorization => {
  const response = await timedFetch(supabaseUrl + "/auth/v1/user", {
    headers: {authorization, apikey:supabasePublishableKey},
  }, 8000);
  if (!response.ok) return null;
  return response.json();
}) {
  const allowed = new Set((env.STUDIO_ALLOWED_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean));
  const handlers = new Map([
    ["assist", studioAssist],
    ["planning", planningResponse],
    ["setup/rulebook", setupRulebookResponse],
  ]);
  return async request => {
    const origin = request.headers.get("origin");
    if (!origin || !allowed.has(origin)) return json({error:"This workspace origin is not configured."}, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, {status:204, headers:{
        "access-control-allow-origin":origin,
        "access-control-allow-headers":"authorization, apikey, content-type",
        "access-control-allow-methods":"GET, POST, OPTIONS",
        vary:"Origin",
      }});
    }
    if (!["GET","POST"].includes(request.method)) return json({error:"Unsupported request."}, 405);
    const incoming = new URL(request.url);
    const route = incoming.pathname.split("/studio-ai/")[1] || "";
    const handler = handlers.get(route) || (/^ai\/[a-z][a-z0-9_.]{1,50}$/.test(route) ? studioAI : null);
    if (!handler) return json({error:"Unknown AI action."}, 404);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json({error:"Sign in to continue."}, 401);
    try {
      const account = await verify(authorization);
      if (!account?.id) return json({error:"Your session has expired."}, 401);
      const target = new URL("/api/" + route + incoming.search, origin);
      const response = await handler(request, env, target, {id:account.id});
      const headers = new Headers(response.headers);
      headers.set("access-control-allow-origin", origin);
      headers.append("vary", "Origin");
      return new Response(response.body, {status:response.status, headers});
    } catch {
      return json({error:"AI assistance is temporarily unavailable."}, 503);
    }
  };
}
