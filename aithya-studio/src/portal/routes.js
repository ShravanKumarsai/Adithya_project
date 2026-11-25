export const sections = {
  Today: ['Overview', 'Today', 'My dashboard'],
  Rules: ['Project setup', 'Files'],
  Work: ['Board', 'AI plan', 'Timeline', 'AI mentor', 'Learning', 'Activity', 'History'],
  Team: ['Bulletin', 'Chats', 'Team'],
  Submit: ['Ship check', 'Report', 'Portfolio'],
};

export const projectDeadline = (date) => date ? Date.parse(date + "T23:59:59.999+05:30") : NaN;

export function deadlineLabel(date) {
  if (!date) return 'No submission deadline';
  const deadline = new Date(projectDeadline(date));
  if (!Number.isFinite(deadline.getTime())) return 'No submission deadline';
  const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(deadline);
  return (deadline.getTime() < Date.now() ? 'Deadline passed' : 'Due') + ' ' + display + ' IST';
}
