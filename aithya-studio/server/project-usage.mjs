import { dailyLimits } from "./quota.mjs";
import { json, timedFetch } from "./http.mjs";
import { supabasePublishableKey, supabaseUrl } from "../src/lib/supabase-config.js";
import { projectGeminiKey, uuidPattern } from "../planning-api.mjs";

export async function projectUsage(request, env, url, account) {
  const id = url.searchParams.get("project")?.toLowerCase();
  if (!uuidPattern.test(id || "")) return json({error:"Choose a project."}, 400);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({error:"Sign in again."}, 401);
  try {
    const membership = new URLSearchParams({project_id:"eq." + id, user_id:"eq." + account.id, status:"eq.accepted", select:"id", limit:"1"});
    const access = await timedFetch(supabaseUrl + "/rest/v1/project_members?" + membership, {
      headers:{authorization, apikey:supabasePublishableKey},
    });
    if (!access.ok) return json({error:"Project access could not be checked."}, access.status);
    if (!(await access.json()).length) return json({error:"Project unavailable."}, 404);
    const day = new Date().toISOString().slice(0,10);
    const [key, member, team] = await Promise.all([
      projectGeminiKey(env, id),
      env.DB.prepare("SELECT attempts FROM planning_rate WHERE account_id=? AND day=?").bind("assist-user:" + account.id, day).first(),
      env.DB.prepare("SELECT attempts FROM planning_rate WHERE account_id=? AND day=?").bind("assist-project:" + id, day).first(),
    ]);
    return json({configured:Boolean(key), resetsAt:new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString(), remaining:Math.max(0, Math.min(
      dailyLimits.assistUser - Number(member?.attempts || 0),
      dailyLimits.assistProject - Number(team?.attempts || 0),
    ))});
  } catch {
    return json({error:"Usage is temporarily unavailable."}, 503);
  }
}
