CREATE TABLE sync_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, event_id)
);
--> statement-breakpoint
CREATE INDEX sync_events_user_seq ON sync_events (user_id, seq);
--> statement-breakpoint
CREATE TABLE sync_documents (
  user_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  commit_token TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
