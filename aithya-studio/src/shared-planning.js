import { skeleton } from "./studio-ui.js";

function planMarkup(plan, escape) {
  const list = (values) =>
    (Array.isArray(values) ? values : [])
      .map((value) => "<li>" + escape(value) + "</li>")
      .join("");
  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
  return (
    '<p class="plan-summary">' +
    escape(plan?.summary) +
    '</p><ol class="plan-phases">' +
    phases
      .map(
        (phase) =>
          "<li><h3>" +
          escape(phase?.title) +
          "</h3><p>" +
          escape(phase?.outcome) +
          "</p><ul>" +
          list(phase?.tasks) +
          "</ul></li>",
      )
      .join("") +
    "</ol>" +
    (plan?.risks?.length
      ? "<h3>Risks to review</h3><ul>" + list(plan.risks) + "</ul>"
      : "")
  );
}

export async function renderPlanning({
  db,
  project,
  leader,
  ai,
  escape,
  when,
  result,
  notify,
  editPolicy,
  requirements,
  tasks,
  refresh,
}) {
  async function call(path, method = "GET", body) {
    const { session } = await result(db.auth.getSession());
    if (!session) throw Error("Sign in to Aithya to continue.");
    const response = await fetch(path, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + session.access_token,
      },
      signal: AbortSignal.timeout(50000),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw Error(payload.error || "Could not complete the Gemini request.");
    return payload;
  }
  const keyPath =
    "/api/planning/key?projectId=" + encodeURIComponent(project.id);
  const canManage = leader && !project.archived_at;
  const container = document.getElementById("shared-content");
  container.innerHTML =
    '<section id="planning-view"><h2>AI planning</h2>' + skeleton("Loading the project plan") + '</section>';
  const view = container.querySelector("#planning-view");
  const open = () => view.isConnected;
  try {
    const [saved, config] = await Promise.all([
      result(
        db
          .from("project_plans")
          .select("plan,model,updated_at")
          .eq("project_id", project.id)
          .maybeSingle(),
      ),
      canManage
        ? call(keyPath).catch((error) => ({ error: error.message }))
        : null,
    ]);
    if (!open()) return;
    const enabled =
      leader &&
      !project.archived_at &&
      ai?.external_ai_apis_allowed &&
      ai?.gemini_planning_allowed &&
      config?.configured;
    const policyNotes = [
      ai?.privacy_restrictions,
      ai?.data_handling,
      ai?.other_requirements,
    ].filter(Boolean);
    const policyReview = policyNotes.length
      ? "<details><summary>Review project restrictions</summary>" +
        policyNotes.map((note) => "<p>" + escape(note) + "</p>").join("") +
        "</details>"
      : "";
    view.innerHTML =
      '<header class="shared-header"><div><h2>AI planning</h2><p class="shared-muted">Draft a phased plan from the project brief and deadlines.</p></div>' +
      (leader && !project.archived_at
        ? '<button class="button subtle" id="planning-policy">Edit AI policy</button>'
        : "") +
      "</header>" +
      (canManage &&
      (!ai?.external_ai_apis_allowed || !ai?.gemini_planning_allowed)
        ? '<p class="shared-note">Enable external APIs and Gemini planning in the project’s AI policy to generate a draft.</p>'
        : "") +
      (config?.error
        ? '<p role="alert">' + escape(config.error) + "</p>"
        : "") +
      (canManage && config && !config.error
        ? '<details class="planning-form"' +
          (config.configured ? "" : " open") +
          "><summary>Project Gemini key · " +
          (config.configured ? "Saved" : "Required") +
          '</summary><form id="project-gemini-key-form" class="shared-form">' +
          '<label for="project-gemini-key">Team Gemini API key</label><input id="project-gemini-key" name="key" type="password" autocomplete="off" required maxlength="256">' +
          '<small>The project leader can replace or remove this key. <a target="_blank" rel="noreferrer" href="https://aistudio.google.com/apikey">Get a key in Google AI Studio</a>.</small>' +
          '<div class="shared-actions"><button class="button primary">' +
          (config.configured ? "Replace key" : "Save key") +
          "</button>" +
          (config.configured
            ? '<button type="button" class="button subtle" id="remove-project-gemini-key">Remove key</button>'
            : "") +
          '</div><p id="project-key-status" role="status"></p></form></details>'
        : "") +
      (enabled
        ? '<form class="shared-form planning-form" id="generate-plan"><fieldset><legend>Plan template</legend><div class="planning-templates">' +
          config.templates.map((template, i) =>
            '<label><input type="radio" name="templateId" value="' + escape(template.id) + '"' + (!i ? ' checked' : '') +
            '><span><strong>' + escape(template.name) + '</strong><small>' + escape(template.description) + '</small></span></label>'
          ).join("") +
          '</div></fieldset><details><summary>What Gemini receives</summary><ul>' +
          ['Project name and problem statement','Submission deadline and deliverables','Technology stack and mandatory requirement titles']
            .map((item) => '<li>' + item + '</li>').join('') + '</ul></details>' +
          policyReview +
          '<label><input name="approved" type="checkbox" required>I have reviewed the project policy and authorize sending these fields to Gemini.</label>' +
          '<button class="button primary">Generate draft</button><p role="status" id="planning-status"></p></form>'
        : "") +
      '<div id="planning-preview"></div><section id="saved-plan">' +
      (saved
        ? '<h3>Saved plan</h3><p class="compact-info">' +
          escape(saved.model) +
          " · Updated " +
          escape(when(saved.updated_at)) +
          "</p>" +
          planMarkup(saved.plan, escape) +
          (canManage ? '<button type="button" class="button subtle" id="plan-to-tasks">Review plan tasks</button><div id="plan-task-review"></div>' : '')
        : '<p class="shared-muted">The team has no saved plan yet.</p>') +
      "</section>";
    const policyButton = view.querySelector("#planning-policy");
    if (policyButton) policyButton.onclick = editPolicy;
    const redraw = () =>
      renderPlanning({
        db,
        project,
        leader,
        ai,
        escape,
        when,
        result,
        notify,
        editPolicy, requirements, tasks, refresh,
      });
    const keyForm = view.querySelector("#project-gemini-key-form");
    if (keyForm)
      keyForm.onsubmit = async (event) => {
        event.preventDefault();
        const submit = event.submitter;
        submit.disabled = true;
        const input = view.querySelector("#project-gemini-key");
        const key = input.value.trim();
        input.value = "";
        try {
          await call(keyPath, "PUT", { key });
          if (open()) await redraw();
          notify("Gemini key saved for this project.");
        } catch (error) {
          view.querySelector("#project-key-status").textContent = error.message;
        } finally {
          submit.disabled = false;
        }
      };
    const remove = view.querySelector("#remove-project-gemini-key");
    if (remove)
      remove.onclick = async () => {
        remove.disabled = true;
        try {
          await call(keyPath, "DELETE");
          if (open()) await redraw();
          notify("Project Gemini key removed.");
        } catch (error) {
          view.querySelector("#project-key-status").textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      };
    const convert = view.querySelector("#plan-to-tasks");
    if (convert) convert.onclick = () => {
      const area = view.querySelector("#plan-task-review");
      const known = new Set(tasks.map((task) => task.title.trim().toLowerCase()));
      const candidates = saved.plan.phases.flatMap((phase) => phase.tasks.map((title) => ({ title, phase:phase.title })))
        .filter((task) => {
          const title = task.title.trim().toLowerCase();
          if (known.has(title)) return false;
          known.add(title);
          return true;
        });
      if (!candidates.length) {
        area.innerHTML = '<p class="shared-muted">Every plan task is already on the board.</p>';
        return;
      }
      const options = '<option value="">No requirement</option>' + requirements.map((r) =>
        '<option value="' + escape(r.id) + '">' + escape(r.title) + '</option>').join("");
      area.innerHTML = '<form class="shared-form"><h3>Choose tasks to add</h3>' +
        candidates.map((entry, i) => '<fieldset><legend>' + escape(entry.phase) + '</legend>' +
          '<label><input type="checkbox" name="include-' + i + '" checked> Include task</label>' +
          '<label>Title <input name="title-' + i + '" maxlength="200" value="' + escape(entry.title.slice(0,200)) + '"></label>' +
          '<label>Requirement <select name="requirement-' + i + '">' + options + '</select></label></fieldset>').join("") +
        '<button class="button primary">Add selected tasks</button><p role="status"></p></form>';
      const ids = candidates.map(() => crypto.randomUUID());
      const review = area.querySelector("form");
      review.onsubmit = async (event) => {
        event.preventDefault();
        const values = new FormData(review);
        const rows = candidates.flatMap((_, i) => {
          if (!values.has("include-" + i)) return [];
          return [{id:ids[i],project_id:project.id,title:values.get("title-" + i).trim(),
            requirement_id:values.get("requirement-" + i) || null}];
        });
        const status = review.querySelector('[role="status"]');
        if (!rows.length || rows.some((task) => !task.title)) {
          status.textContent = "Select at least one task and give each selected task a title.";
          return;
        }
        event.submitter.disabled = true;
        try {
          await result(db.from("project_tasks").insert(rows));
          notify("Added " + rows.length + " tasks to the board.");
          await refresh();
        } catch (error) {
          status.textContent = error.message;
          event.submitter.disabled = false;
        }
      };
    };
    const form = view.querySelector("#generate-plan");
    if (!form) return;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const submit = event.submitter;
      const values = new FormData(form);
      const status = view.querySelector("#planning-status");
      submit.disabled = true;
      status.textContent = "Generating a draft…";
      try {
        const draft = await call("/api/ai/plan_generate", "POST", {
          projectId: project.id,
          approved: values.has("approved"),
          templateId: values.get("templateId"),
        });
        if (!open()) return;
        status.textContent = "Draft ready for review.";
        const preview = view.querySelector("#planning-preview");
        preview.innerHTML =
          '<section class="shared-note"><h3>Review generated draft</h3>' +
          planMarkup(draft.plan, escape) +
          '<button type="button" class="button primary" id="save-generated">' +
          (saved ? "Replace saved plan" : "Save to project") +
          "</button></section>";
        preview.querySelector("#save-generated").onclick = async (event) => {
          const save = event.currentTarget;
          save.disabled = true;
          try {
            await result(
              db
                .from("project_plans")
                .upsert({
                  project_id: project.id,
                  plan: draft.plan,
                  model: draft.model,
                })
                .select("updated_at")
                .single(),
            );
            if (!open()) return;
            await redraw();
            notify("Plan saved for the team.");
          } catch (error) {
            notify(error.message);
            save.disabled = false;
          }
        };
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  } catch (error) {
    if (open()) view.textContent = error.message;
  }
}
