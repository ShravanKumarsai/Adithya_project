export const responseHeaders = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};
export const json = (data, status = 200) =>
  Response.json(data, { status, headers: responseHeaders });
export const truncate = (value, limit) => String(value || "").slice(0, limit);
export async function timedFetch(
  url,
  init = {},
  timeoutMs = 10000,
  allowNotModified = false,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      !(allowNotModified && response.status === 304)
    ) {
      await response.body?.cancel();
      throw new Error("Unexpected redirect from upstream service.");
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}
