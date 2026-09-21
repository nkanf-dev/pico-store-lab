CREATE TABLE IF NOT EXISTS discovery_counts (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  source TEXT NOT NULL,
  event TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, source, event)
);
