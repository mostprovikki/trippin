CREATE TABLE organizers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE persons (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  phone TEXT, email TEXT, emergency_contact TEXT,
  dietary TEXT CHECK (dietary IN ('veg','non_veg','vegan')), allergies TEXT, medical_notes TEXT,
  pace TEXT CHECK (pace IN ('relaxed','moderate','packed')),
  interests TEXT NOT NULL DEFAULT '[]',            -- JSON string[]
  budget_band TEXT CHECK (budget_band IN ('low','medium','high')),
  home_city TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime()), updated_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE documents (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','national_id','driving_license','vaccination','other')),
  doc_number TEXT, expiry_date TEXT,               -- ISO date or NULL
  file_path TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE trips (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','planning','confirmed','active','archived')),
  vibe_tags TEXT NOT NULL DEFAULT '[]',            -- JSON string[]
  origin_city TEXT, currency TEXT NOT NULL DEFAULT 'INR',
  date_mode TEXT NOT NULL DEFAULT 'broad' CHECK (date_mode IN ('confirmed','slight','broad')),
  start_date TEXT, end_date TEXT, flex_days INTEGER,
  destination_mode TEXT NOT NULL DEFAULT 'open' CHECK (destination_mode IN ('decided','open')),
  destination TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime()), updated_at TEXT NOT NULL DEFAULT (datetime()), archived_at TEXT
);
CREATE TABLE trip_date_windows (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, note TEXT
);
CREATE TABLE trip_goals (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL, fixed_date TEXT, fixed_place TEXT, notes TEXT
);
CREATE TABLE trip_participants (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  profile_confirmed INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime()),
  PRIMARY KEY (trip_id, person_id)
);
CREATE TABLE participant_links (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE destination_candidates (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL, rationale TEXT, best_dates TEXT, est_budget_per_person REAL, caveats TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai','manual')),
  decided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE budget_lines (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('primary_transport','secondary_transport','stay','food','activities','shopping','leisure','misc')),
  estimate REAL NOT NULL DEFAULT 0, basis TEXT,
  UNIQUE (trip_id, category)
);
CREATE TABLE budget_overrides (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id),
  amount REAL NOT NULL, note TEXT,
  UNIQUE (trip_id, person_id)
);
CREATE TABLE itinerary_days (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_date TEXT NOT NULL, position INTEGER NOT NULL,
  UNIQUE (trip_id, day_date)
);
CREATE TABLE itinerary_items (
  id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, time_range TEXT, location TEXT,
  category TEXT NOT NULL DEFAULT 'activity' CHECK (category IN ('travel','food','activity','rest','logistics')),
  est_cost REAL, notes TEXT, link TEXT
);
CREATE TABLE checklists (
  id TEXT PRIMARY KEY,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,   -- NULL for templates
  is_template INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('packing','tasks')),
  name TEXT NOT NULL, trip_type_tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime()),
  CHECK (is_template = 1 OR trip_id IS NOT NULL)
);
CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL, assignee_person_id TEXT REFERENCES persons(id),
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
);
CREATE TABLE archives (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL, notes TEXT, photo_links TEXT NOT NULL DEFAULT '[]',
  archived_at TEXT NOT NULL DEFAULT (datetime())
);
CREATE TABLE actuals (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL, amount REAL NOT NULL,
  PRIMARY KEY (trip_id, category)
);
CREATE INDEX idx_documents_person ON documents(person_id);
CREATE INDEX idx_links_trip ON participant_links(trip_id);
CREATE INDEX idx_items_day ON itinerary_items(day_id);
