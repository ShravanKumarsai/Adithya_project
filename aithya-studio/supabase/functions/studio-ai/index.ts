import { createStudioAIEdge } from "../../../server/ai-edge.mjs";
import { DB } from "../../../server/vercel-storage.mjs";

Deno.serve(createStudioAIEdge({
  DB,
  STUDIO_ALLOWED_ORIGINS: Deno.env.get("STUDIO_ALLOWED_ORIGINS"),
  GEMINI_SETUP_API_KEY: Deno.env.get("GEMINI_SETUP_API_KEY"),
  GEMINI_SETUP_MODEL: Deno.env.get("GEMINI_SETUP_MODEL"),
  GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
  PROJECT_GEMINI_KEY_SECRET: Deno.env.get("PROJECT_GEMINI_KEY_SECRET"),
  ENABLE_GROUNDED_THREAD_AI: Deno.env.get("ENABLE_GROUNDED_THREAD_AI"),
}));
