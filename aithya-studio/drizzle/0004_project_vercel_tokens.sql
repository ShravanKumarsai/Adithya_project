CREATE TABLE project_vercel_tokens (
  project_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL
);
