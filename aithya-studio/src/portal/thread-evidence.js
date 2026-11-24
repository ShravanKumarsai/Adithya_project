const threadActions = new Set(["chat.summary", "chat.actions", "chat.decisions"]);

export function isThreadAction(task) {
  return threadActions.has(task);
}

function entry(message, why, confidence = "high") {
  return { text: message.body.trim().slice(0, 300), source: message.id, why, confidence };
}

export function localThreadDraft(task, messages) {
  const recent = messages.filter(message => typeof message.body === "string" && message.body.trim()).slice(-40);
  if (task === "chat.actions") return { items:recent
    .filter(message => /^(?:todo\b|action(?: item)?\b|(?:i|we)(?: will|['’]ll)|need to\b)/i.test(message.body.trim()))
    .slice(-5).map(message => entry(message, "An explicit action is phrased in this message.")) };
  if (task === "chat.decisions") return { items:recent
    .filter(message => message.kind === "decision" || /^(?:decided|agreed|we agreed|decision)\b/i.test(message.body.trim()))
    .slice(-5).map(message => entry(message, "The message marks or states a decision.")) };
  return { items:recent
    .filter(message => ["text","decision","standup"].includes(message.kind))
    .slice(-3).map(message => entry(message, "This is a recent message from the selected thread.", "medium")) };
}

export function verifyThreadDraft(draft, sourceIds) {
  const ids = new Set(sourceIds);
  if (draft.items.some(item => !ids.has(item.source))) throw Error("A draft item cites a message outside the selected thread");
  return {items:draft.items.filter(item => item.confidence !== "low")};
}
