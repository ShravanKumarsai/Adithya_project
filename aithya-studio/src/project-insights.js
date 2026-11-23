const stages = [
  ["done", "Done"], ["review", "In review"], ["in_progress", "In progress"], ["open", "Open"]
];

function chart(counts, escape) {
  const total = Number(counts?.total || 0);
  if (!total) return '<p class="empty-track">No tasks yet</p>';
  const numbers = stages.map(([key]) => Number(counts[key] || 0));
  numbers[3] = total - numbers[0] - numbers[1] - numbers[2];
  let x = 0;
  const segments = numbers.map((n, i) => {
    const width = n / total * 100;
    const rect = '<rect x="' + x + '" width="' + width + '" height="10" class="stage-' + stages[i][0] + '"/>';
    x += width;
    return rect;
  });
  const label = stages.map(([, name], i) => numbers[i] + " " + name.toLowerCase()).join(", ");
  return '<svg class="task-track" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="' + escape(label) + '"><title>' + escape(label) + '</title>' + segments.join("") + '</svg>';
}

const activityLabels = {
  "project_tasks.insert": "Task added",
  "project_tasks.update": "Task updated",
  "project_members.insert": "Teammate added",
  "project_members.update": "Team membership updated",
  "milestone.overdue": "Milestone overdue",
  "chat.mention": "Chat mention",
  "chat.proposal": "Task proposal",
  "project_plans.insert": "Plan saved",
  "project_plans.update": "Plan updated",
  "credits.codex.primary": "Codex usage reset",
  "credits.manual.reset": "AI tracker reset reminder",
};
const rightNow = (date) =>
  new Intl.DateTimeFormat("en-CA", { year:"numeric",month:"2-digit",day:"2-digit" }).format(date);
const projectPath = (id, sheet) => "/shared?" + new URLSearchParams({project:id,sheet});

export function todayView({ projects, totals, tasks, blocked, events, userName, escape, now = new Date() }) {
  const active = projects.filter((p) => !p.archived_at);
  const names = new Map(active.map((p) => [p.id,p.name]));
  const due = active.filter((p) => p.submission_deadline)
    .map((p) => ({...p, deadline: Date.parse(p.submission_deadline + "T23:59:59")}))
    .filter((p) => p.deadline > +now).sort((a,b) => a.deadline-b.deadline)[0];
  const hours = due ? Math.ceil((due.deadline - +now) / 3600000) : null;
  const crunch = hours !== null && hours <= 72;
  const mine = tasks.filter((task) => names.has(task.project_id));
  const today = rightNow(now);
  const dueTasks = mine.filter((task) => task.due_date && task.due_date <= today).slice(0,8);
  const blockers = blocked.filter((task) => names.has(task.project_id)).slice(0,8);
  const first = blockers[0] || dueTasks[0] || mine[0];
  const next = first ? [first.title,projectPath(first.project_id,"Board")] :
    due ? ["Review the submission checklist",projectPath(due.id,"Ship check")] : null;
  const link = (href, text, css = "text-link") => '<a class="' + css + '" data-studio-route href="' +
    escape(href) + '">' + escape(text) + '</a>';
  const title = '<header class="shared-header"><div><h1>Today</h1>' +
    (userName ? '<p>' + escape("Hi, " + userName) + '</p>' : '') + '</div>' +
    (due ? '<div><strong>' + (hours <= 72 ? hours + 'h left' : Math.ceil(hours/24) + 'd left') +
     '</strong><p>' + escape(due.name) + '</p></div>' : '') + '</header>';
  if (!active.length)
    return title + '<section class="bp-panel"><h2>Start your first project</h2>' +
      link("/shared?start=rulebook","Start from a rulebook","button primary") + '</section>';

  const rows = (items, quickStatus = false) => items.map((task) =>
    '<div class="shared-row"><div>' + link(projectPath(task.project_id,"Board"),task.title) + '<p>' +
    escape(names.get(task.project_id)) + (task.due_date ? ' · ' + escape(task.due_date) : '') + '</p></div>' +
    (quickStatus ? '<label class="today-status"><span class="studio-sr">Status for ' + escape(task.title) +
      '</span><select data-today-task="' + escape(task.id) + '">' +
      [["open","Open"],["in_progress","In progress"],["review","Review"],["done","Done"]]
        .map(([value,label]) => '<option value="' + value + '"' +(value===task.status?' selected':'')+'>'+label+'</option>').join('') +
      '</select></label>' : '') + '</div>').join('');
  const history = new Map();
  for (const event of events.filter((row) => row.unread && names.has(row.project_id)).slice(0,12)) {
    if (!history.has(event.project_id)) history.set(event.project_id, []);
    history.get(event.project_id).push(event);
  }
  const activity = [...history].map(([id,items]) => '<details><summary>' +
    escape(names.get(id)) + ' · ' + items.length + '</summary><ul>' +
    items.map((item) => '<li>' + escape(activityLabels[item.event_type] || "Project activity") + '</li>').join("") +
    '</ul>' + link(projectPath(id,"History"),"View project history") + '</details>').join("");
  const byProject = new Map(totals.map((row) => [row.project_id,row]));
  const health = active.map((p) => '<div class="shared-row"><div>' + link(projectPath(p.id,"Overview"),p.name) +
    '</div>' + chart(byProject.get(p.id),escape) + '</div>').join("");
  return title +
    (next ? '<section class="bp-panel"><h2>' + (crunch ? "Crunch mode" : "Next action") + '</h2>' +
      link(next[1],next[0],"button primary") + '</section>' : '') +
    '<div class="shared-columns"><section class="bp-panel"><h2>Work I’m blocking</h2>' +
    (rows(blockers) || '<p>No blocked tasks waiting on you.</p>') + '</section>' +
    (crunch ? '<section class="bp-panel"><h2>Submission</h2>' +
      link(projectPath(due.id,"Ship check"),"Open checklist") + ' · ' +
      link(projectPath(due.id,"Activity"),"Check deployment") + '</section>' :
      '<section class="bp-panel"><h2>My day</h2>' + (rows(dueTasks,true) || '<p>No tasks due today.</p>') + '</section>') + '</div>' +
    (crunch ? '' : '<div class="shared-columns"><section class="bp-panel"><h2>Since you were last here</h2>' +
    (activity || '<p>No unread changes.</p>') + '</section><section class="bp-panel"><h2>Project progress</h2>' +
     health + '</section></div>');
}
