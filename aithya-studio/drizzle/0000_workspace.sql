CREATE TABLE workspace_projects (
  user_id TEXT PRIMARY KEY NOT NULL,
  projects_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
