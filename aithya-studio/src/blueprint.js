import { mountPersonalStudio } from "./personal-studio.js";
import {
  studioSkills,
  assistContracts,
  cleanResult,
  taskInputFields,
} from "./assist-contract.js";
const stages = ["open", "in_progress", "review", "done"],
  labels = ["Backlog", "In progress", "Review", "Done"];
const levels = { beginner: 1, intermediate: 3, advanced: 4, expert: 5 };
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const words = (s) =>
  String(s || "")
    .trim()
    .split(/\s+/);
const clamp = (h) => Math.max(1, Math.min(12, Math.round(Number(h) || 4)));
const lines = (s) =>
  String(s || "")
    .split(/\n|(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
const list = (a) =>
  "<ul>" + a.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>";
const btn = (id, title) =>
  '<button type="button" class="button subtle" data-bp="' +
  esc(id) +
  '">' +
  esc(title) +
  "</button>";
const fld = (key, label, type = "text", value = "") =>
  "<label>" +
  esc(label) +
  (type === "textarea"
    ? '<textarea name="' + key + '">' + esc(value) + "</textarea>"
    : '<input type="' +
      type +
      '" name="' +
      key +
      '" value="' +
      esc(value) +
      '">') +
  "</label>";
const sel = (key, label, options) =>
  "<label>" +
  esc(label) +
  '<select name="' +
  key +
  '">' +
  options
    .map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + "</option>")
    .join("") +
  "</select></label>";
const panel = (title, html) =>
  '<section class="bp-panel"><h2>' + esc(title) + "</h2>" + html + "</section>";
const bar = (name, n, max, unit = "", kind = "") =>
  '<div class="bp-bar"><span>' +
  esc(name) +
  '</span><progress class="' +
  kind +
  '" value="' +
  Number(n) +
  '" max="' +
  Math.max(1, max, n) +
  '"></progress><b>' +
  esc(n + unit) +
  "</b></div>";
const input = (el, key) =>
  el.querySelector('[name="' + key + '"]')?.value.trim() || "";
const day = 86400000;
const dateEnd = (d) => (d ? new Date(d + "T23:59:59").getTime() : NaN);
const bestSkill = (t) =>
  /pitch|present|demo/i.test(t)
    ? "Pitching"
    : /design|mock|style/i.test(t)
      ? "UI design"
      : /sql|schema|database/i.test(t)
        ? "Databases"
        : /python|model|train/i.test(t)
          ? "Python / ML"
          : /server|api|auth/i.test(t)
            ? "Node"
            : "React";
export function allocate(tasks, members, skills, availability, existing = []) {
  const load = new Map(
    members.map((m) => [
      m.user_id,
      existing
        .filter((t) => t.owner_id === m.user_id && t.status !== "done")
        .reduce((n, t) => n + Number(t.estimated_hours), 0),
    ]),
  );
  return tasks.map((t) => {
    const skill = t.skill || bestSkill(t.title);
    const score = (m) => {
      const level = Math.max(
        0,
        ...skills
          .filter(
            (s) =>
              s.user_id === m.user_id &&
              s.skill_name.toLowerCase() === skill.toLowerCase(),
          )
          .map((s) => levels[s.verified_level] || 0),
      );
      const cap =
        availability.find((a) => a.user_id === m.user_id)?.weekly_hours ?? 8;
      return level * 2 - (load.get(m.user_id) || 0) / Math.max(1, cap);
    };
    const m = [...members].sort((a, b) => score(b) - score(a))[0];
    if (m)
      load.set(m.user_id, load.get(m.user_id) + Number(t.estimated_hours || 4));
    return { ...t, skill, owner_id: m?.user_id || null };
  });
}
export function pace(tasks, hours, end, now = Date.now()) {
  const total = tasks.reduce((a, t) => a + Number(t.estimated_hours), 0),
    done = tasks
      .filter((t) => t.status === "done")
      .reduce((a, t) => a + Number(t.estimated_hours), 0);
  const days = Number.isFinite(end) ? Math.max(0, (end - now) / day) : null;
  const capacity = days === null ? null : (days * hours) / 7,
    left = total - done;
  return {
    total,
    done,
    left,
    days,
    capacity,
    risk: !left
      ? "On track"
      : capacity === null
        ? "Set deadline"
        : !hours
          ? "Set availability"
          : left > capacity
            ? "At risk"
            : left > capacity * 0.8
              ? "Tight"
              : "On track",
  };
}
export function mountBlueprint(ctx) {
  const {
    project: p,
    data: d,
    tab,
    db,
    result,
    rpc,
    session,
    leader,
    modal,
    notify,
    refresh,
    openSheet,
    editTask,
    editConnections,
    editProfile,
    editPolicy,
  } = ctx;
  const root = document.querySelector("#shared-content");
  const team = d.members.filter((m) => m.status === "accepted" && m.user_id);
  const name = (id) =>
    team.find((m) => m.user_id === id)?.full_name || "Unassigned";
  const uid = session.user.id;
  const metric = pace(
    d.tasks,
    d.availability.reduce((s, a) => s + Number(a.weekly_hours), 0),
    dateEnd(p.submission_deadline),
  );
  const memberOptions = team.map((m) => [m.user_id, m.full_name]);
  const knownRules = d.requirements.map((r) => r.title);
  const taskText = d.tasks
    .map((t) => t.title + " · " + t.status + " · " + name(t.owner_id))
    .join("\n");
  const matchesGemini = (s) => /gemini|google ai/i.test(s);
  const permitted =
    d.ai?.external_ai_apis_allowed &&
    d.ai?.gemini_planning_allowed &&
    !(d.ai.prohibited_ai_tools || []).some(matchesGemini) &&
    (!(d.ai.permitted_ai_tools || []).length ||
      d.ai.permitted_ai_tools.some(matchesGemini));
  const skills = studioSkills.map((s) => [s, s]);
  let timer, channel;
  function bind(id, fn, node = root) {
    for (const b of node.querySelectorAll('[data-bp="' + CSS.escape(id) + '"]'))
      b.onclick = async () => {
        b.disabled = true;
        try {
          await fn(b);
        } catch (e) {
          notify(e.message);
        } finally {
          b.disabled = false;
        }
      };
  }
  function add(html) {
    root.insertAdjacentHTML("beforeend", html);
  }
  function form(title, html, save) {
    modal(title, html, save, refresh);
  }
  const write = (table, row) => result(db.from(table).insert(row));
  async function aiJSON(task, inputData, fallback) {
    if (permitted)
      try {
        const response = await fetch("/api/assist", {
          method: "POST",
          headers: {
            authorization: "Bearer " + session.access_token,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            projectId: p.id,
            task,
            input: Object.fromEntries(
              taskInputFields
                .filter((k) => typeof inputData[k] === "string")
                .map((k) => [k, inputData[k].slice(0, 6000)]),
            ),
          }),
        });
        if (!response.ok) throw Error();
        return {
          data: cleanResult(
            assistContracts[task][2],
            (await response.json()).data,
          ),
          ai: true,
        };
      } catch {
        notify("Gemini was unavailable. Review the Basic draft or try again.");
      }
    return { data: fallback(), ai: false };
  }
  function draft(task, result, save, label) {
    if (!root.isConnected) return;
    const { data, ai } = result;
    let box = root.querySelector(".bp-draft");
    if (!box) {
      add('<section class="bp-panel bp-draft" aria-live="polite"></section>');
      box = root.querySelector(".bp-draft");
    }
    const show = (v) =>
      Array.isArray(v)
        ? "<ol>" + v.map((x) => "<li>" + show(x) + "</li>").join("") + "</ol>"
        : v && typeof v === "object"
          ? Object.entries(v)
              .map(
                ([k, x]) =>
                  "<div><b>" +
                  esc(
                    {
                      t: "Task",
                      sk: "Skill",
                      h: "Hours",
                      dep: "Dependency index",
                      keyPoints: "Key points",
                    }[k] || k,
                  ) +
                  "</b> " +
                  show(x) +
                  "</div>",
              )
              .join("")
          : esc(v ?? "None");
    box.innerHTML =
      "<h2>" +
      esc(ai ? "Gemini draft" : "Basic draft") +
      "</h2>" +
      show(data) +
      (save ? btn("apply-draft", label || "Apply draft") : "");
    bind(
      "apply-draft",
      async () => {
        await save(data, ai);
        if (root.isConnected) await refresh();
      },
      box,
    );
    box.scrollIntoView({ block: "nearest" });
  }
  function assisted(id, task, context, fallback, save, label) {
    bind(id, async () =>
      draft(task, await aiJSON(task, context(), fallback), save, label),
    );
  }
  const suggestOwner = (t, sk, h) =>
    allocate(
      [{ title: t, skill: sk, estimated_hours: h }],
      team,
      d.skills,
      d.availability,
      d.tasks,
    )[0].owner_id;
  function taskRows(items) {
    return items
      .filter((x) => x.t?.trim())
      .slice(0, 8)
      .map((x) => {
        const sk = studioSkills.includes(x.sk) ? x.sk : bestSkill(x.t);
        const matches = team.filter(
          (m) =>
            m.full_name.toLowerCase().split(" ")[0] ===
            String(x.owner || "")
              .toLowerCase()
              .split(" ")[0],
        );
        return {
          project_id: p.id,
          title: x.t.trim().slice(0, 200),
          skill: sk,
          estimated_hours: clamp(x.h),
          owner_id:
            matches.length === 1
              ? matches[0].user_id
              : suggestOwner(x.t, sk, x.h),
        };
      });
  }
  const post = (kind, body, extra = {}) =>
    write("project_messages", { project_id: p.id, kind, body, ...extra });
  const milestones = d.milestones || [];
  function charts() {
    const counts = stages.map(
      (s) => d.tasks.filter((t) => t.status === s).length,
    );
    return (
      panel(
        "Task status",
        labels
          .map((l, i) => bar(l, counts[i], d.tasks.length, "", stages[i]))
          .join(""),
      ) +
      panel(
        "Workload · hours",
        team
          .map((m) => {
            const assigned = d.tasks
                .filter((t) => t.owner_id === m.user_id && t.status !== "done")
                .reduce((n, t) => n + Number(t.estimated_hours), 0),
              cap =
                d.availability.find((a) => a.user_id === m.user_id)
                  ?.weekly_hours || 0;
            return bar(
              m.full_name + " · " + cap + " h/wk",
              assigned,
              cap,
              " h",
              assigned > cap ? "over" : "",
            );
          })
          .join("") || "Add teammates.",
      ) +
      panel(
        "Work completed · hours",
        team
          .map((m) => {
            const tasks = d.tasks.filter((t) => t.owner_id === m.user_id);
            return bar(
              m.full_name,
              tasks
                .filter((t) => t.status === "done")
                .reduce((s, t) => s + Number(t.estimated_hours), 0),
              tasks.reduce((s, t) => s + Number(t.estimated_hours), 0),
              " h",
              "done",
            );
          })
          .join(""),
      )
    );
  }
  function milestoneStrip() {
    const start = Date.parse(p.start_date || p.created_at.slice(0, 10)),
      finish = Date.parse(p.submission_deadline || "");
    if (!(finish > start)) return "";
    const x = (date) =>
      18 + 464 * Math.max(0, Math.min(1, (date - start) / (finish - start)));
    const today = x(Date.now()),
      items = milestones
        .filter(
          (m) => Date.parse(m.due) >= start && Date.parse(m.due) <= finish,
        )
        .slice()
        .sort((a, b) => a.due.localeCompare(b.due))
        .slice(0, 12);
    return (
      '<figure class="deadline-axis"><svg viewBox="0 0 500 46" role="img" aria-label="Milestones along the project timeline"><line x1="18" x2="482" y1="30" y2="30" class="axis-line"></line><line x1="' +
      today +
      '" x2="' +
      today +
      '" y1="8" y2="45" class="today-mark"></line>' +
      items
        .map(
          (m, i) =>
            "<g><title>" +
            esc(m.name + " · " + m.due) +
            '</title><circle cx="' +
            x(Date.parse(m.due)) +
            '" cy="30" r="9" class="' +
            (m.done ? "completed" : "planned") +
            '"></circle><text x="' +
            x(Date.parse(m.due)) +
            '" y="33" text-anchor="middle">' +
            (i + 1) +
            "</text></g>",
        )
        .join("") +
      "</svg>" +
      "<figcaption><span>" +
      esc(p.start_date || p.created_at.slice(0, 10)) +
      "</span><span>Dashed line · Today</span><span>" +
      esc(p.submission_deadline) +
      "</span></figcaption></figure>"
    );
  }
  function clock() {
    const end = dateEnd(p.submission_deadline),
      start = new Date(
        (p.start_date || p.created_at.slice(0, 10)) + "T00:00:00",
      ).getTime();
    const elapsed =
      Number.isFinite(end) && end > start
        ? Math.round(
            Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) *
              100,
          )
        : null;
    const completion = metric.total
      ? Math.round((100 * metric.done) / metric.total)
      : 0;
    const needed = metric.days
      ? Math.round((metric.left / metric.days) * 10) / 10
      : metric.left;
    return panel(
      "Hackathon clock",
      '<strong class="bp-time" data-clock></strong><p>' +
        esc(metric.risk) +
        " · " +
        needed +
        " h/day needed · " +
        (
          d.availability.reduce((s, a) => s + Number(a.weekly_hours), 0) / 7
        ).toFixed(1) +
        " h/day available</p>" +
        milestoneStrip() +
        (elapsed !== null
          ? bar("Time used", elapsed, 100, "%") +
            bar("Work done", completion, 100, "%", "done") +
            "<p>" +
            esc(
              completion >= elapsed
                ? "On pace"
                : elapsed - completion <= 15
                  ? "Slightly behind"
                  : "Behind the clock",
            ) +
            "</p>"
          : "Set start and submission dates in Project setup.") +
        "",
    );
  }
  function tick() {
    const n = root.querySelector("[data-clock]");
    if (!n) return;
    const deadline = dateEnd(p.submission_deadline);
    let s = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    n.textContent = !Number.isFinite(s)
      ? "Set deadline"
      : s === 0
        ? "Deadline reached"
        : Math.floor(s / 86400) +
          "d " +
          Math.floor((s % 86400) / 3600) +
          "h " +
          Math.floor((s % 3600) / 60) +
          "m " +
          (s % 60) +
          "s";
  }
  const evidence = p.submission_evidence || {};
  const checklist = ["Tests", "README", "Demo video"];
  const verified = d.requirements.filter((r) => r.verified).length;
  const readiness =
    (Number(!!p.repository) +
      checklist.filter((k) => evidence[k]).length +
      (d.requirements.length ? verified / d.requirements.length : 0)) /
    5;
  function overview() {
    const secondary = document.createElement("details");
    secondary.className = "studio-more";
    const label = document.createElement("summary");
    label.textContent = "Project brief and readiness details";
    secondary.append(label, ...root.children);
    const completed = d.tasks.filter((t) => t.status === "done").length;
    const upcoming = milestones
      .filter((m) => !m.done)
      .slice()
      .sort((a, b) => a.due.localeCompare(b.due))[0];
    const metricItem = (label, value) =>
      "<div><small>" +
      esc(label) +
      "</small><strong>" +
      esc(value) +
      "</strong></div>";
    root.insertAdjacentHTML(
      "afterbegin",
      '<div class="studio-metrics">' +
        metricItem("Readiness", Math.round(readiness * 100) + "%") +
        metricItem("Deadline risk", metric.risk) +
        metricItem("Tasks done", completed + " / " + d.tasks.length) +
        "</div>" +
        '<div class="hero-timeline">' +
        clock() +
        (upcoming
          ? "<p>Next milestone · " +
            esc(upcoming.name) +
            " · " +
            esc(upcoming.due) +
            "</p>"
          : "") +
        btn("open-timeline", "Open timeline") +
        "</div>" +
        '<div class="overview-columns">' +
        panel("Weekly status", btn("week", "Refresh summary")) +
        panel(
          "Team workload",
          team
            .map((m) => {
              const total = d.tasks
                .filter((t) => t.owner_id === m.user_id && t.status !== "done")
                .reduce((sum, t) => sum + Number(t.estimated_hours), 0);
              const capacity = Number(
                d.availability.find((a) => a.user_id === m.user_id)
                  ?.weekly_hours || 0,
              );
              return bar(
                m.full_name,
                total,
                capacity,
                total === 1 ? " h" : " h",
                total > capacity ? "over" : "",
              );
            })
            .join("") || "Invite teammates to see workloads.",
        ) +
        "</div>",
    );
    root.append(secondary);
    bind("open-timeline", () => openSheet("Timeline"));
    bind("submission", () => openSheet("Ship"));
    assisted(
      "week",
      "week.status",
      () => ({
        project: p.name,
        tasks: taskText,
        metrics: JSON.stringify(metric),
      }),
      () => ({
        text:
          metric.done +
          " of " +
          metric.total +
          " estimated hours complete. " +
          metric.risk +
          ". Next: " +
          (d.tasks.find((t) => t.status !== "done")?.title ||
            "review submission evidence"),
      }),
    );
  }
  function timeline() {
    add(
      '<div class="hero-timeline">' +
        clock() +
        '</div><div class="bp-grid">' +
        panel(
          "Milestones",
          '<ol class="bp-timeline">' +
            [
              ...milestones.map((m) => ({
                date: m.due,
                label: m.name,
                done: m.done,
                id: m.id,
              })),
              { date: new Date().toLocaleDateString("en-CA"), label: "Today" },
              { date: p.start_date, label: "Start" },
              { date: p.submission_deadline, label: "Submission" },
            ]
              .filter((m) => m.date)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(
                (m) =>
                  "<li>" +
                  esc(m.date) +
                  " · " +
                  esc(m.label) +
                  (m.done ? " · Done" : "") +
                  (m.id && leader
                    ? btn("mark-" + m.id, m.done ? "Reopen" : "Complete") +
                      btn("edit-date-" + m.id, "Edit") +
                      btn("drop-" + m.id, "Delete milestone")
                    : "") +
                  "</li>",
              )
              .join("") +
            "</ol>" +
            (leader ? btn("milestone", "Add milestone") : ""),
        ) +
        charts() +
        "</div>",
    );
    bind("milestone", () =>
      form(
        "Add milestone",
        fld("name", "Name") + fld("due", "Due date", "date"),
        (f) =>
          write("milestones", { project_id: p.id, ...Object.fromEntries(f) }),
      ),
    );
    for (const m of milestones) {
      bind("edit-date-" + m.id, () =>
        form(
          "Edit milestone",
          fld("name", "Name", "text", m.name) +
            fld("due", "Due date", "date", m.due),
          (f) =>
            result(
              db
                .from("milestones")
                .update({ name: f.get("name"), due: f.get("due") })
                .eq("id", m.id),
            ),
        ),
      );

      bind("mark-" + m.id, async () => {
        await result(
          db.from("milestones").update({ done: !m.done }).eq("id", m.id),
        );
        await refresh();
      });
      bind("drop-" + m.id, () =>
        form("Delete milestone", "<p>" + esc(m.name) + "</p>", () =>
          result(db.from("milestones").delete().eq("id", m.id)),
        ),
      );
    }
    add(
      panel(
        "What-if simulation",
        fld("finish", "Simulated deadline", "date", p.submission_deadline) +
          sel("absent", "Exclude member", [
            ["", "Full team"],
            ...memberOptions,
          ]) +
          sel("cut", "Cut one task", [
            ["", "Keep all tasks"],
            ...d.tasks.map((t) => [t.id, t.title]),
          ]) +
          btn("simulate", "Compare pace") +
          '<output id="simulation"></output>',
      ),
    );
    bind("simulate", () => {
      const hours = d.availability
        .filter((a) => a.user_id !== input(root, "absent"))
        .reduce((s, a) => s + Number(a.weekly_hours), 0);
      const next = pace(
        d.tasks.filter((t) => t.id !== input(root, "cut")),
        hours,
        dateEnd(input(root, "finish")),
      );
      root.querySelector("#simulation").textContent =
        metric.risk +
        " → " +
        next.risk +
        " · " +
        next.left +
        " open hours / " +
        Math.round(next.capacity || 0) +
        " available hours";
    });
  }
  function board() {
    const toolbar = panel(
      "Board tools",
      btn("allocate", "Preview allocation") +
        fld("idea", "Task idea") +
        btn("suggest", "Suggest subtasks"),
    );
    const cards = stages
      .map(
        (stage, i) =>
          '<section class="bp-lane" data-stage="' +
          stage +
          '"><h3>' +
          labels[i] +
          "</h3>" +
          d.tasks
            .filter((t) => t.status === stage)
            .map((t) => {
              const blocker = d.tasks.find(
                (b) => b.id === t.blocked_by && b.status !== "done",
              );
              return (
                '<article class="bp-card" draggable="true" data-id="' +
                t.id +
                '"><b>' +
                esc(t.title) +
                "</b><p>" +
                esc(name(t.owner_id)) +
                " · " +
                esc(t.skill || "Skill unspecified") +
                " · " +
                Number(t.estimated_hours) +
                " h</p>" +
                (blocker
                  ? '<p class="bp-warn">Waiting on ' +
                    esc(blocker.title) +
                    "</p>"
                  : "") +
                (i ? btn("prev-" + t.id, "Move to " + labels[i - 1]) : "") +
                (i < 3 ? btn("next-" + t.id, "Move to " + labels[i + 1]) : "") +
                btn("edit-" + t.id, "Edit task") +
                btn("split-" + t.id, "Reduce scope") +
                btn("learn-" + t.id, "Learn this task") +
                (leader ? btn("delete-" + t.id, "Delete task") : "") +
                "</article>"
              );
            })
            .join("") +
          "</section>",
      )
      .join("");
    const old = root.querySelectorAll(".shared-row");
    old.forEach((el) => (el.hidden = true));
    root
      .querySelector("header")
      .insertAdjacentHTML(
        "afterend",
        toolbar + '<div class="bp-board">' + cards + "</div>",
      );
    const move = async (id, status) => {
      await result(
        db
          .from("project_tasks")
          .update({ status })
          .eq("project_id", p.id)
          .eq("id", id),
      );
      await refresh();
    };
    root
      .querySelectorAll("[draggable]")
      .forEach(
        (el) =>
          (el.ondragstart = (e) =>
            e.dataTransfer.setData("text/plain", el.dataset.id)),
      );
    root.querySelectorAll("[data-stage]").forEach((el) => {
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (d.tasks.some((t) => t.id === id))
          try {
            await move(id, el.dataset.stage);
          } catch (err) {
            notify(err.message);
          }
      };
    });
    for (const t of d.tasks) {
      const i = stages.indexOf(t.status);
      bind("prev-" + t.id, () => move(t.id, stages[i - 1]));
      bind("next-" + t.id, () => move(t.id, stages[i + 1]));
      bind("edit-" + t.id, () =>
        document.getElementById("task-" + t.id).click(),
      );
      bind("delete-" + t.id, () =>
        form("Delete task", "<p>" + esc(t.title) + "</p>", () =>
          result(db.from("project_tasks").delete().eq("id", t.id)),
        ),
      );
      assisted(
        "split-" + t.id,
        "task.suggest",
        () => ({ title: t.title, project: p.name }),
        () => ({
          skill: t.skill || bestSkill(t.title),
          hours: Math.max(1, Math.ceil(t.estimated_hours / 2)),
          subtasks: [
            "Build one working example for " + t.title,
            "Test that example",
          ],
        }),
        (x) =>
          result(
            db
              .from("project_tasks")
              .update({
                title: x.subtasks[0].slice(0, 200),
                estimated_hours: clamp(x.hours),
                skill: x.skill,
              })
              .eq("id", t.id),
          ),
        "Use smaller scope",
      );
      const skill = t.skill || bestSkill(t.title),
        docs = {
          React: "https://react.dev/learn",
          Node: "https://nodejs.org/en/learn",
          "Python / ML": "https://docs.python.org/3/tutorial/",
          "UI design": "https://www.w3.org/WAI/tutorials/",
          Databases: "https://www.postgresql.org/docs/current/tutorial.html",
          Pitching: "https://www.ycombinator.com/library",
        };
      bind("learn-" + t.id, async () => {
        const out = await aiJSON(
          "learn.card",
          {
            title: t.title,
            skills: d.skills
              .filter((s) => s.user_id === t.owner_id)
              .map((s) => s.skill_name + " " + s.self_assessed_level)
              .join(", "),
          },
          () => ({
            explanation:
              "Study one worked example in " +
              skill +
              ". Identify its input, expected result and how you would test it for " +
              t.title +
              ".",
            firstStep: "Reproduce the smallest example and record its output.",
          }),
        );
        draft("learn.card", out);
        if (!root.isConnected) return;
        root
          .querySelector(".bp-draft")
          .insertAdjacentHTML(
            "beforeend",
            '<a href="' +
              (docs[skill] || docs[bestSkill(t.title)]) +
              '" target="_blank" rel="noreferrer">Read the official resource</a>',
          );
      });
    }
    const open = d.tasks.filter((t) => t.status === "open");
    bind("allocate", () => {
      const assigned = allocate(
        open,
        team,
        d.skills,
        d.availability,
        d.tasks.filter((t) => t.status !== "open"),
      );
      draft(
        "allocation",
        {
          ai: false,
          data: {
            assignments: assigned.map(
              (t) => t.title + " → " + name(t.owner_id),
            ),
          },
        },
        async () => {
          for (const t of assigned)
            await result(
              db
                .from("project_tasks")
                .update({ owner_id: t.owner_id, skill: t.skill })
                .eq("id", t.id)
                .eq("status", "open"),
            );
        },
        "Apply allocation",
      );
    });
    bind("suggest", async () => {
      const title = input(root, "idea");
      if (!title) throw Error("Enter a task idea.");
      const out = await aiJSON(
        "task.suggest",
        { title, project: p.name, stack: p.technology_stack.join(", ") },
        () => ({
          skill: bestSkill(title),
          hours: 4,
          subtasks: ["Prototype " + title, "Test " + title],
        }),
      );
      out.data.owner = name(
        suggestOwner(title, out.data.skill, out.data.hours),
      );
      draft(
        "task.suggest",
        out,
        (x) =>
          write(
            "project_tasks",
            taskRows(
              x.subtasks.map((t) => ({
                t,
                sk: x.skill,
                h: Math.ceil(clamp(x.hours) / x.subtasks.length),
              })),
            ),
          ),
        "Add subtasks to board",
      );
    });
    add(
      panel(
        "Dependencies",
        list(
          d.tasks
            .filter(
              (t) =>
                t.blocked_by &&
                d.tasks.some(
                  (b) => b.id === t.blocked_by && b.status !== "done",
                ),
            )
            .sort((a, b) =>
              (a.due_date || "9999").localeCompare(b.due_date || "9999"),
            )
            .map(
              (t) =>
                t.title +
                " waits on " +
                d.tasks.find((b) => b.id === t.blocked_by).title,
            ),
        ),
      ),
    );
  }
  async function saveCompletePlan(plan) {
    const newRequirements = [
      ...new Set(
        plan.requirements
          .map((t) => t.trim().slice(0, 200))
          .filter((t) => t && !knownRules.includes(t)),
      ),
    ];
    const rows = allocate(
      taskRows(plan.tasks),
      team,
      d.skills,
      d.availability,
      d.tasks,
    );
    if (!newRequirements.length && !rows.length && !plan.milestones.length)
      throw Error("Add requirements or project details to build a plan.");
    const ids = rows.map(() => crypto.randomUUID());
    const mapped = rows.map((row, i) => ({
      ...row,
      id: ids[i],
      blocked_by:
        Number.isInteger(plan.tasks[i].dep) &&
        plan.tasks[i].dep >= 0 &&
        plan.tasks[i].dep < i
          ? ids[plan.tasks[i].dep]
          : null,
    }));
    await rpc("apply_studio_plan", {
      p_project: p.id,
      p_requirements: newRequirements,
      p_tasks: mapped,
      p_milestones: plan.milestones.filter(
        (m) =>
          /^\d{4}-\d{2}-\d{2}$/.test(m.due) &&
          (!p.submission_deadline || m.due <= p.submission_deadline),
      ),
      p_roles: plan.roles,
    });
  }
  function forecastTools() {
    if (tab === "Timeline" && leader) {
      add(
        panel("Milestone planning", btn("milestone-draft", "Draft milestones")),
      );
      assisted(
        "milestone-draft",
        "timeline.milestones",
        () => ({}),
        () => ({
          milestones: p.submission_deadline
            ? [
                {
                  name: "Review the submission checklist",
                  due: p.submission_deadline,
                },
              ]
            : [],
        }),
        async (x) => {
          const rows = x.milestones
            .filter(
              (m) =>
                /^\d{4}-\d{2}-\d{2}$/.test(m.due) &&
                (!p.submission_deadline || m.due <= p.submission_deadline),
            )
            .map((m) => ({
              project_id: p.id,
              name: m.name.slice(0, 200),
              due: m.due,
            }));
          if (!rows.length)
            throw Error(
              "Set the submission deadline or enter a valid milestone date.",
            );
          await write("milestones", rows);
        },
        "Add milestones",
      );
    }
    if (tab === "Overview") {
      add(
        panel(
          "Plan health",
          btn("replan", "Draft a replan") + btn("retro", "Draft retrospective"),
        ),
      );
      assisted(
        "replan",
        "project.replan",
        () => ({}),
        () => ({
          text: metric.risk + " · " + metric.left + " estimated hours remain.",
          actions: [
            "Review unfinished milestones",
            "Protect mandatory requirements",
            "Trim optional work",
          ],
          hoursSaved: 0,
        }),
      );
      assisted(
        "retro",
        "project.retro",
        () => ({}),
        () => ({
          summary: metric.done + " estimated hours delivered.",
          wentWell: d.tasks
            .filter((t) => t.status === "done")
            .slice(0, 4)
            .map((t) => t.title),
          change: ["Review which estimates missed the mark."],
        }),
        (x) =>
          post(
            "lesson",
            [x.summary, ...x.wentWell, ...x.change].join("\n").slice(0, 6000),
          ),
        "Save retrospective to memory",
      );
    }
    if (tab === "Setup" && leader && d.personalReady) {
      add(panel("Project intake", btn("full-plan", "Draft a complete plan")));
      assisted(
        "full-plan",
        "project.intake",
        () => ({}),
        () => ({
          requirements: knownRules,
          tasks: knownRules
            .slice(0, 4)
            .flatMap((t) => [
              { t: "Deliver " + t, sk: bestSkill(t), h: 4, dep: null },
            ]),
          milestones: p.submission_deadline
            ? [{ name: "Review submission", due: p.submission_deadline }]
            : [],
          roles: team.map((m) => m.full_name + " · " + m.role),
        }),
        saveCompletePlan,
        "Apply plan and allocations",
      );
    }
    if (tab === "Activity") {
      add(
        panel(
          "Explain a deploy failure",
          fld(
            "safe-log",
            "Relevant build error · remove tokens and secrets",
            "textarea",
          ) + btn("explain", "Explain failure"),
        ),
      );
      assisted(
        "explain",
        "deploy.explain",
        () => ({ log: input(root, "safe-log") }),
        () => ({
          text: "Read the first build error in the deployment log.",
          steps: [
            "Check the framework, build command and required environment names.",
            "Reproduce the same build locally before retrying.",
          ],
        }),
      );
    }
  }
  let messages = [],
    files = [],
    votes = [],
    loadVersion = 0;
  async function readChat() {
    const version = ++loadVersion;
    const rows = await result(
      db
        .from("project_messages")
        .select("*")
        .eq("project_id", p.id)
        .order("created_at", { ascending: false })
        .limit(100),
    );
    const ids = rows.map((m) => m.id);
    const [attachments, ballots] = await Promise.all([
      ids.length
        ? result(db.from("message_files").select("*").in("message_id", ids))
        : [],
      ids.length
        ? result(db.from("poll_votes").select("*").in("message_id", ids))
        : [],
    ]);
    if (!root.isConnected || loadVersion !== version) return;
    messages = rows.reverse();
    files = attachments;
    votes = ballots;
    if (tab === "Chat") drawMessages();
  }
  function drawMessages() {
    const target = root.querySelector("#bp-messages");
    if (!target) return;
    const follow =
      target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    target.innerHTML =
      messages
        .map((m) => {
          const poll =
            m.kind === "poll"
              ? m.poll
                  .map((o, i) => {
                    const n = votes.filter(
                      (v) => v.message_id === m.id && v.option === i,
                    ).length;
                    return (
                      btn(
                        "vote-" + m.id + "-" + i,
                        (votes.some(
                          (v) =>
                            v.message_id === m.id &&
                            v.user_id === uid &&
                            v.option === i,
                        )
                          ? "Selected · "
                          : "Vote · ") + o,
                      ) +
                      bar(
                        o,
                        n,
                        votes.filter((v) => v.message_id === m.id).length,
                        " votes",
                      )
                    );
                  })
                  .join("")
              : "";
          const task =
            m.kind === "task"
              ? "<p>" +
                esc(name(m.task.to)) +
                " · " +
                esc(m.task.skill) +
                " · " +
                esc(m.task.hours) +
                " h · " +
                esc(m.task.due || "No due date") +
                " · " +
                esc(m.task.state) +
                "</p>" +
                (m.task.to === uid && m.task.state === "proposed"
                  ? btn("accept-" + m.id, "Accept task") +
                    btn("decline-" + m.id, "Decline task")
                  : "")
              : "";
          return (
            '<article class="chat-bubble ' +
            (m.author_id === uid ? "mine" : "theirs") +
            '"><small>' +
            esc(m.author_id === uid ? "You" : name(m.author_id)) +
            " · " +
            esc(
              new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            ) +
            "</small><p>" +
            esc(m.body) +
            "</p>" +
            task +
            poll +
            files
              .filter((f) => f.message_id === m.id)
              .map((f) => btn("file-" + f.id, "Open " + f.name))
              .join("") +
            (m.author_id === uid &&
            Date.now() - Date.parse(m.created_at) < 300000
              ? btn("revise-" + m.id, "Edit message")
              : "") +
            (leader ? btn("remove-" + m.id, "Delete message") : "") +
            "</article>"
          );
        })
        .join("") || "<p>Start the team conversation.</p>";
    if (follow) target.scrollTop = target.scrollHeight;
    root.querySelector("#bp-attachments").innerHTML =
      files.map((f) => btn("file-" + f.id, "Open " + f.name)).join("") ||
      "No shared attachments.";
    for (const m of messages) {
      bind("revise-" + m.id, () =>
        form("Edit message", fld("body", "Message", "textarea", m.body), (f) =>
          result(
            db
              .from("project_messages")
              .update({ body: f.get("body") })
              .eq("id", m.id),
          ),
        ),
      );
      bind("remove-" + m.id, () =>
        form("Delete message", "<p>" + esc(m.body) + "</p>", () =>
          result(db.from("project_messages").delete().eq("id", m.id)),
        ),
      );
      for (const accept of [true, false])
        bind((accept ? "accept-" : "decline-") + m.id, async () => {
          await rpc("respond_to_proposal", {
            p_message: m.id,
            p_accept: accept,
          });
          await refresh();
        });
      m.poll?.forEach((_, i) =>
        bind("vote-" + m.id + "-" + i, async () => {
          await rpc("cast_project_vote", { p_message: m.id, p_option: i });
          await readChat();
        }),
      );
    }
    for (const f of files)
      bind("file-" + f.id, async () => {
        const blob = await result(
          db.storage.from("team-chat").download(f.storage_path),
        );
        const url = URL.createObjectURL(blob);
        const box = root.querySelector("#bp-file-preview");
        box.replaceChildren();
        if (
          ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            blob.type,
          )
        ) {
          const img = new Image();
          img.src = url;
          img.alt = f.name;
          box.append(img);
        }
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.textContent = "Download " + f.name;
        box.append(a);
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      });
  }
  const recent = () =>
    messages
      .slice(-40)
      .map((m) => name(m.author_id) + ": " + m.body)
      .join("\n");
  const teamNames = () => team.map((m) => m.full_name).join(", ");
  function chat() {
    add(
      '<section class="studio-chat" aria-label="Project chats"><div class="studio-chat-list"><header><h2>Chats</h2></header>' +
        '<button type="button" class="conversation-link" data-bp="team-thread" aria-current="true"><span class="chat-avatar" aria-hidden="true">#</span><span><strong>' +
        esc(p.name) +
        " team</strong><small>Project channel</small></span></button>" +
        '<div id="studio-private-list"></div></div><div class="studio-chat-thread" id="studio-team-thread">' +
        "<header><div><h2>" +
        esc(p.name) +
        " team</h2><p>" +
        team.length +
        ' members</p></div><button type="button" class="mobile-chat-back button subtle" data-bp="chat-back">All chats</button></header>' +
        '<div id="bp-messages" class="studio-chat-log" role="log" aria-live="polite"></div>' +
        '<div class="studio-composer"><details><summary>Actions</summary><div class="chat-actions">' +
        btn("poll", "Create poll") +
        btn("propose", "Propose task") +
        btn("edit-task-chat", "Edit task") +
        (leader ? btn("edit-milestone-chat", "Edit milestone") : "") +
        btn("report-chat", "Share report") +
        btn("voice", "Dictate stand-up") +
        sel("kind", "Post as", [
          ["text", "Message"],
          ["decision", "Decision"],
          ["lesson", "Lesson"],
          ["standup", "Stand-up"],
        ]) +
        '<details><summary>Shared files</summary><div id="bp-attachments"></div></details>' +
        "<details><summary>Conversation tools</summary>" +
        btn("thread", "Summarize thread") +
        btn("actions", "Find action items") +
        btn("merge", "Merge stand-ups") +
        fld("notes", "Shared meeting notes", "textarea") +
        btn("summarize", "Summarize notes") +
        (leader
          ? fld(
              "digest",
              "Post digest at (UTC)",
              "time",
              p.digest_time?.slice(0, 5),
            ) + btn("digest", "Save digest time")
          : "") +
        "</details></div></details>" +
        '<label class="studio-attach" title="Attach a file"><span aria-hidden="true">＋</span><span class="studio-sr">Attach a file up to 10 MB</span><input type="file" name="attach"></label>' +
        '<label class="studio-message-field"><span class="studio-sr">Message</span><textarea name="chat-body" rows="1" placeholder="Write a message" maxlength="6000"></textarea></label>' +
        btn("send", "Send") +
        '<output id="studio-attachment-name"></output></div><div id="bp-file-preview" aria-live="polite"></div></div><div id="v3-conversation" class="studio-chat-thread" hidden></div></section>',
    );
    const frame = root.querySelector(".studio-chat");
    const activateTeam = () => {
      frame.classList.add("show-thread");
      root.querySelector("#studio-team-thread").hidden = false;
      root.querySelector("#v3-conversation").hidden = true;
      root
        .querySelector('[data-bp="team-thread"]')
        .setAttribute("aria-current", "true");
      root.dispatchEvent(new Event("team-thread-open"));
    };
    bind("team-thread", activateTeam);
    bind("chat-back", () => frame.classList.remove("show-thread"));
    root.querySelector('[name="attach"]').onchange = (e) => {
      root.querySelector("#studio-attachment-name").textContent =
        e.target.files[0]?.name || "";
    };
    root.querySelector('[name="chat-body"]').onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        root.querySelector('[data-bp="send"]').click();
      }
    };
    bind("edit-task-chat", () =>
      modal(
        "Choose a task",
        sel(
          "task",
          "Task",
          d.tasks.map((t) => [t.id, t.title]),
        ),
        (f) => {
          root.dataset.editTask = f.get("task");
        },
        () => {
          const task = d.tasks.find((t) => t.id === root.dataset.editTask);
          if (task) editTask(task);
        },
      ),
    );
    bind("edit-milestone-chat", () =>
      modal(
        "Choose a milestone",
        sel(
          "milestone",
          "Milestone",
          milestones.map((m) => [m.id, m.name]),
        ),
        (f) => {
          root.dataset.editMilestone = f.get("milestone");
        },
        () => {
          const m = milestones.find((m) => m.id === root.dataset.editMilestone);
          if (m)
            form(
              "Edit milestone",
              fld("name", "Name", "text", m.name) +
                fld("due", "Due date", "date", m.due),
              (f) =>
                result(
                  db
                    .from("milestones")
                    .update({ name: f.get("name"), due: f.get("due") })
                    .eq("id", m.id),
                ),
            );
        },
      ),
    );
    bind("report-chat", () => openSheet("Report"));
    bind("digest", async () => {
      await result(
        db
          .from("projects")
          .update({ digest_time: input(root, "digest") || null })
          .eq("id", p.id),
      );
      notify("Digest schedule saved.");
    });
    bind("send", async () => {
      const file = root.querySelector("[name=attach]").files[0],
        body = input(root, "chat-body") || file?.name;
      if (!body) throw Error("Write a message or choose a file.");
      if (file && (!file.size || file.size > 10 * 1024 * 1024))
        throw Error("Choose a file between one byte and 10 MB.");
      const msg = await result(
        db
          .from("project_messages")
          .insert({ project_id: p.id, kind: input(root, "kind"), body })
          .select("id")
          .single(),
      );
      root.querySelector("[name=chat-body]").value = "";
      if (file) {
        const path = p.id + "/" + msg.id + "/" + crypto.randomUUID();
        await result(db.storage.from("team-chat").upload(path, file));
        try {
          await write("message_files", {
            message_id: msg.id,
            project_id: p.id,
            storage_path: path,
            name: file.name,
            mime: file.type,
            size: file.size,
          });
        } catch (e) {
          await db.storage.from("team-chat").remove([path]);
          throw e;
        }
        root.querySelector("[name=attach]").value = "";
        root.querySelector("#studio-attachment-name").textContent = "";
      }
      await readChat();
    });
    bind("voice", () => {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech)
        throw Error(
          "Dictation is unavailable in this browser. Type your stand-up in the message field.",
        );
      const mic = new Speech();
      mic.onresult = (e) => {
        root.querySelector("[name=chat-body]").value =
          e.results[0][0].transcript;
        root.querySelector("[name=kind]").value = "standup";
      };
      mic.onerror = () =>
        notify("Dictation stopped. Type your stand-up or try again.");
      mic.start();
    });
    bind("poll", () =>
      form(
        "Create poll",
        fld("q", "Question") +
          fld("options", "Options · one per line (2–5)", "textarea"),
        async (f) => {
          const options = String(f.get("options"))
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);
          if (options.length < 2 || options.length > 5)
            throw Error("Enter two to five options.");
          await post("poll", f.get("q"), { poll: options });
        },
      ),
    );
    bind("propose", () =>
      form(
        "Propose task",
        fld("title", "Task title") +
          sel("to", "Assignee", memberOptions) +
          sel("skill", "Skill", skills) +
          fld("hours", "Estimated hours", "number", 4) +
          fld("due", "Due date", "date"),
        async (f) => {
          const t = Object.fromEntries(f);
          await post("task", t.title, {
            task: { ...t, hours: clamp(t.hours), state: "proposed" },
          });
        },
      ),
    );
    const actionFallback = (s) =>
      lines(s)
        .filter((l) => /todo|need to|should|action/i.test(l))
        .slice(0, 8)
        .map((t) => ({
          t: t.slice(0, 200),
          sk: bestSkill(t),
          h: 4,
          owner: "",
        }));
    const postDraft = (x, ai) =>
      post(
        ai ? "ai" : "text",
        (ai ? "Gemini summary · " : "Basic summary · ") +
          [
            x.summary || x.text,
            ...(x.decisions || []).map((s) => "Decision: " + s),
            ...(x.open || []).map((s) => "Open: " + s),
            ...(x.actions || []).map((a) => "Action: " + a.t),
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 6000),
      );
    assisted(
      "thread",
      "chat.summary",
      () => ({ messages: recent() }),
      () => ({
        summary:
          messages.length +
          " messages. Latest: " +
          (messages.at(-1)?.body || "No posts yet"),
        decisions: messages
          .filter((m) => m.kind === "decision")
          .slice(-5)
          .map((m) => m.body),
        open: messages
          .filter((m) => m.body.includes("?"))
          .slice(-5)
          .map((m) => m.body),
      }),
      postDraft,
      "Post summary",
    );
    assisted(
      "actions",
      "chat.actions",
      () => ({ messages: recent(), team: teamNames() }),
      () => ({ actions: actionFallback(recent()) }),
      (x) =>
        x.actions.length
          ? write("project_tasks", taskRows(x.actions))
          : notify("No actions found."),
      "Add actions to board",
    );
    assisted(
      "summarize",
      "notes.summary",
      () => ({ notes: input(root, "notes"), team: teamNames() }),
      () => ({
        summary: input(root, "notes").slice(0, 200),
        decisions: lines(input(root, "notes")).filter((t) =>
          /decided|agreed/i.test(t),
        ),
        actions: actionFallback(input(root, "notes")),
      }),
      postDraft,
      "Post meeting notes",
    );
    const standups = () =>
      messages
        .filter((m) => m.kind === "standup")
        .slice(-20)
        .map((m) => name(m.author_id) + ": " + m.body)
        .join("\n");
    assisted(
      "merge",
      "standup",
      () => ({ messages: standups() }),
      () => ({ text: standups() || "No stand-ups yet." }),
      postDraft,
      "Post team update",
    );
    readChat().catch((e) => notify(e.message));
  }
  function setup() {
    add(
      panel(
        "Rulebook traceability",
        knownRules.length
          ? list(
              d.requirements.map(
                (r) =>
                  r.title +
                  " · " +
                  (d.tasks
                    .filter((t) => t.requirement_id === r.id)
                    .map((t) => t.title + " (" + t.status + ")")
                    .join(", ") || "No linked tasks"),
              ),
            )
          : "Import criteria or add requirements to start a checklist.",
      ),
    );
    add(
      panel(
        "Problem & rules",
        "<p>" +
          esc(p.problem_statement) +
          "</p>" +
          btn("brief", "Summarize problem") +
          fld(
            "rules-text",
            "Rulebook text",
            "textarea",
            [
              ...(d.rules?.mandatory_requirements || []),
              ...(d.rules?.judging_criteria || []),
            ].join("\n"),
          ) +
          btn("extract", "Extract rules") +
          btn("criteria", "Import judging checklist") +
          btn("plan-board", "Plan tasks from requirements"),
      ),
    );
    const saveReq = async (titles) => {
      const fresh = [
        ...new Set(
          titles
            .map((t) => t.trim().slice(0, 200))
            .filter((t) => t && !knownRules.includes(t)),
        ),
      ];
      if (fresh.length)
        await write(
          "requirement_items",
          fresh.map((title) => ({
            project_id: p.id,
            title,
            source: "suggestion",
            verified: false,
          })),
        );
    };
    assisted(
      "brief",
      "problem.summary",
      () => ({
        problem: p.problem_statement,
        stack: p.technology_stack.join(", "),
      }),
      () => ({
        summary: words(lines(p.problem_statement).slice(0, 2).join(" "))
          .slice(0, 35)
          .join(" "),
        keyPoints: lines(p.problem_statement).slice(0, 3),
        risks: [],
        requirements: p.expected_deliverables.slice(0, 4),
      }),
      (x) => saveReq(x.requirements),
      "Use requirements",
    );
    assisted(
      "extract",
      "rules.extract",
      () => ({ rules: input(root, "rules-text") }),
      () => ({
        rules: lines(input(root, "rules-text"))
          .filter((s) =>
            /must|shall|submit|team|deadline|judg|criteria|allow|prohibit|require/i.test(
              s,
            ),
          )
          .slice(0, 8),
      }),
      (x) => saveReq(x.rules),
      "Add checklist items",
    );
    bind("criteria", () =>
      draft(
        "criteria",
        { ai: false, data: { items: d.rules?.judging_criteria || [] } },
        (x) => saveReq(x.items),
        "Add judging criteria",
      ),
    );
    assisted(
      "plan-board",
      "tasks.plan",
      () => ({
        project: p.name,
        requirements: knownRules.join("\n"),
        skills: d.skills
          .filter((s) => s.verified_level)
          .map((s) => s.skill_name)
          .join(", "),
      }),
      () => ({
        tasks: knownRules.slice(0, 4).flatMap((r, i) => [
          { t: "Specify " + r, sk: bestSkill(r), h: 2, dep: null },
          { t: "Build " + r, sk: bestSkill(r), h: 4, dep: i * 2 },
        ]),
      }),
      async (x) => {
        const ids = x.tasks.map(() => crypto.randomUUID());
        const rows = allocate(
          taskRows(x.tasks),
          team,
          d.skills,
          d.availability,
          d.tasks,
        );
        if (!rows.length) throw Error("Add a requirement first.");
        await write(
          "project_tasks",
          rows.map((t, i) => ({
            ...t,
            id: ids[i],
            blocked_by:
              Number.isInteger(x.tasks[i].dep) &&
              x.tasks[i].dep >= 0 &&
              x.tasks[i].dep < i
                ? ids[x.tasks[i].dep]
                : null,
            requirement_id:
              d.requirements.find((r) => t.title.includes(r.title))?.id || null,
          })),
        );
      },
      "Apply tasks and allocation",
    );
  }
  function learn() {
    add(
      panel(
        "Skill gaps & peer teaching",
        studioSkills
          .map((sk) => {
            const matches = d.skills.filter(
              (s) => s.skill_name.toLowerCase() === sk.toLowerCase(),
            );
            const best = Math.max(
              0,
              ...matches.map((s) => levels[s.verified_level] || 0),
            );
            const needs = d.tasks.some(
              (t) => t.skill === sk && t.status !== "done",
            )
              ? 4
              : 0;
            const tutor = matches.find(
              (s) => (levels[s.verified_level] || 0) >= 4 && s.user_id !== uid,
            );
            return (
              bar(sk + " · needed " + needs + "/5", best, 5, "/5") +
              (tutor && needs
                ? "<p>Pair with " +
                  esc(name(tutor.user_id)) +
                  " for 20 minutes on " +
                  esc(sk) +
                  ". " +
                  esc(
                    d.availability.find((a) => a.user_id === tutor.user_id)
                      ?.working_hours || "Agree a time in team chat.",
                  ) +
                  "</p>"
                : "")
            );
          })
          .join(""),
      ) +
        panel("Task-linked learning", btn("goals", "Draft my learning goals")),
    );
    const own = d.tasks.filter(
      (t) => t.owner_id === uid && t.status !== "done",
    );
    assisted(
      "goals",
      "learning.goals",
      () => ({
        tasks: own.map((t) => t.title).join("\n"),
        skills: d.skills
          .filter((s) => s.user_id === uid)
          .map((s) => s.skill_name + " " + s.self_assessed_level)
          .join(", "),
      }),
      () => ({
        items: own
          .slice(0, 3)
          .map((t) => "Complete a worked example for " + t.title),
      }),
      (x) =>
        x.items.length
          ? write(
              "learning_goals",
              x.items.map((title) => ({
                project_id: p.id,
                title: title.slice(0, 200),
              })),
            )
          : notify("Assign yourself an open task first."),
      "Save learning goals",
    );
    add(
      panel(
        "Skill growth",
        list(
          team.flatMap((m) =>
            studioSkills.flatMap((s) => {
              const completed = d.tasks.filter(
                (t) =>
                  t.owner_id === m.user_id &&
                  t.skill === s &&
                  t.status === "done",
              ).length;
              if (!completed) return [];
              const skill = d.skills.find(
                (k) =>
                  k.user_id === m.user_id &&
                  k.skill_name.toLowerCase() === s.toLowerCase(),
              );
              return [
                m.full_name +
                  " · " +
                  s +
                  " · self-assessed " +
                  (skill?.self_assessed_level || "unrated") +
                  " · " +
                  completed +
                  " completed. Review evidence in Team before verifying a level.",
              ];
            }),
          ),
        ),
      ) +
        panel(
          "Adjust difficulty",
          list(
            own.map(
              (t) =>
                t.title +
                " · " +
                (dateEnd(t.due_date) < Date.now()
                  ? "Behind schedule. Start with one testable example."
                  : d.tasks.some(
                        (s) =>
                          s.owner_id === uid &&
                          s.status === "done" &&
                          s.skill === t.skill,
                      )
                    ? "Extend your previous work with a harder edge case."
                    : "Complete the smallest end-to-end version first."),
            ),
          ),
        ),
    );
  }
  function ship() {
    add(
      panel(
        "Submission evidence",
        bar("Readiness", Math.round(readiness * 100), 100, "%", "done") +
          list([
            "Repository · " + (p.repository || "Missing"),
            "Checklist · " +
              verified +
              "/" +
              d.requirements.length +
              " verified",
            ...checklist.map((k) => k + " · " + (evidence[k] || "Missing")),
          ]) +
          (leader ? btn("evidence", "Edit evidence") : ""),
      ) +
        panel("Pitch rehearsal", btn("pitch", "Draft pitch")) +
        panel("My portfolio", btn("portfolio", "Draft from completed tasks")),
    );
    bind("evidence", () =>
      form(
        "Submission evidence",
        checklist
          .map((k) => fld(k, k + " evidence URL", "url", evidence[k]))
          .join(""),
        (f) =>
          result(
            db
              .from("projects")
              .update({ submission_evidence: Object.fromEntries(f) })
              .eq("id", p.id),
          ),
      ),
    );
    assisted(
      "pitch",
      "pitch",
      () => ({
        project: p.name + " · " + p.problem_statement,
        requirements: knownRules.join("\n"),
        tasks: taskText,
      }),
      () => ({
        script:
          "0:00–0:30 · Introduce " +
          p.name +
          " and the problem: " +
          p.problem_statement +
          "\n0:30–1:45 · Demonstrate " +
          (p.expected_deliverables[0] || "the core workflow") +
          ".\n1:45–2:30 · Show evidence for the judging criteria.\n2:30–3:00 · Explain impact and next steps.",
        answers: knownRules.map(
          (r) => r + " · Show a linked task and its evidence.",
        ),
      }),
      (x) =>
        form(
          "Edit pitch",
          fld(
            "pitch",
            "Pitch script & judging answers",
            "textarea",
            x.script + "\n" + x.answers.join("\n"),
          ),
          (f) => post("decision", String(f.get("pitch")).slice(0, 6000)),
        ),
      "Edit and save pitch",
    );
    bind("portfolio", () => {
      const completed = d.tasks.filter(
        (t) => t.owner_id === uid && t.status === "done",
      );
      if (!completed.length) throw Error("Complete an assigned task first.");
      form(
        "Draft portfolio entry",
        fld("title", "Title", "text", p.name) +
          fld(
            "contribution",
            "My contribution",
            "textarea",
            completed.map((t) => t.title).join("\n"),
          ) +
          fld(
            "proof_url",
            "Evidence URL",
            "url",
            p.repository ? "https://github.com/" + p.repository : "",
          ),
        (f) =>
          write("portfolio_entries", {
            ...Object.fromEntries(f),
            user_id: uid,
            skills: [
              ...new Set(completed.map((t) => t.skill).filter(Boolean)),
            ].join(", "),
          }),
      );
    });
  }
  async function memory() {
    add(
      panel(
        "Project memory",
        fld("search", "Search decisions and lessons across your projects") +
          '<div id="memory-results"></div>',
      ),
    );
    const rows = await result(
      db
        .from("project_messages")
        .select("body,kind,projects(name)")
        .in("kind", ["decision", "lesson"])
        .order("created_at", { ascending: false })
        .limit(250),
    );
    if (!root.isConnected) return;
    const update = () => {
      const q = input(root, "search").toLowerCase();
      root.querySelector("#memory-results").innerHTML =
        rows
          .filter((m) => m.body.toLowerCase().includes(q))
          .map(
            (m) =>
              '<article class="bp-card"><small>' +
              esc(m.projects?.name) +
              " · " +
              esc(m.kind) +
              "</small><p>" +
              esc(m.body) +
              "</p>" +
              btn("reuse-" + rows.indexOf(m), "Save to this project") +
              "</article>",
          )
          .join("") || "No matching team decisions or lessons.";
      rows.forEach((m, i) =>
        bind("reuse-" + i, () =>
          form(
            "Reuse team memory",
            fld("body", "Shared note", "textarea", m.body),
            (f) => post(m.kind, String(f.get("body"))),
          ),
        ),
      );
    };
    root.querySelector("[name=search]").oninput = update;
    update();
  }
  function teamLens() {
    add(
      panel(
        "Member view",
        sel("view-member", "View teammate workload", memberOptions) +
          '<div id="team-lens"></div>',
      ),
    );
    function update() {
      const id = input(root, "view-member"),
        person = team.find((m) => m.user_id === id);
      if (!person) return;
      root.querySelector("#team-lens").innerHTML =
        bar("Accepted members", team.length, d.members.length) +
        studioSkills
          .map((sk) => {
            const row = d.skills.find(
              (s) =>
                s.user_id === id &&
                s.skill_name.toLowerCase() === sk.toLowerCase(),
            );
            return bar(sk, levels[row?.verified_level] || 0, 5, "/5", "done");
          })
          .join("") +
        list(
          d.tasks
            .filter((t) => t.owner_id === id)
            .map((t) => t.title + " · " + t.status),
        ) +
        "<p>Signed in as " +
        esc(name(uid)) +
        ". Invitations and task proposals are accepted by their recipient.</p>";
    }
    root.querySelector("[name=view-member]").onchange = update;
    update();
  }
  function mentor() {
    if (d.personalReady) {
      add(panel("My mentor history", '<div id="v3-mentor-history"></div>'));
      result(
        db
          .from("studio_mentor_history")
          .select("question,answer")
          .eq("project_id", p.id)
          .order("created_at", { ascending: false })
          .limit(12),
      )
        .then((rows) => {
          if (root.isConnected)
            root.querySelector("#v3-mentor-history").innerHTML =
              rows
                .map(
                  (row) =>
                    "<details><summary>" +
                    esc(row.question) +
                    "</summary><p>" +
                    esc(row.answer) +
                    "</p></details>",
                )
                .join("") || "Saved replies appear here.";
        })
        .catch(() => {});
    }

    add(
      panel(
        "Project mentor",
        fld(
          "question",
          "Ask about risk, rules, tasks or learning",
          "textarea",
        ) + btn("ask", "Ask mentor"),
      ),
    );
    add(
      panel(
        "Confirm a project action",
        sel(
          "mentor-task",
          "Task",
          d.tasks.map((t) => [t.id, t.title]),
        ) +
          sel(
            "mentor-status",
            "Move to",
            stages.map((stage, i) => [stage, labels[i]]),
          ) +
          btn("mentor-move", "Review task move"),
      ),
    );
    bind("mentor-move", () => {
      const task = d.tasks.find((t) => t.id === input(root, "mentor-task"));
      const status = input(root, "mentor-status");
      if (!task || !stages.includes(status))
        throw Error("Choose a task and status.");
      form(
        "Confirm task move",
        "<p>" +
          esc(task.title) +
          " → " +
          esc(labels[stages.indexOf(status)]) +
          "</p>",
        () =>
          result(
            db
              .from("project_tasks")
              .update({ status })
              .eq("project_id", p.id)
              .eq("id", task.id),
          ),
      );
    });
    bind("ask", async () => {
      const question = input(root, "question");
      if (!question) throw Error("Enter a question.");
      await readChat();
      const text = /risk|deadline|pace/i.test(question)
        ? metric.risk + " · " + metric.left + " estimated hours remain."
        : /rule|require/i.test(question)
          ? knownRules.join("\n")
          : /task|block/i.test(question)
            ? taskText
            : /learn|skill/i.test(question)
              ? d.skills
                  .filter((s) => s.verified_level)
                  .map((s) => s.skill_name + " · " + name(s.user_id))
                  .join("\n")
              : "";
      const answer = await aiJSON("mentor", { question }, () => ({
        text:
          text || "I don’t have enough project evidence to answer that yet.",
      }));
      draft(
        "mentor",
        answer,
        d.personalReady
          ? (x) =>
              write("studio_mentor_history", {
                project_id: p.id,
                question: question.slice(0, 2000),
                answer: x.text.slice(0, 4000),
              })
          : null,
        "Save reply to my history",
      );
    });
  }
  ({
    Overview: overview,
    Board: board,
    Chat: chat,
    Team: teamLens,
    Timeline: timeline,
    Learning: learn,
    Setup: setup,
    Mentor: mentor,
    Ship: ship,
    Memory: () => memory().catch((e) => notify(e.message)),
  })[tab]?.();
  forecastTools();
  const detachPersonal = mountPersonalStudio({
    ...ctx,
    aiJSON,
    draft,
    studioSkills,
  });
  if (root.querySelector("[data-clock]")) {
    tick();
    timer = setInterval(tick, 1000);
  }
  const channelName = "studio-" + p.id + "-" + crypto.randomUUID();
  channel = db.channel(channelName).on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "project_messages",
      filter: "project_id=eq." + p.id,
    },
    (event) => {
      if (!root.isConnected) return;
      if (tab === "Chat") readChat().catch((e) => notify(e.message));
      else if (event.new.author_id !== uid) {
        const b = document.getElementById("tab-Chat");
        if (b) {
          b.dataset.count = String(
            Number(sessionStorage.getItem("chat-count-" + uid + p.id) || 0) + 1,
          );
          sessionStorage.setItem("chat-count-" + uid + p.id, b.dataset.count);
          b.innerHTML =
            "<span>05</span>Team chat (" + Number(b.dataset.count) + ")";
        }
      }
    },
  );
  if (tab === "Chat") {
    for (const table of ["poll_votes", "message_files", "project_messages"])
      channel.on(
        "postgres_changes",
        {
          event: table === "project_messages" ? "UPDATE" : "*",
          schema: "public",
          table,
          ...(table === "poll_votes"
            ? {}
            : { filter: "project_id=eq." + p.id }),
        },
        () => readChat().catch((e) => notify(e.message)),
      );
  }
  if (tab === "Chat") sessionStorage.removeItem("chat-count-" + uid + p.id);
  else {
    const count = sessionStorage.getItem("chat-count-" + uid + p.id);
    const link = document.getElementById("tab-Chat");
    if (count && link) link.textContent = "Chats (" + Number(count) + ")";
  }
  channel.subscribe();
  return () => {
    clearInterval(timer);
    detachPersonal();
    db.removeChannel(channel);
  };
}
