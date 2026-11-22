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
    '<section id="planning-view"><h2>AI planning</h2><p>Loading the project plan…</p></section>';
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
        ? '<form class="shared-form planning-form" id="generate-plan"><label for="planning-template">Prompt template</label><select name="templateId" id="planning-template">' +
          config.templates
            .map(
              (template) =>
                '<option value="' +
                escape(template.id) +
                '"' +
                (template.id === "project-roadmap" ? " selected" : "") +
                ">" +
                escape(template.name) +
                "</option>",
            )
            .join("") +
          '</select><p id="planning-template-description" class="shared-muted"></p><p>Gemini receives the project name, problem, deadline, deliverables, technologies and mandatory requirement titles.</p>' +
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
          planMarkup(saved.plan, escape)
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
        editPolicy,
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
    const form = view.querySelector("#generate-plan");
    if (!form) return;
    const picker = view.querySelector("#planning-template");
    const describeTemplate = () => {
      view.querySelector("#planning-template-description").textContent =
        config.templates.find((item) => item.id === picker.value)
          ?.description || "";
    };
    picker.onchange = describeTemplate;
    describeTemplate();
    form.onsubmit = async (event) => {
      event.preventDefault();
      const submit = event.submitter;
      const values = new FormData(form);
      const status = view.querySelector("#planning-status");
      submit.disabled = true;
      status.textContent = "Generating a draft…";
      try {
        const draft = await call("/api/planning", "POST", {
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
            const row = await result(
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
            preview.textContent = "";
            view.querySelector("#saved-plan").innerHTML =
              '<h3>Saved plan</h3><p class="compact-info">' +
              escape(draft.model) +
              " · Updated " +
              escape(when(row.updated_at)) +
              "</p>" +
              planMarkup(draft.plan, escape);
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
