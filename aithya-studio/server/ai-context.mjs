const privateBlocks = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const credentialLine = /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL)[A-Z0-9_]*\s*=.*$/gim;
const token = /\b(?:Bearer +[A-Za-z0-9._~-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{13,}|AIza[A-Za-z0-9_-]{25,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gi;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const sensitiveKey = /^(?:email|authorization|password|api_?key|token|secret|credential)$/i;

export function redactAIContext(value) {
  if (typeof value === "string")
    return value.replace(privateBlocks, "[redacted key]")
      .replace(credentialLine, "[redacted credential]")
      .replace(token, "[redacted credential]")
      .replace(email, "[redacted email]");
  if (Array.isArray(value)) return value.map(redactAIContext);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key))
      .map(([key, item]) => [key, redactAIContext(item)]));
  return value;
}
