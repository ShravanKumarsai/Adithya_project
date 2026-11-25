const requests = new Map();

export function invalidateProjectUsage(projectId, userId) {
  requests.delete(userId + ":" + encodeURIComponent(projectId));
}

async function check(path, token) {
  const response = await fetch(path, {
    headers: {authorization: "Bearer " + token},
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("Status unavailable");
  return response.json();
}

export async function updateProjectStatus(project, session, ui, view, valid) {
  const projectId = encodeURIComponent(project.id);
  const key = session.user.id + ":" + projectId;
  let entry = requests.get(key);
  if (!entry || entry.expires < Date.now()) {
    if (requests.size >= 20) requests.delete(requests.keys().next().value);
    entry = {expires: Date.now() + 20000, usage: null, sources: null};
    requests.set(key, entry);
  }
  entry.usage ||= check("/api/usage?project=" + projectId, session.access_token)
    .then(data => ({
      usage:data.configured ? "Gemini · " + data.remaining + " left today" : "Gemini · Team key needed",
      needsGeminiKey:data.configured === false,
      usageReset:data.resetsAt ? new Date(data.resetsAt).toLocaleString(undefined,{dateStyle:"short",timeStyle:"short"}) : undefined,
    })).catch(() => ({usage:"AI usage"}));
  if (["Board", "AI plan", "Ship check", "Activity"].includes(view)) {
    entry.sources ||= check("/api/activity?project=" + projectId, session.access_token)
      .then(data => [
        data.repository ? "GitHub · " + data.repository : "GitHub · Unlinked",
        "Vercel · " + (data.deployment?.status || "Unlinked"),
      ].join("  /  "))
      .catch(() => "Repository and deployment status unavailable");
    entry.sources.then(sources => { if (valid()) ui.update({sources}); });
  }
  const usage = await entry.usage;
  if (valid()) ui.update(usage);
}

export async function updateTask(db, task, changes) {
  let query = db.from("project_tasks").update(changes).eq("id", task.id);
  if (task.portal_version != null) query = query.eq("portal_version", task.portal_version);
  const {data, error} = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw Error("This task changed on another device. Refresh before editing it again.");
}
