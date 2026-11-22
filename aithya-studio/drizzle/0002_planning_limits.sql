CREATE TABLE planning_rate (
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (account_id,day)
);
