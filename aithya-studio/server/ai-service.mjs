import { assistContracts } from "../src/assist-contract.js";
import { studioAssist } from "../assist-api.mjs";
import { planningResponse } from "../planning-api.mjs";
import { setupRulebookResponse } from "../setup-rulebook-api.mjs";
import { json } from "./http.mjs";

const assistCapabilities = {
  brief_from_text: "problem.summary",
  requirements_extract: "rules.extract",
  plan_to_tasks: "tasks.plan",
  standup_digest: "standup.merge",
  mentor_chat: "mentor",
  skill_extract: "skills.normalize",
};

export function studioAI(request, env, url, user) {
  if (request.method !== "POST") return json({ error: "Use POST to request an AI draft." }, 405);
  const capability = url.pathname.slice("/api/ai/".length);
  if (capability === "rulebook_extract") return setupRulebookResponse(request, env, url, user);
  if (capability === "plan_generate") return planningResponse(request, env, url, user);
  const task = Object.hasOwn(assistCapabilities, capability) ? assistCapabilities[capability] : capability;
  if (!Object.hasOwn(assistContracts, task) || task === "direct.summary")
    return json({ error: "This AI capability is unavailable." }, 404);
  return studioAssist(request, env, url, user, task);
}
