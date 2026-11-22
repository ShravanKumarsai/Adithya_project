import { insightsView } from "./project-insights.js";
import { openRulebookImport } from "./shared-rulebook.js";
import { notifications } from "./shared-notifications.js";
import { renderPlanning } from "./shared-planning.js";
import { renderPortfolio } from "./shared-portfolio.js";
import { supabase as db } from "./lib/supabase.js";

const main = document.getElementById("shared-main");
const dialog = document.getElementById("shared-dialog");
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const button = (id, label, primary = false) =>
  '<button type="button" class="button ' +
  (primary ? "primary" : "subtle") +
  '" id="' +
  id +
  '">' +
  escape(label) +
  "</button>";
const field = (name, label, value = "", type = "text", required = false) =>
  '<label for="f-' +
  name +
  '">' +
  escape(label) +
  '</label><input id="f-' +
  name +
  '" name="' +
  name +
  '" type="' +
  type +
  '" value="' +
  escape(value) +
  '" ' +
  (required ? "required" : "") +
  ' maxlength="4000">';
const area = (name, label, value = "") =>
  '<label for="f-' +
  name +
  '">' +
  escape(label) +
  '</label><textarea id="f-' +
  name +
  '" name="' +
  name +
  '" maxlength="4000">' +
  escape(value) +
  "</textarea>";
const check = (name, label, value = false) =>
  '<label><input type="checkbox" name="' +
  name +
  '" ' +
  (value ? "checked" : "") +
  ">" +
  escape(label) +
  "</label>";
const select = (name, label, options, value) =>
  '<label for="f-' +
  name +
  '">' +
  escape(label) +
  '</label><select name="' +
  name +
  '" id="f-' +
  name +
  '">' +
  options
    .map(
      ([id, text]) =>
        '<option value="' +
        escape(id) +
        '" ' +
        (String(value) === String(id) ? "selected" : "") +
        ">" +
        escape(text) +
        "</option>",
    )
    .join("") +
  "</select>";
const lines = (value) =>
  String(value || "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
const text = (value) => escape(value || "Not entered");
const when = (value) => (value ? new Date(value).toLocaleString() : "—");
const status = (label, complete) =>
  "<li><span>" +
  escape(label) +
  '</span><b class="' +
  (complete ? "complete" : "attention") +
  '">' +
  (complete ? "Complete" : "Needs attention") +
  "</b></li>";
const empty = (label) => '<p class="shared-muted">' + escape(label) + "</p>";
let session,
  project,
  tab = "Overview",
  data = {},
  authMode = "login",
  generation = 0,
  wizard = null;
let saveQueue = Promise.resolve(),
  saveTimer;
let draftChanges = 0,
  savedChanges = 0;
const pendingToken = new URLSearchParams(location.hash.slice(1)).get("invite");
if (pendingToken) {
  sessionStorage.setItem("aithya.shared.invite", pendingToken);
  history.replaceState(null, "", location.pathname);
}
document.getElementById("shared-close").onclick = () => dialog.close();
function notify(message) {
  const target = document.getElementById("notice");
  target.textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (target.textContent = ""), 6000);
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw Error(error.message);
  return data;
}
const rpc = (name, args) => result(db.rpc(name, args));
function errorBox(error) {
  return (
    '<p class="shared-error" role="alert">' +
    escape(error.message || error) +
    "</p>"
  );
}
function bind(id, fn) {
  const node = document.getElementById(id);
  if (!node) return;
  node.onclick = async () => {
    node.disabled = true;
    try {
      await fn();
    } catch (err) {
      notify(err.message);
    } finally {
      node.disabled = false;
    }
  };
}
function modal(title, html, save, afterSave = loadProject) {
  document.getElementById("shared-title").textContent = title;
  document.getElementById("shared-dialog-body").innerHTML =
    '<form id="shared-form" class="shared-form">' +
    html +
    '<div id="modal-error" role="alert"></div><button class="button primary">Save</button></form>';
  if (!dialog.open) dialog.showModal();
  document.getElementById("shared-form").onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.submitter;
    submit.disabled = true;
    try {
      await save(new FormData(e.currentTarget));
      dialog.close();
      await afterSave();
    } catch (err) {
      document.getElementById("modal-error").innerHTML = errorBox(err);
    } finally {
      submit.disabled = false;
    }
  };
}
function confirmAction(title, description, action) {
  modal(
    title,
    "<p>" +
      escape(description) +
      "</p>" +
      check("confirm", "I confirm this action"),
    async (form) => {
      if (!form.has("confirm")) throw Error("Confirm the action to continue.");
      await action();
    },
  );
}
function authScreen() {
  const titles = {
    login: "Welcome back",
    register: "Create your account",
    reset: "Reset your password",
    recover: "Choose a new password",
  };
  main.innerHTML =
    '<section class="auth-panel"><h1>' +
    titles[authMode] +
    '</h1><p class="shared-muted">One Aithya account for all your team projects.</p><form id="auth-form" class="shared-form">' +
    (authMode === "register"
      ? field("name", "Full name", "", "text", true)
      : "") +
    (authMode !== "recover" ? field("email", "Email", "", "email", true) : "") +
    (authMode !== "reset"
      ? field("password", "Password", "", "password", true)
      : "") +
    '<div id="auth-error" role="alert"></div><button class="button primary">' +
    {
      login: "Sign in",
      register: "Create account",
      reset: "Send reset link",
      recover: "Update password",
    }[authMode] +
    "</button></form><nav>" +
    ["login", "register", "reset"]
      .filter((m) => m !== authMode)
      .map((m) =>
        button(
          "auth-" + m,
          { login: "Sign in", register: "Register", reset: "Forgot password?" }[
            m
          ],
        ),
      )
      .join("") +
    "</nav></section>";
  for (const mode of ["login", "register", "reset"])
    bind("auth-" + mode, () => {
      authMode = mode;
      authScreen();
    });
  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    const form = new FormData(e.currentTarget),
      email = String(form.get("email") || "").trim(),
      password = String(form.get("password") || "");
    try {
      if (["register", "recover"].includes(authMode) && password.length < 10)
        throw Error("Use at least 10 characters for your password.");
      if (authMode === "login")
        await result(db.auth.signInWithPassword({ email, password }));
      if (authMode === "register") {
        const response = await result(
          db.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: String(form.get("name")).trim() },
              emailRedirectTo: location.origin + "/shared",
            },
          }),
        );
        if (!response.session)
          notify("Check your email to verify your account, then sign in.");
      }
      if (authMode === "reset") {
        await result(
          db.auth.resetPasswordForEmail(email, {
            redirectTo: location.origin + "/shared",
          }),
        );
        notify("Check your email for the recovery link.");
      }
      if (authMode === "recover") {
        await result(db.auth.updateUser({ password }));
        authMode = "login";
        await workspace();
      }
    } catch (err) {
      document.getElementById("auth-error").innerHTML = errorBox(err);
    } finally {
      if (e.submitter) e.submitter.disabled = false;
    }
  };
}
async function workspace() {
  const version = ++generation;
  project = null;
  wizard = null;
  document.getElementById("account").innerHTML = session
    ? button("signout", "Sign out")
    : "";
  notificationPanel.refresh();
  const portfolioButton = document.getElementById("portfolio-nav");
  portfolioButton.hidden = !session;
  portfolioButton.onclick = async () => {
    if (!session) return;
    if (wizard && draftChanges > savedChanges) {
      try {
        await queueDraft();
      } catch (error) {
        notify(error.message);
        return;
      }
    }
    generation++;
    project = null;
    wizard = null;
    clearTimeout(saveTimer);
    return renderPortfolio({
      db,
      main,
      user: session.user,
      result,
      escape,
      button,
      field,
      area,
      select,
      bind,
      modal,
      notify,
      back: workspace,
    });
  };
  bind("signout", async () => {
    await result(db.auth.signOut());
  });
  if (!session) {
    authScreen();
    return;
  }
  if (sessionStorage.getItem("aithya.shared.invite")) {
    await inviteScreen();
    return;
  }
  main.innerHTML = empty("Loading your projects…");
  try {
    const insights = location.pathname === "/";
    const [projects, drafts, totals] = await Promise.all([
      result(
        db
          .from("projects")
          .select("*")
          .order("updated_at", { ascending: false }),
      ),
      insights ? [] : result(
        db
          .from("project_drafts")
          .select("id,content,revision,updated_at")
          .is("published_project_id", null)
          .order("updated_at", { ascending: false }),
      ),
      insights ? rpc("project_task_totals", {}) : [],
    ]);
    if (version !== generation) return;
    if (insights) {
      main.innerHTML = insightsView(projects, totals, escape);
      bind("refresh-insights", workspace);
      return;
    }
    const requested = new URLSearchParams(location.search).get("project");
    if (requested) {
      history.replaceState(null, "", "/shared");
      const match = projects.find(p => p.id === requested);
      if (match) return openProject(match);
      notify("This project is unavailable for this account.");
    }
    main.innerHTML =
      '<header class="shared-header"><div><h1>Shared projects</h1><p class="shared-muted">Your team work, drafts, and next steps.</p></div>' +
      '<div class="shared-actions">' +
      button("new-project", "Create project", true) +
      button("new-project-from-rules", "Create from rulebook") +
      "</div></header>" +
      (drafts.length
        ? "<section><h2>Continue setup</h2>" +
          drafts
            .map(
              (d) =>
                '<div class="project-entry"><div><b>' +
                escape(d.content.project?.name || "Untitled draft") +
                "</b><p>Saved " +
                when(d.updated_at) +
                "</p></div>" +
                button("draft-" + d.id, "Resume") +
                "</div>",
            )
            .join("") +
          "</section>"
        : "") +
      '<section class="project-list">' +
      projects
        .filter((p) => !p.archived_at)
        .map(projectEntry)
        .join("") +
      (projects.every((p) => p.archived_at)
        ? empty("Create a project or accept an invitation to get started.")
        : "") +
      "</section>" +
      (projects.some((p) => p.archived_at)
        ? "<details><summary>Archived projects</summary>" +
          projects
            .filter((p) => p.archived_at)
            .map(projectEntry)
            .join("") +
          "</details>"
        : "");
    bind("new-project", () => openWizard());
    bind("new-project-from-rules", () => {
      openWizard();
      document.getElementById("import-hackathon-rules").click();
    });
    for (const d of drafts) bind("draft-" + d.id, () => openWizard(d));
    for (const p of projects) bind("project-" + p.id, () => openProject(p));
  } catch (err) {
    main.innerHTML = errorBox(err) + button("retry-workspace", "Retry");
    bind("retry-workspace", workspace);
  }
}
function projectEntry(p) {
  return (
    '<article class="project-entry"><div><h2>' +
    escape(p.name) +
    "</h2><p>" +
    escape(
      [
        p.hackathon_name,
        p.theme,
        p.submission_deadline ? "Due " + p.submission_deadline : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ) +
    "</p></div>" +
    button("project-" + p.id, "Open project") +
    "</article>"
  );
}
async function inviteScreen() {
  main.innerHTML = empty("Checking invitation…");
  try {
    const token = sessionStorage.getItem("aithya.shared.invite");
    const invite = await rpc("accept_member_invitation", {
      p_token: token,
      p_confirm: false,
    });
    main.innerHTML =
      '<section class="auth-panel"><h1>Join ' +
      escape(invite.project_name) +
      "</h1><p>This invitation is for " +
      escape(invite.member_name) +
      ".</p><p>Signed in as " +
      escape(session.user.email) +
      '.</p><form id="claim-form" class="shared-form">' +
      check(
        "confirm",
        "I am the intended teammate and want to join this project.",
      ) +
      '<button class="button primary">Accept invitation</button><div id="claim-error"></div></form>' +
      button("cancel-invite", "Back to projects") +
      "</section>";
    document.getElementById("claim-form").onsubmit = async (e) => {
      e.preventDefault();
      e.submitter.disabled = true;
      try {
        if (!new FormData(e.currentTarget).has("confirm"))
          throw Error("Confirm your identity before joining.");
        await rpc("accept_member_invitation", {
          p_token: token,
          p_confirm: true,
        });
        sessionStorage.removeItem("aithya.shared.invite");
        await workspace();
      } catch (err) {
        document.getElementById("claim-error").innerHTML = errorBox(err);
        e.submitter.disabled = false;
      }
    };
  } catch (err) {
    main.innerHTML =
      errorBox(err) + button("cancel-invite", "Back to projects");
  }
  bind("cancel-invite", () => {
    sessionStorage.removeItem("aithya.shared.invite");
    return workspace();
  });
}
const projectFields = [
  ["name", "Project name"],
  ["hackathon_name", "Hackathon name"],
  ["description", "Description"],
  ["problem_statement", "Problem statement"],
  ["start_date", "Start date"],
  ["submission_deadline", "Submission deadline"],
  ["theme", "Theme"],
  ["repository", "GitHub repository (owner/name)"],
  ["expected_deliverables", "Expected deliverables, one per line"],
  ["technology_stack", "Technology stack, one per line"],
  ["workflow_content", "Existing workflow"],
];
function openWizard(draft) {
  draftChanges = 0;
  savedChanges = 0;
  wizard = draft
    ? structuredClone(draft)
    : {
        id: crypto.randomUUID(),
        revision: 0,
        content: {
          project: {},
          requirements: {},
          ai: {},
          members: [],
          step: 0,
        },
      };
  renderWizard();
}
function renderWizard() {
  const content = wizard.content,
    step = content.step || 0;
  const projectData = content.project || {},
    requirements = content.requirements || {},
    ai = content.ai || {};
  let fields;
  if (step === 0)
    fields = projectFields
      .map(([key, label]) => {
        const value = Array.isArray(projectData[key])
          ? projectData[key].join("\n")
          : projectData[key];
        return [
          "description",
          "problem_statement",
          "expected_deliverables",
          "technology_stack",
          "workflow_content",
        ].includes(key)
          ? area(key, label, value)
          : field(
              key,
              label,
              value,
              key.includes("date") || key === "submission_deadline"
                ? "date"
                : "text",
              key === "name",
            );
      })
      .join("");
  else if (step === 1)
    fields =
      area(
        "judging_criteria",
        "Judging criteria",
        requirements.judging_criteria?.join("\n"),
      ) +
      area(
        "mandatory_requirements",
        "Official requirements",
        requirements.mandatory_requirements?.join("\n"),
      ) +
      area(
        "restrictions",
        "Submission restrictions",
        requirements.restrictions?.join("\n"),
      ) +
      area(
        "permitted_ai_tools",
        "Permitted AI tools",
        ai.permitted_ai_tools?.join("\n"),
      ) +
      area(
        "prohibited_ai_tools",
        "Prohibited AI tools",
        ai.prohibited_ai_tools?.join("\n"),
      ) +
      area(
        "permitted_models",
        "Permitted AI models",
        ai.permitted_models?.join("\n"),
      ) +
      check(
        "external_ai_apis_allowed",
        "External AI APIs allowed",
        ai.external_ai_apis_allowed,
      ) +
      check(
        "ai_generated_code_allowed",
        "AI-generated code allowed",
        ai.ai_generated_code_allowed,
      ) +
      check(
        "ai_generated_research_allowed",
        "AI-generated research allowed",
        ai.ai_generated_research_allowed,
      ) +
      area(
        "privacy_restrictions",
        "Privacy restrictions",
        ai.privacy_restrictions,
      ) +
      area("data_handling", "Data-handling restrictions", ai.data_handling) +
      area(
        "other_requirements",
        "Additional AI instructions",
        ai.other_requirements,
      );
  else
    fields =
      "<p>Your account becomes the project leader. Add teammates and upload rulebooks after creating the project.</p><h2>" +
      escape(projectData.name || "Untitled project") +
      '</h2><ul class="shared-checks">' +
      status("Problem statement", projectData.problem_statement) +
      status("Deadline", projectData.submission_deadline) +
      status("Deliverables", projectData.expected_deliverables?.length) +
      status(
        "Official requirements",
        requirements.mandatory_requirements?.length,
      ) +
      status("Workflow", projectData.workflow_content) +
      '</ul><p class="shared-muted">You can complete missing information after creation.</p>';
  main.innerHTML =
    '<header class="shared-header"><h1>Project setup</h1>' +
    button("close-wizard", "Back to projects") +
    '</header><nav class="wizard-steps">' +
    ["Project brief", "Rules & AI policy", "Review"]
      .map(
        (label, i) =>
          '<button id="step-' +
          i +
          '" aria-current="' +
          (i === step ? "step" : "false") +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    '</nav><form id="wizard-form" class="shared-form"><div class="shared-columns"><section>' +
    fields +
    '</section><section class="draft-info"><h3>Saved as you work</h3><p id="draft-state" role="status">Draft ready</p><p class="shared-muted">Drafts are private to your account. Creating the project makes it available to accepted members.</p></section></div><div id="wizard-error"></div><div class="shared-actions">' +
    button("save-draft", "Save draft") +
    button("wizard-next", step < 2 ? "Continue" : "Create project", true) +
    '</div><p><a href="#import-hackathon-rules" class="text-link" id="import-hackathon-rules">Import hackathon rules</a></p></form>';
  const form = document.getElementById("wizard-form");
  form.onsubmit = (e) => e.preventDefault();
  const collect = () => {
    const values = Object.fromEntries(new FormData(form));
    if (step === 0) {
      content.project = { ...projectData, ...values };
      for (const key of ["expected_deliverables", "technology_stack"])
        content.project[key] = lines(values[key]);
      content.project.workflow_status = values.workflow_content?.trim()
        ? "provided"
        : "requires_generation";
    }
    if (step === 1) {
      content.requirements = Object.fromEntries(
        ["judging_criteria", "mandatory_requirements", "restrictions"].map(
          (key) => [key, lines(values[key])],
        ),
      );
      content.ai = { ...ai, ...values };
      for (const key of [
        "permitted_ai_tools",
        "prohibited_ai_tools",
        "permitted_models",
      ])
        content.ai[key] = lines(values[key]);
      for (const key of [
        "external_ai_apis_allowed",
        "ai_generated_code_allowed",
        "ai_generated_research_allowed",
      ])
        content.ai[key] = values[key] === "on";
    }
  };
  document.getElementById("import-hackathon-rules").onclick = (event) => {
    event.preventDefault();
    collect();
    openRulebookImport({
      dialog,
      draft: content,
      escape,
      onApply: async (labels) => {
        draftChanges++;
        content.step = step === 2 ? 0 : step;
        renderWizard();
        try {
          await queueDraft();
          notify(
            "Filled " +
              labels.length +
              " " +
              (labels.length === 1 ? "field" : "fields") +
              ". Review the setup and fill the remaining blanks.",
          );
        } catch (error) {
          notify(error.message);
        }
        document.getElementById("import-hackathon-rules")?.focus();
      },
    });
  };
  form.addEventListener("input", () => {
    collect();
    draftChanges++;
    clearTimeout(saveTimer);
    document.getElementById("draft-state").textContent = "Unsaved changes…";
    saveTimer = setTimeout(() => queueDraft().catch(() => {}), 700);
  });
  async function move(next) {
    collect();
    await queueDraft();
    content.step = next;
    await queueDraft();
    renderWizard();
  }
  for (let i = 0; i < 3; i++) bind("step-" + i, () => move(i));
  bind("save-draft", () => {
    collect();
    return queueDraft();
  });
  bind("close-wizard", async () => {
    collect();
    await queueDraft();
    await workspace();
  });
  bind("wizard-next", async () => {
    collect();
    const p = content.project;
    if (step === 0) {
      if (!p.name?.trim() || p.name.trim().length < 2)
        throw Error("Enter a project name with at least two characters.");
      if (
        p.start_date &&
        p.submission_deadline &&
        p.start_date > p.submission_deadline
      )
        throw Error("The deadline must follow the start date.");
      if (p.repository && !/^[\w-]+\/[\w.-]+$/.test(p.repository))
        throw Error("Use owner/repository for the GitHub repository.");
    }
    if (step < 2) {
      await move(step + 1);
      return;
    }
    await queueDraft();
    const id = await rpc("publish_project_draft", { p_id: wizard.id });
    notify("Project created. Add your teammates and complete your profile.");
    const pRecord = await result(
      db.from("projects").select("*").eq("id", id).single(),
    );
    await openProject(pRecord);
  });
}
function queueDraft() {
  clearTimeout(saveTimer);
  const target = wizard;
  const snapshot = structuredClone(target.content);
  const capturedChanges = draftChanges;
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      try {
        const saved = await rpc("save_project_draft", {
          p_id: target.id,
          p_content: snapshot,
          p_revision: target.revision,
        });
        target.revision = saved.revision;
        const label = document.getElementById("draft-state");
        if (wizard === target) {
          savedChanges = capturedChanges;
          if (label)
            label.textContent =
              savedChanges === draftChanges
                ? "Saved to your account"
                : "Unsaved changes…";
        }
      } catch (err) {
        const label = document.getElementById("draft-state");
        if (label && wizard === target) label.textContent = err.message;
        throw err;
      }
    });
  return saveQueue;
}
window.addEventListener("beforeunload", (e) => {
  if (wizard && savedChanges < draftChanges) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function openProject(record) {
  project = record;
  wizard = null;
  tab = "Overview";
  await loadProject();
}
async function loadProject() {
  if (!project) {
    await workspace();
    return;
  }
  const version = ++generation,
    id = project.id;
  main.innerHTML = empty("Loading project records…");
  try {
    const queries = [
      ["project", db.from("projects").select("*").eq("id", id).single()],
      [
        "members",
        db
          .from("project_members")
          .select("*")
          .eq("project_id", id)
          .order("created_at"),
      ],
      [
        "requirements",
        db
          .from("requirement_items")
          .select("*")
          .eq("project_id", id)
          .order("created_at"),
      ],
      [
        "rules",
        db
          .from("project_requirements")
          .select("*")
          .eq("project_id", id)
          .maybeSingle(),
      ],
      [
        "ai",
        db
          .from("project_ai_constraints")
          .select("*")
          .eq("project_id", id)
          .maybeSingle(),
      ],
      ["skills", db.from("user_skills").select("*").eq("project_id", id)],
      [
        "availability",
        db.from("member_availability").select("*").eq("project_id", id),
      ],
      [
        "tasks",
        db
          .from("project_tasks")
          .select("*")
          .eq("project_id", id)
          .order("created_at"),
      ],
      [
        "learning",
        db
          .from("learning_goals")
          .select("*")
          .eq("project_id", id)
          .order("created_at"),
      ],
      [
        "documents",
        db
          .from("project_documents")
          .select("*")
          .eq("project_id", id)
          .order("created_at"),
      ],
      [
        "activity",
        db
          .from("project_activity")
          .select("*")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(40),
      ],
    ];
    if (project.leader_id === session.user.id)
      queries.push([
        "invitations",
        db
          .from("invitations")
          .select("id,project_member_id,claim_status,expires_at,created_at")
          .eq("project_id", id)
          .order("created_at", { ascending: false }),
      ]);
    const entries = await Promise.all(
      queries.map(async ([key, query]) => [key, await result(query)]),
    );
    if (version !== generation) return;
    data = Object.fromEntries(entries);
    project = data.project;
    renderProject();
  } catch (err) {
    if (version === generation) {
      main.innerHTML =
        errorBox(err) + button("back-projects", "Back to projects");
      bind("back-projects", workspace);
    }
  }
}
const leader = () => project?.leader_id === session?.user.id;
const memberName = (id) =>
  data.members.find((m) => m.user_id === id)?.full_name || "Unassigned";
function renderProject() {
  const tabs = [
    "Overview",
    "Requirements",
    "Team",
    "Tasks",
    "Planning",
    "Learning",
    "Files",
    "Activity",
    "History",
  ];
  main.innerHTML =
    '<header class="shared-header"><div><p class="compact-info">' +
    escape(project.hackathon_name || "Shared project") +
    "</p><h1>" +
    escape(project.name) +
    '</h1></div><div class="shared-actions">' +
    button("back-projects", "Shared projects") +
    button("refresh-shared", "Refresh") +
    '</div></header><nav class="shared-tabs" role="tablist">' +
    tabs
      .map(
        (t) =>
          '<button role="tab" aria-selected="' +
          (t === tab) +
          '" id="tab-' +
          t +
          '">' +
          t +
          "</button>",
      )
      .join("") +
    '</nav><div id="shared-content" class="shared-content"></div>';
  bind("back-projects", () => { location.href = "/shared"; });
  bind("refresh-shared", loadProject);
  for (const t of tabs)
    bind("tab-" + t, () => {
      tab = t;
      renderProject();
    });
  ({
    Overview: overviewView,
    Requirements: requirementsView,
    Team: teamView,
    Tasks: tasksView,
    Planning: () =>
      renderPlanning({
        db,
        project,
        leader: leader(),
        ai: data.ai,
        escape,
        when,
        result,
        notify,
        editPolicy: editAiPolicy,
      }),
    Learning: learningView,
    Files: filesView,
    Activity: activityView,
    History: historyView,
  })[tab]();
}
const content = (html) =>
  (document.getElementById("shared-content").innerHTML = html);
function overviewView() {
  const done = data.tasks.filter((t) => t.status === "done").length;
  content(
    '<div class="shared-columns"><section><div class="shared-header"><h2>Project brief</h2>' +
      (leader() ? button("edit-brief", "Edit brief") : "") +
      "</div><p>" +
      text(project.problem_statement) +
      "</p><dl>" +
      [
        ["Deadline", project.submission_deadline],
        ["Deliverables", project.expected_deliverables.join("\n")],
        ["Technology", project.technology_stack.join(", ")],
        ["Workflow", project.workflow_content || "Awaiting planning"],
      ]
        .map(
          ([k, v]) =>
            '<dt class="compact-info">' +
            k +
            "</dt><dd><pre>" +
            text(v) +
            "</pre></dd>",
        )
        .join("") +
      "</dl><section><h2>AI policy</h2><p>" +
      escape(
        data.ai?.external_ai_apis_allowed
          ? "External AI APIs permitted"
          : "External AI APIs restricted",
      ) +
      "</p><p>" +
      text(data.ai?.privacy_restrictions) +
      "</p>" +
      (leader() ? button("edit-ai", "Edit AI policy") : "") +
      "</section>" +
      button("project-activity", "GitHub & Vercel") +
      '</section><section><h2>Readiness</h2><ul class="shared-checks">' +
      status("Problem statement", project.problem_statement) +
      status("Deadline", project.submission_deadline) +
      status("Deliverables", project.expected_deliverables.length) +
      status(
        "Official requirements",
        data.rules?.mandatory_requirements.length || data.requirements.length,
      ) +
      status("Documents", data.documents.length) +
      status(
        "Accepted team",
        data.members.every((m) => m.status === "accepted"),
      ) +
      status(
        "Member profiles",
        data.members.every((m) => m.profile_completed_at),
      ) +
      "</ul><p>" +
      done +
      " of " +
      data.tasks.length +
      " tasks complete</p><p>" +
      escape(project.archived_at ? "Archived project" : "Active project") +
      "</p>" +
      (leader()
        ? button(
            "archive-project",
            project.archived_at ? "Restore project" : "Archive project",
          )
        : "") +
      "</section></div>",
  );
  bind("project-activity", () => { tab = "Activity"; renderProject(); });
  bind("edit-brief", () =>
    modal(
      "Edit project brief",
      projectFields
        .map(([key, label]) => {
          const value = Array.isArray(project[key])
            ? project[key].join("\n")
            : project[key];
          return area(key, label, value);
        })
        .join(""),
      async (form) => {
        const values = Object.fromEntries(form);
        if (values.name.trim().length < 2) throw Error("Enter a project name.");
        for (const key of ["expected_deliverables", "technology_stack"])
          values[key] = lines(values[key]);
        for (const key of ["start_date", "submission_deadline"])
          values[key] = values[key] || null;
        values.workflow_status = values.workflow_content.trim()
          ? "provided"
          : "requires_generation";
        await result(db.from("projects").update(values).eq("id", project.id));
      },
    ),
  );
  bind("edit-ai", editAiPolicy);
  bind("archive-project", () =>
    confirmAction(
      project.archived_at ? "Restore project" : "Archive project",
      "This changes whether the project appears in the active project list.",
      () =>
        result(
          db
            .from("projects")
            .update({
              archived_at: project.archived_at
                ? null
                : new Date().toISOString(),
            })
            .eq("id", project.id),
        ),
    ),
  );
}
function resourceLink(url, label, primary = false) {
  return '<a target="_blank" rel="noreferrer" class="button ' + (primary ? 'primary' : 'subtle') +
    '" href="' + escape(url) + '">' + escape(label) + '</a>';
}

function deploymentPanel(deploy, repoUrl) {
  const links = [];
  if (deploy.url) links.push(resourceLink(deploy.url, "Visit published website", true));
  if (deploy.statusUrl) links.push(resourceLink(deploy.statusUrl, "Deployment details"));
  if (!deploy.url) {
    links.push(resourceLink("https://vercel.com/dashboard", "Vercel dashboard"));
    if (repoUrl) links.push(resourceLink(repoUrl + "/deployments", "GitHub deployments"));
    const failed = deploy.status === "Failed";
    links.push(resourceLink(failed ? "https://vercel.com/docs/deployments/troubleshoot-a-build" :
      "https://vercel.com/docs/deployments", failed ? "Troubleshoot the build" : "Deployment guide"));
  }
  return '<section><h3>Published website</h3>' +
    (deploy.url ? '<p>' + escape(new URL(deploy.url).hostname) + '</p>' : '<p>No published link available yet.</p>') +
    '<div class="shared-actions">' + links.join("") + '</div><p>Latest production deployment · <strong>' +
    escape(deploy.status) + '</strong></p>' +
    (deploy.note || deploy.comparison ? '<p>' + escape(deploy.note || deploy.comparison) + '</p>' : '') + '</section>';
}

async function vercelTokenSettings() {
  const id = project.id;
  const endpoint = "/api/vercel/token?projectId=" + encodeURIComponent(id);
  async function request(method, key) {
    const response = await fetch(endpoint, {method, headers:{Authorization:"Bearer " + session.access_token,
      "Content-Type":"application/json"},body:key ? JSON.stringify({key}) : undefined});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Could not update the Vercel token.");
    return data;
  }
  const {configured} = await request("GET");
  if (project?.id !== id || tab !== "Activity") return;
  modal("Vercel access token",
    '<p>' + (configured ? 'A token is saved for this project.' : 'Connect a token with access to the Vercel project.') +
    '</p>' + resourceLink("https://vercel.com/account/tokens", "Manage Vercel tokens") +
    '<label for="vercel-secret">' + (configured ? 'Replacement token' : 'Access token') +
    '</label><input id="vercel-secret" name="token" type="password" autocomplete="new-password" maxlength="256">' +
    (configured ? check("remove","Remove the saved token") : ""),
    async form => {
      const token = form.get("token").trim();
      if (form.has("remove") && token) throw Error("Choose either replacement or removal.");
      if (!form.has("remove") && !token) throw Error("Enter a token to save.");
      await request(form.has("remove") ? "DELETE" : "PUT", token);
      document.getElementById("vercel-secret").value = "";
    });
}

async function activityView() {
  content('<header class="shared-header"><div><h2>GitHub &amp; Vercel</h2><p>' +
    escape(project.repository || "Repository awaiting setup") + '</p></div>' +
    (leader() ? '<div class="shared-actions">' + button("edit-connections", "Connections") + button("vercel-token", "Vercel token") + "</div>" : "") +
    '</header><div id="project-feed" aria-live="polite"></div>');
  bind("vercel-token", vercelTokenSettings);
  bind("edit-connections", () => modal("Project connections",
    field("repository","GitHub repository URL or owner/name", project.repository) +
    field("vercel_project_id","Vercel project ID (optional)", project.vercel_project_id) +
    field("vercel_team_id","Vercel team ID (optional)", project.vercel_team_id),
    async form => {
      const repo = form.get("repository").trim().replace(/^https:\/\/github\.com\//i, "").replace(/\/$/, "").replace(/\.git$/i, "");
      const vercel = form.get("vercel_project_id").trim() || null;
      const team = form.get("vercel_team_id").trim() || null;
      if (repo && (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || /\/(\.|\.\.)$/.test(repo))) throw Error("Enter a GitHub repository URL or owner/name.");
      if (vercel && !/^prj_[A-Za-z0-9]{8,64}$/.test(vercel)) throw Error("Enter a Vercel project ID beginning with prj_.");
      if (team && (!vercel || !/^team_[A-Za-z0-9]{8,64}$/.test(team))) throw Error("Enter a Vercel project ID and a team ID beginning with team_.");
      await result(db.from("projects").update({repository:repo,vercel_project_id:vercel,vercel_team_id:team}).eq("id",project.id).select("id").single());
    }));
  const panel = document.getElementById("project-feed");
  const id = project.id;
  let refreshing = false;
  async function refresh() {
    if (!panel.isConnected || refreshing || document.hidden) return;
    refreshing = true;
    try {
      const response = await fetch("/api/activity?project=" + encodeURIComponent(id), {headers:{Authorization:"Bearer " + session.access_token}});
      const feed = await response.json();
      if (!response.ok) throw Error(feed.error || "Activity is temporarily unavailable.");
      if (!panel.isConnected) return;
      const repoUrl = feed.repository ? "https://github.com/" + feed.repository.split("/").map(encodeURIComponent).join("/") : "";
      const deploy = feed.deployment;
      panel.innerHTML = '<div class="shared-columns">' + deploymentPanel(deploy, repoUrl) + '<section><h3>Recent commits</h3>' +
        (feed.commits.map(c => '<article class="shared-row"><div><a href="' + escape(repoUrl + "/commit/" + c.sha) + '" target="_blank" rel="noreferrer">' +
          escape(c.message.split("\n")[0]) + '</a><p>' + escape(c.author) + " · " + escape(when(c.date)) + '</p></div></article>').join("") || empty(feed.githubNote || "No commits on the default branch.")) +
        (feed.brief.length ? '<h3>What changed</h3><ul>' + feed.brief.map(item => '<li>' + escape(item.text) + '</li>').join("") + '</ul>' : '') +
        '</section></div><p class="shared-muted">Updated ' + escape(when(feed.updatedAt)) + '</p>';
    } catch (error) {
      if (panel.isConnected) panel.innerHTML = errorBox(error);
    } finally {
      refreshing = false;
    }
  }
  panel.textContent = "Loading repository activity…";
  await refresh();
  function schedule() {
    if (panel.isConnected) setTimeout(async () => { await refresh(); schedule(); },60000);
  }
  schedule();
}

function editAiPolicy() {
  modal(
    "AI policy",
    area(
      "permitted_ai_tools",
      "Permitted tools",
      data.ai.permitted_ai_tools.join("\n"),
    ) +
      area(
        "prohibited_ai_tools",
        "Prohibited tools",
        data.ai.prohibited_ai_tools.join("\n"),
      ) +
      area(
        "permitted_models",
        "Permitted models (API IDs, one per line)",
        data.ai.permitted_models.join("\n"),
      ) +
      check(
        "external_ai_apis_allowed",
        "External APIs allowed",
        data.ai.external_ai_apis_allowed,
      ) +
      check(
        "gemini_planning_allowed",
        "Allow Gemini to receive the project brief and requirement titles for planning",
        data.ai.gemini_planning_allowed,
      ) +
      check(
        "ai_generated_code_allowed",
        "Generated code allowed",
        data.ai.ai_generated_code_allowed,
      ) +
      check(
        "ai_generated_research_allowed",
        "Generated research allowed",
        data.ai.ai_generated_research_allowed,
      ) +
      area(
        "privacy_restrictions",
        "Privacy restrictions",
        data.ai.privacy_restrictions,
      ) +
      area("data_handling", "Data handling", data.ai.data_handling) +
      area(
        "other_requirements",
        "Other instructions",
        data.ai.other_requirements,
      ),
    async (form) => {
      const values = Object.fromEntries(form);
      for (const key of [
        "permitted_ai_tools",
        "prohibited_ai_tools",
        "permitted_models",
      ])
        values[key] = lines(values[key]);
      for (const key of [
        "external_ai_apis_allowed",
        "gemini_planning_allowed",
        "ai_generated_code_allowed",
        "ai_generated_research_allowed",
      ])
        values[key] = form.has(key);
      await result(
        db
          .from("project_ai_constraints")
          .update(values)
          .eq("project_id", project.id),
      );
    },
  );
}
function requirementsView() {
  content(
    '<header class="shared-header"><h2>Requirements and evidence</h2>' +
      (leader() ? button("add-requirement", "Add requirement", true) : "") +
      "</header>" +
      (data.rules?.mandatory_requirements.length
        ? "<details><summary>Requirements entered during setup</summary><ul>" +
          data.rules.mandatory_requirements
            .map((r) => "<li>" + escape(r) + "</li>")
            .join("") +
          "</ul></details>"
        : "") +
      data.requirements
        .map(
          (r) =>
            '<article class="shared-row"><div><b>' +
            escape(r.title) +
            "</b><p>" +
            escape(r.description) +
            "</p><p>" +
            escape(
              [
                r.source,
                r.mandatory ? "Mandatory" : "Optional",
                r.verified ? "Verified" : "Unverified",
                r.source_document,
                r.page_number ? "Page " + r.page_number : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ) +
            "</p></div>" +
            (leader() ? button("req-" + r.id, "Edit") : "") +
            "</article>",
        )
        .join("") +
      (data.requirements.length
        ? ""
        : empty("Add requirements with their source and verification status.")),
  );
  const edit = (r) =>
    modal(
      r ? "Edit requirement" : "Add requirement",
      field("title", "Title", r?.title, "text", true) +
        area("description", "Description", r?.description) +
        select(
          "source",
          "Source",
          [
            ["manual", "Manual entry"],
            ["official", "Official competition requirement"],
            ["suggestion", "Suggestion"],
          ],
          r?.source || "manual",
        ) +
        field("source_document", "Source document", r?.source_document) +
        field("page_number", "Page number", r?.page_number, "number") +
        check("mandatory", "Mandatory", r?.mandatory ?? true) +
        check("verified", "Verified against source", r?.verified) +
        area("notes", "Verification notes", r?.notes),
      async (form) => {
        const value = {
          ...Object.fromEntries(form),
          project_id: project.id,
          editor_id: session.user.id,
          page_number: form.get("page_number")
            ? Number(form.get("page_number"))
            : null,
          mandatory: form.has("mandatory"),
          verified: form.has("verified"),
        };
        if (value.source === "suggestion" && value.verified)
          throw Error("Suggestions must remain unverified.");
        await result(
          r
            ? db.from("requirement_items").update(value).eq("id", r.id)
            : db.from("requirement_items").insert(value),
        );
      },
    );
  bind("add-requirement", () => edit());
  for (const r of data.requirements) bind("req-" + r.id, () => edit(r));
}
function teamView() {
  const accepted = data.members.filter((m) => m.status === "accepted").length;
  const complete = data.members.filter((m) => m.profile_completed_at).length;
  content(
    '<header class="shared-header"><div><h2>Team</h2><p class="shared-muted">' +
      accepted +
      " of " +
      data.members.length +
      " joined · " +
      complete +
      ' profiles complete</p></div><div class="shared-actions">' +
      button("my-profile", "My profile") +
      (leader() ? button("add-member", "Add teammate", true) : "") +
      "</div></header>" +
      data.members
        .map((m) => {
          const skills = data.skills.filter((s) => s.user_id === m.user_id);
          const availability = data.availability.find(
            (a) => a.user_id === m.user_id,
          );
          const invitation = (data.invitations || []).find(
            (i) => i.project_member_id === m.id,
          );
          return (
            '<article class="shared-row"><div><b>' +
            escape(m.full_name) +
            "</b><p>" +
            escape(m.role) +
            " · " +
            escape(m.status) +
            (m.profile_completed_at
              ? " · Profile complete"
              : " · Profile incomplete") +
            "</p>" +
            (availability
              ? "<p>" +
                availability.weekly_hours +
                " h/week · " +
                escape(availability.available_days) +
                " · " +
                escape(availability.timezone) +
                "</p>"
              : "") +
            skills
              .map(
                (s) =>
                  "<p>" +
                  escape(s.skill_name) +
                  " · self-assessed " +
                  escape(s.self_assessed_level) +
                  (s.verified_level
                    ? " · reviewed " + escape(s.verified_level)
                    : "") +
                  (leader() ? " " + button("skill-" + s.id, "Review") : "") +
                  "</p>",
              )
              .join("") +
            (invitation
              ? "<small>Invitation " +
                escape(
                  new Date(invitation.expires_at) < new Date() &&
                    invitation.claim_status === "pending"
                    ? "expired"
                    : invitation.claim_status,
                ) +
                " · " +
                when(invitation.expires_at) +
                "</small>"
              : "") +
            "</div>" +
            (leader() && m.status !== "accepted"
              ? '<div class="shared-actions">' +
                button(
                  "invite-" + m.id,
                  invitation ? "Rotate invite" : "Create invite",
                ) +
                (invitation?.claim_status === "pending"
                  ? button("revoke-" + invitation.id, "Revoke")
                  : "") +
                "</div>"
              : "") +
            "</article>"
          );
        })
        .join("") +
      "<section><h2>Skill coverage</h2>" +
      skillCoverage() +
      "</section>" +
      (leader()
        ? "<footer><p>" +
          escape(
            project.onboarding_finalized_at
              ? "Onboarding finalized " + when(project.onboarding_finalized_at)
              : "Onboarding is open",
          ) +
          "</p>" +
          button("finalize", "Finalize onboarding") +
          "</footer>"
        : ""),
  );
  bind("my-profile", editProfile);
  bind("add-member", () =>
    modal(
      "Add teammate",
      field("full_name", "Full name", "", "text", true) +
        field("email", "Intended email", "", "email") +
        field("role", "Role", "Member"),
      async (form) => {
        await rpc("add_project_member", {
          p_project_id: project.id,
          p_name: form.get("full_name"),
          p_email: form.get("email"),
          p_role: form.get("role"),
        });
      },
    ),
  );
  for (const m of data.members) {
    bind("invite-" + m.id, async () => {
      const issue = async () => {
        const token = await rpc("issue_member_invitation", {
          p_member_id: m.id,
        });
        const url =
          location.origin + "/shared#invite=" + encodeURIComponent(token);
        document.getElementById("shared-title").textContent =
          "Invitation for " + m.full_name;
        document.getElementById("shared-dialog-body").innerHTML =
          '<p>Expires in seven days. The recipient must sign in and confirm their identity.</p><p class="shared-note">The recipient also needs access to this private hosted site.</p><label for="invite-url">Invitation link</label><input id="invite-url" readonly value="' +
          escape(url) +
          '"><div class="shared-actions">' +
          button("copy-invite", "Copy link") +
          "</div>";
        if (!dialog.open) dialog.showModal();
        bind("copy-invite", async () => {
          await navigator.clipboard.writeText(url);
          notify("Invitation copied.");
        });
        await loadProject();
      };
      if (
        (data.invitations || []).some(
          (i) => i.project_member_id === m.id && i.claim_status === "pending",
        )
      ) {
        document.getElementById("shared-title").textContent =
          "Replace invitation";
        document.getElementById("shared-dialog-body").innerHTML =
          "<p>The previous invitation will stop working.</p>" +
          button("confirm-rotate", "Replace invitation", true);
        dialog.showModal();
        bind("confirm-rotate", issue);
      } else await issue();
    });
  }
  for (const invitation of data.invitations || [])
    bind("revoke-" + invitation.id, () =>
      confirmAction(
        "Revoke invitation",
        "The invitation link will stop granting access.",
        () =>
          rpc("revoke_member_invitation", { p_invitation_id: invitation.id }),
      ),
    );
  for (const skill of data.skills)
    bind("skill-" + skill.id, () =>
      modal(
        "Review " + skill.skill_name,
        select(
          "level",
          "Verified proficiency",
          [
            ["beginner", "Beginner"],
            ["intermediate", "Intermediate"],
            ["advanced", "Advanced"],
            ["expert", "Expert"],
          ],
          skill.verified_level || skill.self_assessed_level,
        ) +
          area(
            "evidence",
            "Evidence supporting this review",
            skill.verified_evidence,
          ),
        (form) =>
          rpc("verify_project_member_skill", {
            p_project_id: project.id,
            p_skill_id: skill.id,
            p_verified_level: form.get("level"),
            p_verified_evidence: form.get("evidence"),
          }),
      ),
    );
  bind("finalize", () =>
    confirmAction(
      "Finalize onboarding",
      complete < data.members.length || accepted < data.members.length
        ? "Some teammates have pending invitations or incomplete profiles. Confirm that you want to proceed."
        : "All team members have completed their profiles.",
      () =>
        rpc("finalize_project_onboarding", {
          p_project_id: project.id,
          p_allow_incomplete: true,
        }),
    ),
  );
}
function skillCoverage() {
  const grouped = new Map();
  for (const s of data.skills) {
    const key = s.skill_name.toLowerCase();
    const entry = grouped.get(key) || {
      name: s.skill_name,
      members: new Set(),
    };
    entry.members.add(s.user_id);
    grouped.set(key, entry);
  }
  return grouped.size
    ? '<ul class="shared-checks">' +
        [...grouped.values()]
          .map(
            (s) =>
              "<li><span>" +
              escape(s.name) +
              "</span><b>" +
              s.members.size +
              " " +
              (s.members.size === 1 ? "member · single coverage" : "members") +
              "</b></li>",
          )
          .join("") +
        "</ul>"
    : empty("Skill coverage appears as members complete their profiles.");
}
async function editProfile() {
  const profile = await result(
    db.from("profiles").select("*").eq("id", session.user.id).single(),
  );
  const avail =
    data.availability.find((a) => a.user_id === session.user.id) || {};
  const skills = data.skills.filter((s) => s.user_id === session.user.id);
  const rows = skills.length
    ? skills
    : [
        {
          skill_name: "",
          category: "Frontend",
          self_assessed_level: "beginner",
          self_evidence: "",
        },
      ];
  const categories = [
    "Research",
    "UI/UX",
    "Frontend",
    "Backend",
    "AI/ML",
    "Database",
    "Testing",
    "Documentation",
    "Presentation",
    "Project management",
    "Other",
  ];
  const skillRow = (s, index) =>
    '<div class="skill-edit" data-skill-row>' +
    field("skill-name-" + index, "Skill", s.skill_name, "text", true) +
    select(
      "skill-category-" + index,
      "Category",
      categories.map((c) => [c, c]),
      s.category,
    ) +
    select(
      "skill-level-" + index,
      "Self-assessed proficiency",
      ["beginner", "intermediate", "advanced", "expert"].map((l) => [l, l]),
      s.self_assessed_level,
    ) +
    field("skill-evidence-" + index, "Evidence or link", s.self_evidence) +
    "</div>";
  modal(
    "My profile",
    field("full_name", "Full name", profile.full_name, "text", true) +
      area(
        "interests",
        "Interests, one per line",
        profile.interests.join("\n"),
      ) +
      area(
        "preferred_technologies",
        "Preferred technologies, one per line",
        profile.preferred_technologies.join("\n"),
      ) +
      '<h3>Skills</h3><div id="skill-editor">' +
      rows.map(skillRow).join("") +
      "</div>" +
      button("add-skill", "Add skill") +
      "<h3>Availability</h3>" +
      field(
        "weekly_hours",
        "Average available hours per week",
        avail.weekly_hours || 0,
        "number",
      ) +
      field("available_days", "Available days", avail.available_days) +
      field("working_hours", "Preferred working hours", avail.working_hours) +
      field(
        "timezone",
        "Timezone",
        avail.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      ) +
      area("commitments", "Existing commitments", avail.commitments) +
      field(
        "communication",
        "Preferred communication method",
        avail.communication,
      ),
    async (form) => {
      const entries = [...document.querySelectorAll("[data-skill-row]")].map(
        (_, i) => ({
          skill_name: String(form.get("skill-name-" + i) || "").trim(),
          category: form.get("skill-category-" + i),
          proficiency: form.get("skill-level-" + i),
          evidence: form.get("skill-evidence-" + i),
        }),
      );
      if (entries.some((s) => !s.skill_name))
        throw Error("Enter a name for each skill.");
      if (
        new Set(
          entries.map((s) => (s.category + "/" + s.skill_name).toLowerCase()),
        ).size !== entries.length
      )
        throw Error("Remove duplicate skills before saving.");
      const hours = Number(form.get("weekly_hours"));
      if (!Number.isFinite(hours) || hours < 0 || hours > 168)
        throw Error("Weekly hours must be between 0 and 168.");
      await rpc("save_complete_member_profile", {
        p_project_id: project.id,
        p_profile: {
          full_name: form.get("full_name"),
          interests: lines(form.get("interests")),
          preferred_technologies: lines(form.get("preferred_technologies")),
          availability: hours + " hours per week",
        },
        p_skills: entries,
        p_availability: {
          weekly_hours: hours,
          available_days: form.get("available_days"),
          working_hours: form.get("working_hours"),
          timezone: form.get("timezone"),
          commitments: form.get("commitments"),
          communication: form.get("communication"),
        },
      });
    },
  );
  bind("add-skill", () => {
    const editor = document.getElementById("skill-editor");
    const index = editor.children.length;
    if (index >= 30) throw Error("Use up to 30 skills.");
    editor.insertAdjacentHTML(
      "beforeend",
      skillRow({ category: "Other", self_assessed_level: "beginner" }, index),
    );
  });
}
function tasksView() {
  const done = data.tasks.filter((t) => t.status === "done").length;
  const openHours = data.tasks
    .filter((t) => t.status !== "done")
    .reduce((sum, t) => sum + Number(t.estimated_hours), 0);
  content(
    '<header class="shared-header"><div><h2>Team tasks</h2><p>' +
      done +
      " of " +
      data.tasks.length +
      " complete · " +
      openHours +
      " estimated hours remaining</p></div>" +
      button("add-task", "Add task", true) +
      "</header>" +
      data.tasks
        .map(
          (t) =>
            '<article class="shared-row"><div><b>' +
            escape(t.title) +
            "</b><p>" +
            escape(memberName(t.owner_id)) +
            " · " +
            escape(t.status.replaceAll("_", " ")) +
            (t.due_date ? " · Due " + escape(t.due_date) : "") +
            "</p></div>" +
            button("task-" + t.id, "Edit") +
            "</article>",
        )
        .join("") +
      (data.tasks.length
        ? ""
        : empty("Create tasks and link them to project requirements.")) +
      '<section><h2>Assigned workload</h2><ul class="shared-checks">' +
      data.members
        .filter((m) => m.status === "accepted")
        .map((m) => {
          const hours = data.tasks
            .filter((t) => t.owner_id === m.user_id && t.status !== "done")
            .reduce((n, t) => n + Number(t.estimated_hours), 0);
          const avail = data.availability.find((a) => a.user_id === m.user_id);
          return (
            "<li><span>" +
            escape(m.full_name) +
            "</span><b>" +
            hours +
            " h assigned" +
            (avail ? " · " + avail.weekly_hours + " h/week available" : "") +
            "</b></li>"
          );
        })
        .join("") +
      '</ul><p class="shared-muted">Estimates and availability are declared by the team.</p></section>',
  );
  const edit = (t) =>
    modal(
      t ? "Edit task" : "Add task",
      field("title", "Title", t?.title, "text", true) +
        select(
          "owner_id",
          "Owner",
          [
            ["", "Unassigned"],
            ...data.members
              .filter((m) => m.status === "accepted")
              .map((m) => [m.user_id, m.full_name]),
          ],
          t?.owner_id || "",
        ) +
        select(
          "status",
          "Status",
          ["open", "in_progress", "review", "done"].map((v) => [
            v,
            v.replaceAll("_", " "),
          ]),
          t?.status || "open",
        ) +
        select(
          "requirement_id",
          "Linked requirement",
          [["", "None"], ...data.requirements.map((r) => [r.id, r.title])],
          t?.requirement_id || "",
        ) +
        field("due_date", "Due date", t?.due_date, "date") +
        field(
          "estimated_hours",
          "Estimated hours",
          t?.estimated_hours || 0,
          "number",
        ),
      async (form) => {
        const values = {
          ...Object.fromEntries(form),
          project_id: project.id,
          owner_id: form.get("owner_id") || null,
          requirement_id: form.get("requirement_id") || null,
          due_date: form.get("due_date") || null,
          estimated_hours: Number(form.get("estimated_hours")),
        };
        await result(
          t
            ? db.from("project_tasks").update(values).eq("id", t.id)
            : db.from("project_tasks").insert(values),
        );
      },
    );
  bind("add-task", () => edit());
  for (const t of data.tasks) bind("task-" + t.id, () => edit(t));
}
function learningView() {
  content(
    '<header class="shared-header"><div><h2>My learning</h2><p class="shared-muted">Personal goals connected to this project.</p></div>' +
      button("add-goal", "Add learning goal", true) +
      "</header>" +
      data.learning
        .map(
          (g) =>
            '<article class="shared-row"><div><b>' +
            escape(g.title) +
            "</b><p>" +
            escape(g.completed ? "Completed" : "In progress") +
            "</p>" +
            (g.resource_url
              ? '<a class="text-link" target="_blank" rel="noreferrer" href="' +
                escape(g.resource_url) +
                '">Open learning resource</a>'
              : "") +
            "</div>" +
            button(
              "goal-" + g.id,
              g.completed ? "Mark in progress" : "Mark complete",
            ) +
            "</article>",
        )
        .join("") +
      (data.learning.length
        ? ""
        : empty(
            "Save a learning goal and a resource you want to work through.",
          )) +
      "<section><h2>Find a teammate to learn with</h2>" +
      skillCoverage() +
      "</section>",
  );
  bind("add-goal", () =>
    modal(
      "Learning goal",
      field("title", "Goal", "", "text", true) +
        field("resource_url", "Resource URL (optional)", "", "url"),
      async (form) => {
        const values = Object.fromEntries(form);
        if (values.resource_url && !values.resource_url.startsWith("https://"))
          throw Error("Use an HTTPS resource link.");
        await result(
          db.from("learning_goals").insert({
            ...values,
            project_id: project.id,
            user_id: session.user.id,
          }),
        );
      },
    ),
  );
  for (const goal of data.learning)
    bind("goal-" + goal.id, async () => {
      await result(
        db
          .from("learning_goals")
          .update({ completed: !goal.completed })
          .eq("id", goal.id),
      );
      await loadProject();
    });
}
function filesView() {
  content(
    '<header class="shared-header"><h2>Project documents</h2></header>' +
      (leader()
        ? '<form id="file-form" class="shared-form">' +
          select(
            "type",
            "Document type",
            [
              ["rulebook", "Rulebook PDF"],
              ["supporting", "Supporting document"],
              ["workflow", "Workflow"],
            ],
            "rulebook",
          ) +
          '<label for="shared-file">Choose a file, up to 15 MB</label><input id="shared-file" name="file" type="file" accept=".pdf,.txt,.docx" required><button class="button primary">Upload</button><div id="upload-state" role="status"></div></form>'
        : "") +
      data.documents
        .map(
          (d) =>
            '<article class="shared-row"><div><b>' +
            escape(d.file_name) +
            "</b><p>" +
            escape(d.document_type) +
            " · " +
            Math.ceil(d.size_bytes / 1024) +
            " KB</p></div>" +
            button("file-" + d.id, "Download") +
            "</article>",
        )
        .join(""),
  );
  if (leader())
    document.getElementById("file-form").onsubmit = async (e) => {
      e.preventDefault();
      e.submitter.disabled = true;
      const form = new FormData(e.currentTarget),
        file = form.get("file"),
        type = form.get("type");
      const state = document.getElementById("upload-state");
      state.textContent = "Uploading…";
      try {
        if (!file.size || file.size > 15 * 1024 * 1024)
          throw Error("Choose a file between 1 byte and 15 MB.");
        const extension = file.name.split(".").pop().toLowerCase();
        const mime = {
          pdf: "application/pdf",
          txt: "text/plain",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }[extension];
        if (!mime || (type === "rulebook" && extension !== "pdf"))
          throw Error(
            "Rulebooks must be PDFs. Supporting files can be PDF, text, or Word.",
          );
        const path = project.id + "/" + crypto.randomUUID() + "." + extension;
        await result(
          db.storage
            .from("project-documents")
            .upload(path, file, { contentType: mime, upsert: false }),
        );
        try {
          await result(
            db.from("project_documents").insert({
              project_id: project.id,
              uploaded_by: session.user.id,
              document_type: type,
              file_name: file.name,
              storage_path: path,
              content_type: mime,
              size_bytes: file.size,
            }),
          );
        } catch (err) {
          await db.storage.from("project-documents").remove([path]);
          throw err;
        }
        notify("Document saved.");
        await loadProject();
      } catch (err) {
        state.textContent = err.message;
        e.submitter.disabled = false;
      }
    };
  for (const doc of data.documents)
    bind("file-" + doc.id, async () => {
      const { signedUrl } = await result(
        db.storage
          .from("project-documents")
          .createSignedUrl(doc.storage_path, 60, { download: doc.file_name }),
      );
      const link = document.createElement("a");
      link.href = signedUrl;
      link.rel = "noreferrer";
      link.click();
    });
}
function historyView() {
  content(
    "<h2>Project history</h2>" +
      data.activity
        .map(
          (event) =>
            '<article class="shared-row"><div><b>' +
            escape(event.description) +
            "</b><p>" +
            escape(memberName(event.actor_id)) +
            " · " +
            escape(when(event.created_at)) +
            "</p></div></article>",
        )
        .join("") +
      (data.activity.length ? "" : empty("Project changes will appear here.")),
  );
}
const notificationPanel = notifications({
  db,
  result,
  rpc,
  escape,
  when,
  notify,
  openProject: async (record) => {
    if (wizard && draftChanges > savedChanges) await queueDraft();
    clearTimeout(saveTimer);
    await openProject(record);
  },
  getSession: () => session,
});
db.auth.onAuthStateChange((event, next) => {
  const changed = session?.user.id !== next?.user.id;
  session = next;
  if (event === "PASSWORD_RECOVERY") {
    authMode = "recover";
    authScreen();
    return;
  }
  if (
    event === "INITIAL_SESSION" ||
    event === "SIGNED_OUT" ||
    (event === "SIGNED_IN" && changed)
  )
    setTimeout(() => workspace(), 0);
});
const initial = await db.auth.getSession();
session = initial.data.session;
if (initial.error) notify(initial.error.message);
if (!session) authScreen();
