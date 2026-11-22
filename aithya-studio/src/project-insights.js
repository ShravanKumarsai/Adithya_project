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

export function insightsView(projects, totals, escape) {
  const active = projects.filter(p => !p.archived_at);
  const byProject = new Map(totals.map(t => [t.project_id, t]));
  const sum = {total:0, done:0, review:0, in_progress:0};
  for (const p of active) {
    const row = byProject.get(p.id);
    if (row) for (const key of Object.keys(sum)) sum[key] += Number(row[key]);
  }
  const percent = row => Math.round(row.done * 100 / row.total) + "%";
  return '<header class="shared-header"><h1>Project insights</h1><div class="shared-actions"><button class="button subtle" id="refresh-insights">Refresh</button><a class="button subtle" href="/shared">Manage projects</a></div></header>' +
    (!active.length ? '<p>Create a shared project or accept an invitation to see progress here.</p>' :
      '<section class="insight-summary"><div><h2>Task completion</h2><strong>' + (sum.total ? percent(sum) : '—') + '</strong></div><div>' +
      chart(sum, escape) + '<p>' + sum.done + ' of ' + sum.total + ' tasks complete across ' + active.length + ' active ' + (active.length === 1 ? 'project' : 'projects') + '</p></div></section>' +
      '<div class="stage-legend">' + stages.map(([key, label]) => '<span><i class="stage-' + key + '"></i>' + label + '</span>').join("") + '</div>' +
      active.map(p => {
        const row = byProject.get(p.id);
        return '<a class="insight-project" href="/shared?project=' + encodeURIComponent(p.id) + '"><div><h2>' + escape(p.name) + '</h2>' +
          (p.submission_deadline ? '<small>Due ' + escape(p.submission_deadline) + '</small>' : '') + '</div><div>' + chart(row, escape) + '</div><b>' +
          (row?.total ? percent(row) : '—') + '</b></a>';
      }).join(""));
}
