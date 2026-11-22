CREATE TABLE project_notes (
  user_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  revision INTEGER NOT NULL,
  contents TEXT NOT NULL,
  PRIMARY KEY (user_id, repository)
);
