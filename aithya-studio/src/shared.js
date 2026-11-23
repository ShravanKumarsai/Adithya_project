import { button, escape, skeleton, tabButton, tabKeys } from "./studio-ui.js";
import { collectWizardPolicy } from "./wizard-policy.js";
import {applyStudioAppearance,studioAppearance} from "./studio-appearance.js";
import {mountReport} from "./studio-report.js";
import {mountBlueprint} from "./blueprint.js";
import {studioSkills} from "./assist-contract.js";
import { todayView } from "./project-insights.js";
import { openRulebookImport } from "./shared-rulebook.js";
import { notifications } from "./shared-notifications.js";
import { renderPortfolio } from "./shared-portfolio.js";
import { supabase as db } from "./lib/supabase.js";

let detachSheet=()=>{};
const themeButton=document.querySelector("#blueprint-theme");
const themes=["dark","light","blueprint","system"];
const nextTheme=theme=>themes[(themes.indexOf(theme)+1)%themes.length];
function setTheme(theme){
  applyStudioAppearance({...studioAppearance(),theme});
  themeButton.textContent="Use "+(nextTheme(theme)==="dark"?"Midnight":nextTheme(theme))+" theme";
}
applyStudioAppearance();
setTheme(studioAppearance().theme);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (studioAppearance().theme === "system") setTheme("system");
});
themeButton.onclick=()=>{
  const theme=nextTheme(studioAppearance().theme);
  setTheme(theme);
  localStorage.setItem("aithya.theme",theme);
};
const main = document.getElementById("shared-main");
const dialog = document.getElementById("shared-dialog");
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
  history.replaceState(null, "", location.pathname + location.search);
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
  detachSheet();
  const version = ++generation;
  project = null;
  wizard = null;
  document.getElementById("account").innerHTML = session
    ? button("signout", "Sign out")
    : "";
  notificationPanel.refresh();
  const route = new URL(location.href);
  const activeRoute = route.searchParams.get("view") || (route.pathname === "/" ? "today" : "projects");
  const nav = document.querySelector("#studio-global-nav");
  nav.hidden = !session;
  document.querySelector("#studio-command").hidden = !session;
  for (const link of nav.querySelectorAll("a")) {
    const destination = new URL(link.href);
    const page = destination.searchParams.get("view") || (destination.pathname === "/" ? "today" : "projects");
    if (page === activeRoute) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
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
  if (activeRoute === "portfolio") {
    await renderPortfolio({db, main, user:session.user, result, escape, button, field, area, select,
      bind, modal, notify, back:() => navigate("/shared")});
    return;
  }
  if (activeRoute === "settings") {
    main.innerHTML = '<header class="shared-header"><h1>Settings</h1></header>' +
      '<section class="bp-panel"><h2>Appearance</h2>' +
      select("global-theme", "Theme", [["system","Use device setting"],["light","Light"],["dark","Midnight"],["blueprint","Blueprint"]], studioAppearance().theme) +
      '</section>';
    document.getElementById("f-global-theme").onchange = (event) => setTheme(event.target.value);
    return;
  }
  main.innerHTML = skeleton("Loading your workspace");
  try {
    const insights = activeRoute === "today";
    if (activeRoute === "usage") {
      const [projects, accounts, connections] = await Promise.all([
        result(db.from("projects").select("id,name,archived_at").is("archived_at",null)),
        result(db.from("studio_ai_accounts").select("project_id").eq("user_id", session.user.id)),
        result(db.from("studio_claude_connections").select("project_id,provider").eq("user_id", session.user.id)),
      ]);
      if (version !== generation) return;
      main.innerHTML = '<header class="shared-header"><h1>AI usage</h1></header><section class="project-list">' +
        (projects.map((item) => {
          const connected = connections.filter((c) => c.project_id === item.id).length;
          const manual = accounts.filter((c) => c.project_id === item.id).length;
          return '<article class="project-entry"><div><h2>' + escape(item.name) + '</h2><p>' +
            connected + ' live · ' + manual + ' manual</p></div><a class="button subtle" data-studio-route href="/shared?project=' +
            encodeURIComponent(item.id) + '&amp;sheet=AI+credits">AI credits</a></article>';
        }).join("") || '<p>No projects yet.</p>') + '</section>';
      return;
    }
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
      const [tasks, events] = await Promise.all([
        result(db.from("project_tasks").select("id,project_id,title,status,due_date").eq("owner_id",session.user.id)
          .neq("status","done").order("due_date",{nullsFirst:false}).limit(80)),
        rpc("project_notification_feed").catch(() => []),
      ]);
      const blocked = tasks.length ? await result(db.from("project_tasks").select("id,project_id,title,status,due_date")
        .in("blocked_by",tasks.map((task) => task.id)).neq("status","done").limit(40)) : [];
      if (version !== generation) return;
      main.innerHTML = todayView({projects, totals, tasks, events, blocked, escape,
        userName:session.user.user_metadata?.full_name?.trim().split(/\s+/)[0]});
      for (const control of main.querySelectorAll("[data-today-task]")) control.onchange = async () => {
        control.disabled = true;
        try {
          await result(db.from("project_tasks").update({status:control.value}).eq("id",control.dataset.todayTask).select("id").single());
          notify("Task updated.");
          await workspace();
        } catch (error) {
          control.value = tasks.find((task) => task.id === control.dataset.todayTask).status;
          notify(error.message);
          control.disabled = false;
        }
      };
      return;
    }
    const requested = new URLSearchParams(location.search).get("project");
    if (requested) {
      const match = projects.find(p => p.id === requested);
      if (match) return openProject(match, route.searchParams.get("sheet") || "Overview", false);
      history.replaceState(null, "", "/shared");
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
    if (route.searchParams.get("start") === "rulebook") {
      history.replaceState(null,"","/shared");
      document.getElementById("new-project-from-rules").click();
    }
  } catch (err) {
    if (version !== generation) return;
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
      content.ai = collectWizardPolicy(values, ai);
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
function projectURL(id, sheet) {
  return "/shared?" + new URLSearchParams({project: id, sheet});
}
async function openProject(record, sheet = "Overview", updateRoute = true) {
  if (updateRoute) history.pushState(null, "", projectURL(record.id, sheet));
  document.getElementById("studio-global-nav").querySelectorAll("[aria-current]").forEach((link) => link.removeAttribute("aria-current"));
  document.querySelector('#studio-global-nav a[href="/shared"]').setAttribute("aria-current","page");
  project = record;
  wizard = null;
  tab = sheet;
  await loadProject();
}
async function navigate(path) {
  if (wizard && draftChanges > savedChanges) await queueDraft();
  clearTimeout(saveTimer);
  const destination = new URL(path, location.href);
  if (destination.href !== location.href) history.pushState(null, "", destination);
  await workspace();
}
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[data-studio-route]");
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.href).catch((error) => notify(error.message));
});
window.addEventListener("popstate", async () => {
  try {
    if (wizard && draftChanges > savedChanges) await queueDraft();
    clearTimeout(saveTimer);
    await workspace();
  } catch (error) {
    notify(error.message);
  }
});

const commandDialog = document.getElementById("command-dialog");
const commandQuery = document.getElementById("command-query");
const commandResults = document.getElementById("command-results");
document.getElementById("studio-command").onclick = async () => {
  if (!session || commandDialog.open || dialog.open) return;
  const active = project;
  const entries = [
    ["Open projects", () => navigate("/shared")],
    ["Scan rulebook", async () => {
      if (!document.getElementById("new-project-from-rules")) await navigate("/shared");
      document.getElementById("new-project-from-rules")?.click();
    }],
    ...(active ? [
      ["Add task", () => {
        const quick = document.querySelector('[data-final="quick"]');
        if (quick) quick.click();
        else editTask();
      }],
      ["Ask mentor", () => {
        showProjectSheet("AI mentor");
        document.querySelector("#shared-content input, #shared-content textarea")?.focus();
      }],
    ] : []),
  ];
  const draw = () => {
    const query = commandQuery.value.toLowerCase().trim();
    const matching = entries.filter(([label]) => label.toLowerCase().includes(query));
    commandResults.innerHTML = matching.map(([label], i) => button("command-option-" + i,label)).join("") ||
      '<p class="shared-muted">No matching commands.</p>';
    matching.forEach(([, run], i) => bind("command-option-" + i, () => {
      commandDialog.close();
      Promise.resolve().then(run).catch((error) => notify(error.message));
    }));
  };
  commandQuery.value = "";
  commandQuery.oninput = draw;
  commandQuery.onkeydown = (event) => {
    if (event.key === "Enter") commandResults.querySelector("button")?.click();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      commandResults.querySelector("button")?.focus();
    }
  };
  commandDialog.showModal();
  draw();
  try {
    const projects = await result(db.from("projects").select("id,name").is("archived_at",null).order("updated_at",{ascending:false}).limit(25));
    if (commandDialog.open) {
      entries.push(...projects.map((item) => ["Open " + item.name, () => navigate(projectURL(item.id,"Overview"))]));
      draw();
    }
  } catch {
    if (commandDialog.open) commandResults.append(Object.assign(document.createElement("p"), {textContent:"Project search unavailable. Reopen Commands to retry."}));
  }
};
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && session && !dialog.open) {
    event.preventDefault();
    if (commandDialog.open) commandDialog.close();
    else document.getElementById("studio-command").click();
  }
});
async function loadProject() {
  if (!project) {
    await workspace();
    return;
  }
  detachSheet();
  const version = ++generation,
    id = project.id;
  main.innerHTML = skeleton("Loading project records");
  try {
    const queries = [
      ["milestones", db.from("milestones").select("*").eq("project_id", id).order("due")],
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
    const [entries,schemaProbe]=await Promise.all([
      Promise.all(queries.map(async ([key,query])=>[key,await result(query)])),
      db.from("studio_member_details").select("project_id").eq("project_id",id).limit(1)
    ]);
    if (version !== generation) return;
    data = {...Object.fromEntries(entries), personalReady:!schemaProbe.error};
    project = data.project;
    renderProject();
  } catch (err) {
    if (version === generation) {
      main.innerHTML =
        errorBox(err) + button("retry-project", "Retry", true) + button("back-projects", "Back to projects");
      bind("retry-project", loadProject);
      bind("back-projects", () => navigate("/shared"));
    }
  }
}
const leader = () => project?.leader_id === session?.user.id;
const memberName = (id) =>
  data.members.find((m) => m.user_id === id)?.full_name || "Unassigned";
const projectGroups = {
  Overview:["Overview","My dashboard","Today","AI mentor","Report","Portfolio","Ship check"],
  Plan:["Planning board","Timeline","Learning","Project setup"],
  Team:["Team","Chats","Register"],
  Work:["Board","AI credits","Settings"],
  Activity:["Activity","Files","History"],
};
function showProjectSheet(next) {
  tab = next;
  history.replaceState(null, "", projectURL(project.id, tab));
  renderProject();
}
function renderProject() {
  detachSheet();
  const labels=["Overview","My dashboard","Today","Chats","Board","Planning board","Activity","AI credits","Team","Timeline","Learning","Project setup","AI mentor","Ship check","Report","Portfolio","Register","Settings","Files","History"];
  const tabs=data.personalReady?labels:labels.filter(t=>!["My dashboard","AI credits","Register","Settings"].includes(t));
  if(!tabs.includes(tab))tab="Overview";
  const activeGroup = Object.keys(projectGroups).find(group => projectGroups[group].includes(tab));
  const sections = projectGroups[activeGroup].filter(sheet => tabs.includes(sheet));
  const viewAliases={"Project setup":"Setup",Chats:"Chat","AI mentor":"Mentor","Ship check":"Ship","Planning board":"Planning"};
  const view=viewAliases[tab]||tab;
  const stageSheets={Idea:"Project setup",Plan:"Planning board",Team:"Team",Build:"Board",Learn:"Learning",Ship:"Ship check"};
  const stage=({Setup:"Idea",Planning:"Plan",Team:"Team",Chat:"Team",Board:"Build",Learning:"Learn",Ship:"Ship"})[view];
  const days=project.submission_deadline?Math.max(0,Math.ceil((Date.parse(project.submission_deadline+"T23:59:59")-Date.now())/86400000)):null;
  const icons=["M2 2h5v5H2zm9 0h5v5h-5zM2 11h5v5H2zm9 0h5v5h-5z","M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 7c0-5 12-5 12 0","M9 2v14M2 9h14M4 4l10 10m0-10L4 14","M2 3h14v10H7l-5 3z","M2 3h14v12H2zm5 0v12m4-12v12","M9 2v14M2 9h14","M4 4v10m0-5 10-5m-10 10 10-5","M2 13a7 7 0 0 1 14 0M9 12l4-4","M5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-4 7c0-5 8-5 8 0M11 4c5-1 6 4 2 5m-1 2c3 0 5 2 5 5","M9 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3v4l3 2","M2 3h6l1 2 1-2h6v11h-6l-1 2-1-2H2z","M3 15l1-4 9-9 3 3-9 9z","M9 1v16M1 9h16M3 3l12 12m0-12L3 15","M2 9l5 5 9-11","M2 3h14v13H2zm3 9V8m4 4V6m4 6V9","M2 5h14v11H2zm4 0V2h6v3","M9 2v14M2 9h14","M9 1v4m0 8v4M1 9h4m8 0h4M9 5a4 4 0 1 0 .01 0z"];
  const icon=t=>icons[labels.indexOf(t)] ? '<svg class="studio-icon" viewBox="0 0 18 18" aria-hidden="true"><path d="'+icons[labels.indexOf(t)]+'"/></svg>' : "";
  const tabId = (sheet) => "tab-" + (viewAliases[sheet] || sheet.replaceAll(" ","-"));
  main.innerHTML='<div class="bp-layout final-layout"><div class="studio-project-body">'+
    '<header class="project-masthead studio-title-block"><div><h1>'+escape(project.name)+'</h1><p>'+escape([project.hackathon_name||project.theme,days!==null?days+" days left":""].filter(Boolean).join(" · "))+'</p></div>'+
    '<nav class="bp-steps" aria-label="Project stages">'+Object.keys(stageSheets).map(name=>'<button type="button" id="stage-'+name+'"'+(stage===name?' aria-current="step"':'')+'>'+name+'</button>').join('')+'</nav><div class="studio-project-due"><small>Due</small><strong>'+escape(project.submission_deadline||"Unscheduled")+'</strong></div></header>'+
    '<div class="studio-primary-tabs" role="tablist" aria-label="Project areas">' +
    Object.keys(projectGroups).map(group => tabButton("area-"+group,group,group===activeGroup,"project-area")).join("") +
    '</div><section id="project-area" role="tabpanel" aria-labelledby="area-' + activeGroup + '">' +
    '<div class="shared-tabs" role="tablist" aria-label="' + activeGroup + ' sections">' +
    sections.map(sheet => tabButton(tabId(sheet),sheet,sheet===tab,"shared-content",icon(sheet))).join("") +
    '</div><div id="shared-content" class="shared-content" role="tabpanel" tabindex="0" aria-labelledby="' + tabId(tab) + '"></div></section></div></div>';
  for (const list of main.querySelectorAll('[role="tablist"]')) tabKeys(list);
  bind("back-projects", () => navigate("/shared"));
  bind("refresh-shared", loadProject);
  for (const [name,sheet] of Object.entries(stageSheets)) {
    bind("stage-"+name,() => {
      showProjectSheet(sheet);
      document.getElementById("stage-"+name)?.focus();
    });
  }
  for (const [group, sheets] of Object.entries(projectGroups)) {
    bind("area-"+group, () => {
      if (group !== activeGroup) showProjectSheet(sheets[0]);
      document.getElementById("area-"+group)?.focus();
    });
  }
  for (const sheet of sections) bind(tabId(sheet), () => {
    if (sheet !== tab) showProjectSheet(sheet);
    document.getElementById(tabId(sheet))?.focus();
  });
  ({
    Overview: overviewView,
    Report:()=>mountReport({project,data,db,result,rpc,modal,notify,session,refresh:loadProject,escape,leader:leader()},document.getElementById("shared-content")),
    Setup: requirementsView,
    Team: teamView,
    Board: tasksView,
    Portfolio:()=>renderPortfolio({db,main:document.getElementById("shared-content"),user:session.user,result,escape,button,field,area,select,bind,modal,notify,back:()=>{showProjectSheet("Overview")}}),
    Learning: learningView,
    Files: filesView,
    Activity: activityView,
    History: historyView,
  })[view]?.();
  const openSheet=next=>showProjectSheet(Object.keys(viewAliases).find(label=>viewAliases[label]===next)||next);
  detachSheet=mountBlueprint({project,data,tab:view,db,result,rpc,session,leader:leader(),modal,notify,refresh:loadProject,openSheet,editConnections,editProfile,editTask,editPolicy:editAiPolicy});

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
  bind("project-activity", () => { showProjectSheet("Activity"); });
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
    (deploy.note || deploy.comparison ? '<p>' + escape(deploy.note || deploy.comparison) + '</p>' : '') +
    (deploy.history?.length?'<h3>Recent deployments</h3>'+deploy.history.map(row=>'<div class="shared-row"><div><b>'+escape(row.target+' · '+row.status)+'</b><p>'+escape([row.author,row.date?when(row.date):""].filter(Boolean).join(" · "))+'</p></div>'+
    (row.statusUrl?resourceLink(row.statusUrl,"View details"):"")+'</div>').join(""):"")+'</section>';
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

function editConnections() {
  return modal("Project connections",
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
    });
}

async function activityView() {
  content('<header class="shared-header"><div><h2>GitHub &amp; Vercel</h2><p>' +
    escape(project.repository || "Repository awaiting setup") + '</p></div>' +
    (leader() ? '<div class="shared-actions">' + button("edit-connections", "Connections") + button("vercel-token", "Vercel token") + "</div>" : "") +
    button("refresh-project-feed", "Refresh") + '</header><div id="project-feed" aria-live="polite"></div>');
  bind("vercel-token", vercelTokenSettings);
  bind("edit-connections", editConnections);
  const panel = document.getElementById("project-feed");
  const id = project.id;
  let refreshing = false;
  const refreshButton = document.getElementById("refresh-project-feed");
  async function refresh() {
    if (!panel.isConnected || refreshing || document.hidden) return;
    refreshing = true;
    refreshButton.disabled = true;
    panel.setAttribute("aria-busy", "true");
    try {
      const response = await fetch("/api/activity?project=" + encodeURIComponent(id), {headers:{Authorization:"Bearer " + session.access_token},signal:AbortSignal.timeout(20000)});
      const feed = await response.json();
      if (!response.ok) throw Error(feed.error || "Activity is temporarily unavailable.");
      if (!panel.isConnected) return;
      const repoUrl = feed.repository ? "https://github.com/" + feed.repository.split("/").map(encodeURIComponent).join("/") : "";
      const deploy = feed.deployment;
      panel.innerHTML = '<div class="shared-columns">' + deploymentPanel(deploy, repoUrl) + '<section><h3>Recent commits</h3>' +
        (feed.commits.map(c => '<article class="shared-row"><div><a href="' + escape(repoUrl + "/commit/" + c.sha) + '" target="_blank" rel="noreferrer">' +
          escape(c.message.split("\n")[0]) + '</a><p>' + escape(c.author) + " · " + escape(feed.branch || "") + " · " + escape(c.sha.slice(0,7)) + " · " + escape(when(c.date)) + '</p></div></article>').join("") || empty(feed.githubNote || "No commits on the default branch.")) +
        (feed.brief.length ? '<h3>What changed</h3><ul>' + feed.brief.map(item => '<li>' + escape(item.text) + '</li>').join("") + '</ul>' : '') +
        '</section></div><section class="bp-panel"><h3>Repository contributors</h3><p>Latest six commits · '+(feed.pullsAvailable?'up to 50 recently updated pull requests':'pull request data unavailable')+'</p>'+
        (feed.contributors||[]).map(c=>'<div class="bp-bar"><span>'+escape(c.login)+'</span><progress value="'+c.commits+'" max="6"></progress><b>'+c.commits+' commits</b></div><div class="bp-bar"><span>Pull requests</span><progress value="'+c.pulls+'" max="50"></progress><b>'+c.pulls+' PRs</b></div>').join("")+'</section><p class="shared-muted">Updated '  + escape(when(feed.updatedAt)) + '</p>';
    } catch (error) {
      if (panel.isConnected) {
        panel.innerHTML = errorBox(error) + button("retry-project-feed", "Retry");
        bind("retry-project-feed", refresh);
      }
    } finally {
      panel.removeAttribute("aria-busy");
      refreshButton.disabled = false;
      refreshing = false;
    }
  }
  panel.innerHTML = skeleton("Loading repository activity");
  refreshButton.onclick = refresh;
  await refresh();
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
  bind("add-task", () => editTask());
  for (const t of data.tasks) bind("task-" + t.id, () => editTask(t));
}

function editTask(t) {
  return modal(
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
        select("skill","Skill",[["","Choose skill"],...studioSkills.map(s=>[s,s])],t?.skill||"") +
        select("blocked_by","Waits on",[["","No dependency"],...data.tasks.filter(b=>b.id!==t?.id).map(b=>[b.id,b.title])],t?.blocked_by||"") +
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
          blocked_by: form.get("blocked_by") || null,
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
