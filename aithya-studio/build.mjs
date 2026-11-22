import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
await build({
  entryPoints: ["src/shared.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  external: ["/rulebook-pdf.mjs"],
  outfile: "ui/shared.bundle.js",
  target: ["es2022"],
  minify: true,
});
const types = {
  "style.css": "text/css",
  "print.css": "text/css",
  "shared.html": "text/html",
  "shared.css": "text/css",
  "shared.bundle.js": "text/javascript",
};
const entries = await Promise.all(
  Object.entries(types).map(async ([file, type]) => [
    file === "index.html"
      ? "/"
      : file === "shared.html"
        ? "/shared"
        : "/" + file,
    [type + "; charset=utf-8", await readFile("ui/" + file, "utf8")],
  ]),
);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/drizzle", { recursive: true });
for (const [route, file] of [
  ["/rulebook-pdf.mjs", "pdf.min.mjs"],
  ["/rulebook-pdf.worker.mjs", "pdf.worker.min.mjs"],
]) {
  entries.push([
    route,
    [
      "text/javascript; charset=utf-8",
      await readFile("node_modules/pdfjs-dist/legacy/build/" + file, "utf8"),
    ],
  ]);
}
entries.push([
  "/rulebook-pdf.LICENSE.txt",
  [
    "text/plain; charset=utf-8",
    await readFile("node_modules/pdfjs-dist/LICENSE", "utf8"),
  ],
]);
const config = (
  await readFile("src/lib/supabase-config.js", "utf8")
).replaceAll("export const ", "const ");
const planApi = (await readFile("planning-api.mjs", "utf8")).replace(
  /^import[\s\S]*?;\s*/,
  "",
);
const prompts = await Promise.all(
  (await readdir("prompts"))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(async (file) => JSON.parse(await readFile("prompts/" + file, "utf8"))),
);
if (
  !prompts.length ||
  new Set(prompts.map((prompt) => prompt.id)).size !== prompts.length ||
  prompts.some(
    (prompt) =>
      !["id", "name", "description", "instruction"].every(
        (field) => typeof prompt[field] === "string" && prompt[field].trim(),
      ),
  )
)
  throw new Error(
    "Planning prompt files must have unique IDs and complete fields.",
  );
const setupPrompt = JSON.parse(
  await readFile("setup-prompts/rulebook.json", "utf8"),
);
const setupScanner = await readFile("setup-rulebook-api.mjs", "utf8");
const notebookApi = await readFile("notebook-api.mjs", "utf8");
const assistCode = (await readFile("src/assist-contract.js","utf8")).replaceAll("export ","") + "\n" + await readFile("assist-api.mjs","utf8");
const worker = (await readFile("worker.mjs", "utf8"))
  .replace(
    "import { assets } from './assets.js';",
    () => "const assets = " + JSON.stringify(Object.fromEntries(entries)) + ";",
  )
  .replace("/* assist API */", () => assistCode)
  .replace("/* notebook API */", () => notebookApi)
  .replace(
    "/* planning API */",
    () =>
      config +
      "const planningTemplates = " +
      JSON.stringify(prompts) +
      ";\n" +
      planApi,
  )
  .replace(
    "/* setup scanner API */",
    () =>
      "const setupRulebookPrompt = " +
      JSON.stringify(setupPrompt) +
      ";\n" +
      setupScanner,
  );
await writeFile("dist/server/index.js", worker);
