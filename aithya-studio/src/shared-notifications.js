export function notifications({
  db,
  result,
  rpc,
  escape,
  when,
  notify,
  openProject,
  getSession,
}) {
  const bell = document.getElementById("notification-bell");
  const panel = document.getElementById("notification-panel");
  const count = document.getElementById("notification-count");
  const list = document.getElementById("notification-list");
  const names = {
    "credits.codex.primary": "Codex’s primary usage window reached its reset time",
    "credits.codex.secondary": "Codex’s secondary usage window reached its reset time",
    "credits.manual.reset": "An AI tracker reached its scheduled reset time",
    "credits.claude.five_hour": "Claude’s 5-hour credits reached their reset time",
    "credits.claude.seven_day": "Claude’s weekly credits reached their reset time",
    "chat.mention":"You were mentioned in team chat", "chat.proposal":"A teammate proposed a task for you","milestone.overdue":"Milestone overdue",
    "projects.insert": "Project created",
    "projects.update": "Project brief or status updated",
    "project_members.insert": "Teammate added",
    "project_members.update": "Team membership or profile updated",
    "requirement_items.insert": "Requirement added",
    "requirement_items.update": "Requirement updated",
    "project_tasks.insert": "Task added",
    "project_tasks.update": "Task updated",
    "project_documents.insert": "Document uploaded",
    "project_ai_constraints.update": "AI policy updated",
    "project_plans.insert": "Gemini plan saved",
    "project_plans.update": "Gemini plan updated",
  };
  let request = 0;
  function close() {
    panel.hidden = true;
    bell.setAttribute("aria-expanded", "false");
  }
  async function refresh() {
    const version = ++request;
    const userId = getSession()?.user.id;
    bell.hidden = !userId;
    if (!userId) {
      close();
      count.hidden = true;
      list.textContent = "";
      return;
    }
    try {
      const rows = await rpc("project_notification_feed");
      if (request !== version || getSession()?.user.id !== userId) return;
      const unread = rows.filter((row) => row.unread).length;
      count.hidden = !unread;
      count.textContent = unread > 99 ? "99+" : String(unread);
      bell.setAttribute(
        "aria-label",
        unread ? "Notifications, " + unread + " unread" : "Notifications",
      );
      if (!rows.length) {
        list.innerHTML = "<p>No project notifications yet.</p>";
        return;
      }
      const groups = new Map();
      for (const row of rows) {
        if (!groups.has(row.project_id)) groups.set(row.project_id, []);
        groups.get(row.project_id).push(row);
      }
      list.innerHTML = [...groups.entries()]
        .map(
          ([id, events]) =>
            '<section class="notification-group"><header><button type="button" class="notification-project" data-open-project="' +
            escape(id) +
            '">' +
            escape(events[0].project_name) +
            "</button>" +
            (events.some((event) => event.unread)
              ? '<button type="button" class="notification-read" data-read-project="' +
                escape(id) +
                '">Mark read</button>'
              : "") +
            "</header><ol>" +
            events
              .map(
                (event) =>
                  '<li class="' +
                  (event.unread ? "notification-unread" : "") +
                  '"><span>' +
                  escape(names[event.event_type] || "Project activity") +
                  '</span><time datetime="' +
                  escape(event.event_time) +
                  '">' +
                  escape(when(event.event_time)) +
                  "</time></li>",
              )
              .join("") +
            "</ol></section>",
        )
        .join("");
      for (const button of list.querySelectorAll("[data-read-project]")) {
        button.onclick = async () => {
          button.disabled = true;
          try {
            const id = button.dataset.readProject;
            await rpc("mark_project_notifications_read", {
              p_project_id: id,
              p_event_id: groups.get(id)[0].event_id,
            });
            await refresh();
            panel.querySelector("[data-open-project='" + id + "']")?.focus();
          } catch (error) {
            notify(error.message);
            button.disabled = false;
          }
        };
      }
      for (const button of list.querySelectorAll("[data-open-project]")) {
        button.onclick = async () => {
          button.disabled = true;
          try {
            const project = await result(
              db
                .from("projects")
                .select("*")
                .eq("id", button.dataset.openProject)
                .single(),
            );
            if (getSession()?.user.id !== userId) return;
            close();
            await openProject(project);
          } catch (error) {
            notify(error.message);
            button.disabled = false;
          }
        };
      }
    } catch {
      if (request === version)
        list.textContent =
          "Could not load notifications. Use Refresh to try again.";
    }
  }
  bell.onclick = () => {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    bell.setAttribute("aria-expanded", "true");
    refresh();
  };
  document.getElementById("notification-refresh").onclick = refresh;
  document.addEventListener("click", (event) => {
    if (
      !panel.hidden &&
      !panel.contains(event.target) &&
      !bell.contains(event.target)
    )
      close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      bell.focus();
    }
  });
  const poll = () => {
    if (!document.hidden && panel.hidden) refresh();
  };
  setInterval(poll, 60000);
  document.addEventListener("visibilitychange", poll);
  return { refresh };
}
