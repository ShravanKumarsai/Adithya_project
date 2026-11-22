const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (id, label, primary = false) =>
  '<button type="button" class="button ' +
  (primary ? "primary" : "subtle") +
  '" data-final="' +
  esc(id) +
  '">' +
  esc(label) +
  "</button>";
const text = (key, label, value = "", area = false) =>
  "<label>" +
  esc(label) +
  (area
    ? '<textarea name="' +
      key +
      '" maxlength="6000">' +
      esc(value) +
      "</textarea>"
    : '<input name="' + key + '" value="' + esc(value) + '" required>') +
  "</label>";
const pick = (key, label, items, value = "") =>
  "<label>" +
  esc(label) +
  '<select name="' +
  key +
  '">' +
  items
    .map(
      ([id, title]) =>
        '<option value="' +
        esc(id) +
        '" ' +
        (id === value ? "selected" : "") +
        ">" +
        esc(title) +
        "</option>",
    )
    .join("") +
  "</select></label>";
const panel = (heading, body) =>
  '<section class="bp-panel"><h2>' +
  esc(heading) +
  "</h2>" +
  body +
  "</section>";
const statuses = {
  open: "Backlog",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};
const stamps = {
  open: "WAITING",
  in_progress: "ACTIVE",
  review: "IN REVIEW",
  done: "CLOSED",
};
const normalizeHours = (value) =>
  Math.min(12, Math.max(1, Math.round(Number(value) || 4)));

export function mountFinalTools(ctx) {
  const {
    root,
    project,
    data,
    db,
    rpc,
    result,
    session,
    leader,
    tab,
    modal,
    refresh,
    notify,
    aiJSON,
    studioSkills,
    allocate,
    pace,
    permitted,
  } = ctx;
  const viewer = session.user.id,
    id = project.id;
  const members = data.members.filter(
    (m) => m.status === "accepted" && m.user_id,
  );
  const name = (id) =>
    members.find((m) => m.user_id === id)?.full_name || "Unassigned";
  const today = new Date().toISOString().slice(0, 10);
  const actions = (where = root, id) =>
    where.querySelector('[data-final="' + CSS.escape(id) + '"]');
  function bind(where, id, fn) {
    const b = actions(where, id);
    if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        notify(e.message);
      } finally {
        b.disabled = false;
      }
    };
  }
  function showSheet(title, body, save, after = refresh, paper = false) {
    modal(title, body, save, after);
    const el = document.querySelector("#shared-dialog");
    el.classList.add("studio-bottom-sheet");
    el.classList.toggle("studio-case-sheet", paper);
    el.addEventListener(
      "close",
      () => el.classList.remove("studio-bottom-sheet", "studio-case-sheet"),
      { once: true },
    );
    return el;
  }
  let observer;
  const actorTask = (title, skill, hours, owner = null) => ({
    project_id: id,
    title: String(title).trim().slice(0, 200),
    skill,
    estimated_hours: normalizeHours(hours),
    owner_id: owner,
  });
  const fallbackSkill = (t) =>
    /pitch|demo/i.test(t)
      ? "Pitching"
      : /python|model/i.test(t)
        ? "Python / ML"
        : /db|sql|database/i.test(t)
          ? "Databases"
          : /design/i.test(t)
            ? "UI design"
            : /api|server/i.test(t)
              ? "Node"
              : "React";
  function quickAdd() {
    let drafts = [];
    const dialog = showSheet(
      "Quick add",
      text("source", "Paste notes or a task list", "", true) +
        button(
          "extract",
          permitted ? "Draft tasks with Gemini" : "Draft tasks",
        ) +
        '<div id="quick-rows" aria-live="polite"></div>',
      async (f) => {
        const rows = drafts
          .map((_, i) =>
            actorTask(
              f.get("title" + i) || "",
              f.get("skill" + i),
              f.get("hours" + i),
              f.get("owner" + i) || null,
            ),
          )
          .filter((t) => t.title);
        if (!rows.length)
          throw Error("Draft and review at least one task first.");
        await result(db.from("project_tasks").insert(rows));
      },
    );
    dialog.querySelector(".shared-form>button.primary").textContent =
      "Add reviewed tasks";
    bind(dialog, "extract", async () => {
      const source = dialog.querySelector('[name="source"]').value.trim();
      if (!source) throw Error("Paste notes or a task list first.");
      const response = await aiJSON("tasks.extract", { notes: source }, () => ({
        actions: source
          .split(/\n|; +/)
          .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 8)
          .map((t) => ({ t, sk: fallbackSkill(t), h: 4, owner: "" })),
      }));
      if (!dialog.open) return;
      drafts = response.data.actions.slice(0, 8);
      const proposed = allocate(
        drafts.map((a) => actorTask(a.t, a.sk, a.h)),
        members,
        data.skills,
        data.availability,
        data.tasks,
      );
      dialog.querySelector("#quick-rows").innerHTML =
        "<p>" +
        (response.ai ? "Gemini draft" : "Basic draft") +
        "</p>" +
        drafts
          .map((a, i) => {
            const label = a.owner?.trim().toLowerCase().split(/\s+/)[0];
            const matches = members.filter(
              (m) =>
                label && m.full_name.toLowerCase().split(/\s+/)[0] === label,
            );
            return (
              "<fieldset><legend>Task " +
              (i + 1) +
              "</legend>" +
              text("title" + i, "Title", a.t) +
              pick(
                "skill" + i,
                "Field",
                studioSkills.map((s) => [s, s]),
                a.sk,
              ) +
              pick(
                "hours" + i,
                "Hours",
                Array.from({ length: 12 }, (_, n) => [
                  String(n + 1),
                  String(n + 1),
                ]),
                String(normalizeHours(a.h)),
              ) +
              pick(
                "owner" + i,
                "Owner",
                [
                  ["", "Unassigned"],
                  ...members.map((m) => [m.user_id, m.full_name]),
                ],
                matches.length === 1
                  ? matches[0].user_id
                  : proposed[i]?.owner_id,
              ) +
              "</fieldset>"
            );
          })
          .join("");
    });
  }
  function openCase(entries, key) {
    const item = entries.find((e) => e.key === key);
    if (!item) return;
    let saved = item.saved || {},
      studied = Boolean(saved.studied);
    const body =
      '<div class="case-meta">' +
      esc(item.detail) +
      "</div><p>" +
      esc(item.context) +
      '</p><section aria-live="polite" id="case-brief"></section>' +
      button("rewrite", permitted ? "Rewrite brief" : "Refresh Basic brief") +
      button("studied", studied ? "Unmark as read" : "Mark as read") +
      (item.task
        ? '<div class="case-status">' +
          Object.entries(statuses)
            .map(
              ([state, label]) =>
                '<button type="button" data-final="status-' +
                state +
                '" class="button subtle" aria-pressed="' +
                (item.task.status === state) +
                '">' +
                label +
                "</button>",
            )
            .join("") +
          "</div>"
        : "");
    const sheet = showSheet(
      item.title,
      body,
      () => {},
      () => {},
      true,
    );
    sheet.querySelector(".shared-form>button.primary").hidden = true;
    const dataKey = { project_id: id, user_id: viewer, item_key: key };
    const basic = {
      explain: item.context || item.title,
      step: "Choose one check that would demonstrate " + item.title + ".",
      lookup: item.task?.skill
        ? item.task.skill + " getting started"
        : "official project documentation",
    };
    const show = (d, ai) => {
      sheet.querySelector("#case-brief").innerHTML =
        "<h3>Study this · " +
        (ai ? "Gemini" : "Basic") +
        "</h3><p>" +
        esc(d.explain) +
        "</p><p><b>First step</b> " +
        esc(d.step) +
        "</p><p><b>Look up</b> " +
        esc(d.lookup) +
        "</p>";
    };
    show(saved.brief?.explain ? saved.brief : basic, Boolean(saved.brief?.ai));
    const rewrite = async () => {
      const { data: d, ai } = await aiJSON(
        "item.brief",
        { title: item.title },
        () => basic,
      );
      if (!sheet.open) return;
      await result(
        db
          .from("studio_item_briefs")
          .upsert({ ...dataKey, brief: { ...d, ai }, studied }),
      );
      saved.brief = { ...d, ai };
      item.saved = saved;
      show(d, ai);
    };
    bind(sheet, "rewrite", rewrite);
    if (permitted && !saved.brief?.explain) actions(sheet, "rewrite").click();
    bind(sheet, "studied", async () => {
      await result(
        db
          .from("studio_item_briefs")
          .upsert({ ...dataKey, brief: saved.brief || {}, studied: !studied }),
      );
      studied = !studied;
      saved.studied = studied;
      item.saved = saved;
      actions(sheet, "studied").textContent = studied
        ? "Unmark as read"
        : "Mark as read";
      const read = actions(root, key)?.querySelector(".cork-read");
      if (read) read.hidden = !studied;
    });
    if (item.task)
      for (const state of Object.keys(statuses))
        bind(sheet, "status-" + state, async () => {
          await result(
            db
              .from("project_tasks")
              .update({ status: state })
              .eq("project_id", id)
              .eq("id", item.task.id),
          );
          sheet.close();
          await refresh();
        });
  }
  function renderStrings() {
    const svg = root.querySelector(".cork-strings");
    if (!svg || !root.isConnected) return;
    const box = svg.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    svg.replaceChildren();
    for (const task of data.tasks.filter((t) => t.blocked_by)) {
      const start = actions(root, "task-" + task.blocked_by)
        ?.querySelector(".cork-pin")
        ?.getBoundingClientRect();
      const end = actions(root, "task-" + task.id)
        ?.querySelector(".cork-pin")
        ?.getBoundingClientRect();
      if (!start || !end) continue;
      const a = [
          start.x + start.width / 2 - box.x,
          start.y + start.height / 2 - box.y,
        ],
        b = [end.x + end.width / 2 - box.x, end.y + end.height / 2 - box.y];
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute(
        "d",
        "M " +
          a.join(" ") +
          " Q " +
          (a[0] + b[0]) / 2 +
          " " +
          ((a[1] + b[1]) / 2 + 20) +
          " " +
          b.join(" "),
      );
      svg.append(path);
    }
  }
  async function corkboard() {
    const saved = await result(
      db
        .from("studio_item_briefs")
        .select("*")
        .eq("project_id", id)
        .eq("user_id", viewer),
    );
    if (!root.isConnected) return;
    const entries = [
      {
        key: "case",
        title: project.name,
        context:
          project.problem_statement ||
          "Add a problem statement in Project setup.",
        detail: "Project brief",
      },
      ...data.requirements.map((r) => ({
        key: "requirement-" + r.id,
        title: r.title,
        context: r.description,
        detail: "Requirement",
      })),
      ...data.tasks.map((t) => ({
        key: "task-" + t.id,
        title: t.title,
        context: "Study the task in the context of this project.",
        detail: [
          t.skill || "General",
          t.estimated_hours + "h",
          name(t.owner_id),
        ].join(" · "),
        task: t,
      })),
    ];
    const note = (item) => {
      item.saved = saved.find((s) => s.item_key === item.key);
      return (
        '<button type="button" class="cork-note ' +
        (item.key === "case" ? "cork-case" : "") +
        '" data-final="' +
        item.key +
        '"><span class="cork-pin" aria-hidden="true"></span><span class="cork-read" ' +
        (item.saved?.studied ? "" : "hidden") +
        ">read</span><strong>" +
        esc(item.title) +
        "</strong>" +
        (item.key === "case" ? "<span>" + esc(item.context) + "</span>" : "") +
        (item.task
          ? '<span class="cork-hand">' +
            esc(item.detail) +
            '</span><span class="cork-stamp">' +
            esc(stamps[item.task.status] || "WAITING") +
            "</span>"
          : "") +
        "</button>"
      );
    };
    const initials = (n) =>
      n
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase();
    const unassigned = entries.filter(
      (e) => e.task && !members.some((m) => m.user_id === e.task.owner_id),
    );
    root.innerHTML =
      '<header class="clean-page-heading"><h2>Planning board</h2>' +
      (leader
        ? button(
            "plan-case",
            permitted ? "Ask Gemini to plan the case" : "Draft a case plan",
            true,
          )
        : "") +
      "</header>" +
      '<section class="cork-wall" aria-label="Project evidence board"><svg class="cork-strings" aria-hidden="true"></svg><div class="cork-header">' +
      note(entries[0]) +
      '<div class="cork-requirements">' +
      entries
        .filter((e) => e.key.startsWith("requirement-"))
        .map(note)
        .join("") +
      '</div></div><div class="cork-lanes">' +
      members
        .map(
          (m) =>
            '<section class="cork-lane"><header class="cork-photo"><span aria-hidden="true">' +
            esc(initials(m.full_name)) +
            "</span><strong>" +
            esc(m.full_name) +
            "</strong><small>" +
            esc(m.role || "Member") +
            "</small></header>" +
            entries
              .filter((e) => e.task?.owner_id === m.user_id)
              .map(note)
              .join("") +
            (leader || m.user_id === viewer
              ? '<button type="button" class="cork-add" data-final="pin-' +
                m.user_id +
                '">＋ Pin work for ' +
                esc(m.full_name) +
                "</button>"
              : "") +
            "</section>",
        )
        .join("") +
      (unassigned.length
        ? '<section class="cork-lane"><h3>Unassigned</h3>' +
          unassigned.map(note).join("") +
          "</section>"
        : "") +
      "</div></section>";
    for (const e of entries) bind(root, e.key, () => openCase(entries, e.key));
    for (const m of members)
      bind(root, "pin-" + m.user_id, () => {
        const fields = studioSkills.filter((skill) =>
          data.skills.some(
            (s) =>
              s.user_id === m.user_id &&
              s.skill_name.toLowerCase() === skill.toLowerCase(),
          ),
        );
        if (!fields.length)
          throw Error(
            "Add one of the studio fields to this teammate's skill profile first.",
          );
        const sheet = showSheet(
          "Pin work for " + m.full_name,
          text("title", "Task title") +
            pick(
              "field",
              "Field",
              fields.map((s) => [s, s]),
            ) +
            pick(
              "hours",
              "Hours",
              [2, 3, 4, 6, 8, 10].map((n) => [String(n), String(n)]),
            ) +
            button("ideas", "Suggest ideas") +
            '<div id="case-ideas" aria-live="polite"></div>',
          (f) =>
            rpc("pin_studio_work", {
              p_project: id,
              p_owner: m.user_id,
              p_title: f.get("title"),
              p_skill: f.get("field"),
              p_hours: Number(f.get("hours")),
            }),
          refresh,
          true,
        );
        sheet.querySelector(".shared-form>button.primary").textContent =
          "Pin to board";
        bind(sheet, "ideas", async () => {
          const field = sheet.querySelector('[name="field"]').value;
          const fallback = [
            "Prototype a " + field + " example",
            "Test the " + field + " workflow",
            "Document " + field + " handoff",
          ].filter(
            (t) =>
              !data.tasks.some(
                (r) => r.title.toLowerCase() === t.toLowerCase(),
              ),
          );
          const { data: d, ai } = await aiJSON(
            "task.ideas",
            { title: field },
            () => ({ ideas: fallback }),
          );
          if (!sheet.open) return;
          const unique = [...new Set(d.ideas)].filter(
            (t) =>
              !data.tasks.some(
                (r) => r.title.toLowerCase() === t.toLowerCase(),
              ),
          );
          sheet.querySelector("#case-ideas").innerHTML =
            "<p>" +
            (ai ? "Gemini suggestions" : "Basic suggestions") +
            "</p>" +
            unique.map((t, i) => button("idea-" + i, t)).join("");
          unique.forEach((t, i) =>
            bind(sheet, "idea-" + i, () => {
              sheet.querySelector('[name="title"]').value = t;
            }),
          );
        });
      });
    bind(root, "plan-case", async () => {
      const source = data.requirements.map((r) => r.title);
      const fallback = (source.length ? source : [project.name])
        .slice(0, 4)
        .flatMap((t, i) => [
          { t: "Define " + t, sk: fallbackSkill(t), h: 2, dep: null },
          { t: "Build " + t, sk: fallbackSkill(t), h: 4, dep: i * 2 },
        ]);
      const { data: d, ai } = await aiJSON("tasks.plan", {}, () => ({
        tasks: fallback,
      }));
      if (!root.isConnected) return;
      const rows = allocate(
        d.tasks.map((t) => actorTask(t.t, t.sk, t.h)),
        members,
        data.skills,
        data.availability,
        data.tasks,
      );
      const ids = rows.map(() => crypto.randomUUID());
      const body =
        "<p>" +
        (ai ? "Gemini draft" : "Basic draft") +
        "</p>" +
        rows
          .map((t, i) =>
            text(
              "title" + i,
              "Task " + (i + 1) + " · " + name(t.owner_id),
              t.title,
            ),
          )
          .join("");
      const sheet = showSheet(
        "Review the case plan",
        body,
        async (f) => {
          await rpc("apply_studio_plan", {
            p_project: id,
            p_requirements: [],
            p_tasks: rows.map((t, i) => ({
              ...t,
              id: ids[i],
              title: String(f.get("title" + i))
                .trim()
                .slice(0, 200),
              blocked_by:
                Number.isInteger(d.tasks[i].dep) && d.tasks[i].dep < i
                  ? ids[d.tasks[i].dep] || null
                  : null,
            })),
            p_milestones: [],
            p_roles: [],
          });
        },
        refresh,
        true,
      );
      sheet.querySelector(".shared-form>button.primary").textContent =
        "Add reviewed plan";
    });
    observer = new ResizeObserver(renderStrings);
    observer.observe(root.querySelector(".cork-wall"));
    for (const n of root.querySelectorAll(".cork-note")) observer.observe(n);
    document.fonts?.ready.then(renderStrings);
    renderStrings();
  }
  async function todayView() {
    const standups = await result(
      db
        .from("studio_standups")
        .select("user_id,done,next")
        .eq("project_id", id)
        .eq("day", today),
    );
    if (!root.isConnected) return;
    const mine = standups.find((s) => s.user_id === viewer);
    const blocked = data.tasks.flatMap((t) => {
      const parent = data.tasks.find(
        (b) => b.id === t.blocked_by && b.status !== "done",
      );
      return parent && t.status !== "done"
        ? [
            t.title +
              " waits on " +
              parent.title +
              " · " +
              name(parent.owner_id),
          ]
        : [];
    });
    const done = data.tasks.filter((t) => t.status === "done").length;
    const next =
      data.tasks.find(
        (t) =>
          t.status !== "done" &&
          !blocked.some((b) => b.startsWith(t.title + " waits")),
      )?.title || "Review the ship check";
    const basic = {
      progress: done + " of " + data.tasks.length + " tasks done.",
      blockers: blocked,
      next,
    };
    let digest = basic,
      merged = "";
    root.innerHTML =
      '<header class="clean-page-heading"><h2>Today</h2></header>' +
      panel(
        "Daily digest",
        '<div id="today-digest" aria-live="polite"></div><div class="shared-actions">' +
          button("digest", "Write digest", true) +
          button("post-digest", "Post to chat") +
          "</div>",
      ) +
      panel(
        "Waiting on",
        blocked.length
          ? "<ul>" +
              blocked.map((b) => "<li>" + esc(b) + "</li>").join("") +
              "</ul>"
          : "<p>No blocked tasks.</p>",
      ) +
      panel(
        "Stand-up",
        '<div class="studio-standup-fields">' +
          text("done-line", "What did you finish?", mine?.done || "", true) +
          text("next-line", "What’s next or blocked?", mine?.next || "", true) +
          "</div>" +
          '<div class="shared-actions">' +
          button("save-standup", "Save my update", true) +
          button("merge", "Merge into one update") +
          "</div>" +
          '<div id="today-merge" aria-live="polite"></div><div id="today-team">' +
          standups
            .map(
              (s) =>
                "<p><strong>" +
                esc(name(s.user_id)) +
                "</strong> · " +
                esc(s.done) +
                "<br>Next · " +
                esc(s.next) +
                "</p>",
            )
            .join("") +
          "</div>",
      );
    const showDigest = (ai) => {
      root.querySelector("#today-digest").innerHTML =
        "<small>" +
        (ai ? "Gemini" : "Basic") +
        "</small><p>" +
        esc(digest.progress) +
        "</p>" +
        (digest.blockers.length
          ? "<p><b>Blockers</b> " + esc(digest.blockers.join(" · ")) + "</p>"
          : "") +
        "<p><b>Next</b> " +
        esc(digest.next) +
        "</p>";
    };
    const post = async (body) => {
      await result(
        db
          .from("project_messages")
          .insert({
            project_id: id,
            kind: "text",
            body: String(body).slice(0, 6000),
          }),
      );
      notify("Posted to team chat.");
    };
    showDigest(false);
    bind(root, "digest", async () => {
      const response = await aiJSON("digest.daily", {}, () => basic);
      if (root.isConnected) {
        digest = response.data;
        showDigest(response.ai);
      }
    });
    bind(root, "post-digest", () =>
      post(
        [
          "Daily digest",
          digest.progress,
          ...digest.blockers,
          "Next: " + digest.next,
        ].join("\n"),
      ),
    );
    bind(root, "save-standup", async () => {
      const done = root.querySelector('[name="done-line"]').value.trim(),
        next = root.querySelector('[name="next-line"]').value.trim();
      if (!done || !next || done.length > 1000 || next.length > 1000)
        throw Error("Add both lines and keep each under 1,000 characters.");
      await result(
        db
          .from("studio_standups")
          .upsert({ project_id: id, user_id: viewer, day: today, done, next }),
      );
      await todayView();
    });
    bind(root, "merge", async () => {
      const response = await aiJSON("standup.merge", {}, () => ({
        update:
          standups
            .map((s) => name(s.user_id) + ": " + s.done + " → " + s.next)
            .join("\n") || "No stand-ups yet.",
        blockers: [],
      }));
      if (!root.isConnected) return;
      merged = [response.data.update, ...response.data.blockers].join("\n");
      root.querySelector("#today-merge").innerHTML =
        "<small>" +
        (response.ai ? "Gemini" : "Basic") +
        '</small><p class="studio-preserve">' +
        esc(merged) +
        "</p>" +
        button("post-merged", "Post merged update");
      bind(root, "post-merged", () => post(merged));
    });
  }
  async function shipCheck() {
    const evidence = project.submission_evidence || {};
    const delivery = [
      ["Repository linked", Boolean(project.repository), project.repository],
      [
        "Rules read",
        data.requirements.length > 0 &&
          data.requirements.every((r) => r.verified),
        "Verified in Project setup",
      ],
      [
        "All tasks done",
        data.tasks.length > 0 && data.tasks.every((t) => t.status === "done"),
        data.tasks.filter((t) => t.status === "done").length +
          " of " +
          data.tasks.length +
          " completed",
      ],
      ["Live deployment", false, "Checking project deployment…"],
      [
        "Demo video recorded",
        Boolean(evidence["Demo video"]),
        evidence["Demo video"],
      ],
      [
        "README written",
        Boolean(evidence.readme_done || evidence.README),
        "Lead confirmation",
      ],
      [
        "Tests pass",
        Boolean(evidence.tests_done || evidence.Tests),
        "Lead confirmation",
      ],
    ];
    root.innerHTML =
      '<header class="clean-page-heading"><h2>Ship check</h2>' +
      (leader ? button("edit-evidence", "Edit evidence") : "") +
      '</header><div id="ship-evidence"></div>' +
      panel(
        "What if",
        '<div class="studio-standup-fields"><label>Change deadline<input type="date" name="sim-date" value="' +
          esc(project.submission_deadline || "") +
          '"></label>' +
          pick("sim-person", "Remove a teammate", [
            ["", "Keep everyone"],
            ...members.map((m) => [m.user_id, m.full_name]),
          ]) +
          pick("sim-work", "Cut a task", [
            ["", "Keep all tasks"],
            ...data.tasks
              .filter((t) => t.status !== "done")
              .map((t) => [t.id, t.title]),
          ]) +
          "</div>" +
          button("simulate", "Compare risk") +
          '<output id="ship-result" aria-live="polite"></output>',
      );
    function render() {
      const score = Math.round(
        (100 * delivery.filter((r) => r[1]).length) / delivery.length,
      );
      root.querySelector("#ship-evidence").innerHTML = panel(
        "Readiness",
        '<div class="studio-metrics"><div><small>Ready to submit</small><strong>' +
          score +
          '%</strong></div></div><table class="studio-table ship-table"><thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Evidence</th></tr></thead><tbody>' +
          delivery
            .map(
              ([label, ok, proof]) =>
                '<tr><th scope="row">' +
                esc(label) +
                '</th><td><span class="studio-chip ' +
                (ok ? "ok" : "warn") +
                '">' +
                (ok ? "Ready" : "Open") +
                "</span></td><td>" +
                esc(proof || "Missing") +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>",
      );
    }
    render();
    bind(root, "edit-evidence", () =>
      showSheet(
        "Submission evidence",
        '<label>Demo video URL<input name="video" type="url" value="' +
          esc(evidence["Demo video"] || "") +
          '"></label>' +
          '<label><input name="readme" type="checkbox" ' +
          (evidence.readme_done || evidence.README ? "checked" : "") +
          '> README written</label><label><input name="tests" type="checkbox" ' +
          (evidence.tests_done || evidence.Tests ? "checked" : "") +
          "> Tests pass</label>",
        (f) =>
          result(
            db
              .from("projects")
              .update({
                submission_evidence: {
                  ...evidence,
                  "Demo video": f.get("video"),
                  readme_done: f.has("readme"),
                  tests_done: f.has("tests"),
                  ...(!f.has("readme") ? { README: "" } : {}),
                  ...(!f.has("tests") ? { Tests: "" } : {}),
                },
              })
              .eq("id", id),
          ),
      ),
    );
    const end = (value) =>
      value ? new Date(value + "T23:59:59").getTime() : NaN;
    bind(root, "simulate", () => {
      const val = (k) => root.querySelector('[name="' + k + '"]').value;
      const capacity = (skip) =>
        data.availability
          .filter((a) => a.user_id !== skip)
          .reduce((sum, a) => sum + Number(a.weekly_hours), 0);
      const before = pace(
        data.tasks,
        capacity(null),
        end(project.submission_deadline),
      );
      const after = pace(
        data.tasks.filter((t) => t.id !== val("sim-work")),
        capacity(val("sim-person")),
        end(val("sim-date")),
      );
      const label = (m) =>
        m.risk +
        " · " +
        m.left +
        " h open · " +
        (m.capacity === null
          ? "capacity unknown"
          : Math.round(m.capacity) + " h available");
      root.querySelector("#ship-result").textContent =
        "Before: " + label(before) + " → After: " + label(after);
    });
    try {
      const response = await fetch(
        "/api/activity?project=" + encodeURIComponent(id),
        { headers: { authorization: "Bearer " + session.access_token } },
      );
      const info = response.ok ? (await response.json()).deployment : null;
      delivery[3][1] = info?.status === "Ready" && Boolean(info.url);
      delivery[3][2] =
        info?.url || info?.status || "Connect Vercel in Settings";
    } catch {
      delivery[3][2] = "Deployment status unavailable";
    }
    if (root.isConnected) render();
  }

  if (tab === "Report") {
    root.insertAdjacentHTML(
      "beforeend",
      panel(
        "Gemini notes",
        button(
          "report-notes",
          permitted ? "Draft contributor notes" : "Write contributor notes",
        ) + '<div id="report-notes" aria-live="polite"></div>',
      ),
    );
    bind(root, "report-notes", async () => {
      const rows = members.map((m) => ({
        name: m.full_name,
        text:
          data.tasks.filter(
            (t) => t.owner_id === m.user_id && t.status === "done",
          ).length +
          " tasks completed as " +
          (m.role || "teammate") +
          ".",
      }));
      const proposed = await aiJSON("report.write", {}, () => ({
        team:
          data.tasks.filter((t) => t.status === "done").length +
          " team tasks completed.",
        members: rows,
      }));
      if (root.isConnected)
        root.querySelector("#report-notes").innerHTML =
          "<small>" +
          (proposed.ai ? "Gemini draft" : "Basic") +
          "</small><p>" +
          esc(proposed.data.team) +
          "</p>" +
          proposed.data.members
            .map(
              (m) => "<p><b>" + esc(m.name) + "</b> · " + esc(m.text) + "</p>",
            )
            .join("");
    });
  }
  if (tab !== "Chat") {
    root.insertAdjacentHTML(
      "beforeend",
      '<button class="button primary studio-fab" type="button" data-final="quick">＋ Quick add</button>',
    );
    bind(root, "quick", quickAdd);
  }
  const view = { Planning: corkboard, Today: todayView, Ship: shipCheck }[tab];
  if (view)
    view()
      .then(() => {
        if (root.isConnected && !actions(root, "quick")) {
          root.insertAdjacentHTML(
            "beforeend",
            '<button class="button primary studio-fab" type="button" data-final="quick">＋ Quick add</button>',
          );
          bind(root, "quick", quickAdd);
        }
      })
      .catch((error) => {
        if (root.isConnected)
          root.insertAdjacentHTML(
            "beforeend",
            '<p role="alert">' + esc(error.message) + "</p>",
          );
      });
  return () => observer?.disconnect();
}
