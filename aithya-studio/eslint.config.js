const globals = Object.fromEntries(
  `AbortController AbortSignal CSS Date globalThis FormData Headers URL URLSearchParams JSON Object Response Request
  btoa atob console crypto document fetch history localStorage location matchMedia performance
  setTimeout clearTimeout setInterval clearInterval sessionStorage window Blob navigator FileReader
  TextEncoder TextDecoder Uint8Array ArrayBuffer Buffer process structuredClone ResizeObserver
  Image HTMLElement HTMLInputElement Event DOMParser Intl`
    .trim()
    .split(/\s+/)
    .map((name) => [name, "readonly"]),
);
export default [
  {
    ignores: [
      "dist/**",
      "public-*/**",
      "node_modules/**",
      "ui/shared.bundle.js",
    ],
  },
  {
    files: [
      "*.mjs",
      "src/**/*.js",
      "server/**/*.mjs",
      "api/**/*.mjs",
      "tests/**/*.mjs",
    ],
    languageOptions: { ecmaVersion: "latest", globals },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
    },
  },
];
