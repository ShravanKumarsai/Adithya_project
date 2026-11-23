import { json, timedFetch } from "./server/http.mjs";
import { dailyLimits, quotaReservations } from "./server/quota.mjs";
import { supabasePublishableKey, supabaseUrl } from "./src/lib/supabase-config.js";
import { rulebookLimit } from "./src/lib/rulebook-limits.js";
import setupRulebookPrompt from "./setup-prompts/rulebook.json" with { type: "json" };

const rulebookMedia = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function rulebookMediaMatches(bytes, type) {
  const ascii = (start, count) =>
    String.fromCharCode(...bytes.subarray(start, start + count));
  if (type === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
}

async function readRulebookBytes(request) {
  if (
    !request.body ||
    Number(request.headers.get("content-length")) > rulebookLimit
  )
    return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > rulebookLimit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function encodeRulebookBytes(bytes) {
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 24576) {
    chunks.push(
      btoa(String.fromCharCode(...bytes.subarray(index, index + 24576))),
    );
  }
  return chunks.join("");
}

async function requestGeminiRulebook(env, mime, bytes) {
  const model = env.GEMINI_SETUP_MODEL || "gemini-3.5-flash-lite";
  return timedFetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_SETUP_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: setupRulebookPrompt.instruction }],
        },
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mime,
                  data: encodeRulebookBytes(bytes),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 4400,
          responseJsonSchema: {
            type: "object",
            required: ["fields"],
            properties: {
              fields: {
                type: "array",
                maxItems: 20,
                items: {
                  type: "object",
                  required: ["label", "value"],
                  properties: {
                    label: {
                      type: "string",
                      enum: setupRulebookPrompt.fields,
                    },
                    value: { type: "string" },
                  },
                },
              },
            },
          },
        },
      }),
    },
    55000,
  );
}

export async function setupRulebookResponse(request, env, url, user) {
  if (request.method === "GET")
    return json({ configured: Boolean(env.GEMINI_SETUP_API_KEY) });
  if (request.method !== "POST")
    return json({ error: "Use the rulebook importer." }, 405);
  if (request.headers.get("origin") !== url.origin)
    return json({ error: "Open the importer from Project setup." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ error: "Sign in to Aithya to import files." }, 401);
  if (!env.GEMINI_SETUP_API_KEY)
    return json(
      {
        error:
          "Gemini scanning is awaiting the site’s setup key. Paste the rules or use a text-based file for now.",
      },
      503,
    );
  const mime = request.headers.get("content-type");
  if (!rulebookMedia.has(mime))
    return json({ error: "Use a PDF, JPEG, PNG, or WebP file." }, 415);
  let stage = "session";
  const quota = quotaReservations(env.DB);
  try {
    const identity = await timedFetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabasePublishableKey, authorization },
    });
    if (!identity.ok)
      return json(
        { error: "Your Aithya session expired. Sign in again." },
        401,
      );
    stage = "upload";
    const bytes = await readRulebookBytes(request);
    if (!bytes) return json({ error: "Choose a file up to 8 MB." }, 413);
    if (!rulebookMediaMatches(bytes, mime))
      return json({ error: "The file contents do not match its format." }, 415);
    stage = "quota";
    if (!await quota.reserve("setup:account:" + user.id, dailyLimits.scanUser))
      return json(quota.exceeded("Your daily rulebook scan limit has been reached.", dailyLimits.scanUser), 429);
    if (!await quota.reserve("setup:site", dailyLimits.scanSite))
      return json(quota.exceeded("The site's daily scanning limit has been reached.", dailyLimits.scanSite), 429);
    stage = "gemini";
    const response = await requestGeminiRulebook(env, mime, bytes);
    if (response.status === 429)
      return json(
        { error: "Gemini scanning is at capacity. Try again later." },
        429,
      );
    if ([401, 403].includes(response.status))
      return json(
        { error: "The site’s Gemini setup key needs attention." },
        502,
      );
    if (!response.ok)
      return json(
        {
          error:
            "Gemini couldn’t read this file. Try a smaller PDF or clearer photo.",
        },
        502,
      );
    stage = "response";
    const payload = await response.json();
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason !== "STOP")
      return json(
        {
          error:
            "Gemini couldn’t finish reading this file. Try a smaller selection.",
        },
        502,
      );
    const output = candidate.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text || "")
      .join("");
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed.fields))
      return json({ error: "Gemini didn’t return usable setup details." }, 502);
    const fields = parsed.fields
      .slice(0, 20)
      .filter(
        (item) =>
          setupRulebookPrompt.fields.includes(item?.label) &&
          typeof item?.value === "string",
      )
      .map(({ label, value }) => ({
        label,
        value: value.trim().slice(0, 1200),
      }));
    if (!fields.some(({ value }) => value)) return json({ error: "No usable details were found. Try a clearer file." }, 422);
    quota.commit();
    return json({ fields });
  } catch (error) {
    const failure =
      error?.name === "AbortError"
        ? "timeout"
        : error instanceof SyntaxError
          ? "invalid_response"
          : "request_error";
    console.warn("rulebook_scan_failed", stage, failure);
    const messages = {
      session:
        "Aithya couldn’t verify your session. Try again, or sign in again if this persists.",
      upload: "The file upload was interrupted. Select the file and retry.",
      quota: "Aithya couldn’t check the scan limit. Please retry in a moment.",
      gemini:
        failure === "timeout"
          ? "Gemini took too long. Try a smaller PDF or a single photo."
          : "Aithya couldn’t reach Gemini. Please retry in a moment.",
      response:
        "Gemini returned unreadable setup details. Retry with a clearer photo or smaller PDF.",
    };
    return json({ error: messages[stage] }, failure === "timeout" ? 504 : 502);
  } finally {
    await quota.refund();
  }
}
