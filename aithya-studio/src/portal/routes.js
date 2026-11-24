export const sections = {
  Today: ['Overview', 'Today', 'My dashboard'],
  Rules: ['Project setup', 'Files'],
  Work: ['Board', 'AI plan', 'Timeline', 'AI mentor', 'Learning', 'Activity', 'History'],
  Team: ['Bulletin', 'Chats', 'Team', 'Register'],
  Submit: ['Ship check', 'Report', 'Portfolio'],
};

export function deadlineLabel(date) {
  if (!date) return 'No submission deadline';
  const deadline = new Date(date + 'T23:59:59+05:30');
  if (!Number.isFinite(deadline.getTime())) return 'No submission deadline';
  const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(deadline);
  return (deadline.getTime() < Date.now() ? 'Deadline passed' : 'Due') + ' ' + display + ' IST';
}
