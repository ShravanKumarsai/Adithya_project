CREATE TABLE project_gemini_keys (
  project_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL
);
