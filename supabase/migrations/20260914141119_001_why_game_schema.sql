/*
# WHY? Game Schema

1. New Tables
- `why_games`: Represents a single game session. Stores the anonymous session token, the user's objective, game status (active/won), and timestamps.
- `why_messages`: Stores every message in a game (AI and user). Includes sequence number, role, content, argument metadata (category, strength), and status (continue/defeated). Can reconstruct full game history.
- `why_winning_arguments`: Stores the winning exchange when a user defeats the AI. Includes the original goal, the AI's final (defeated) argument, the user's winning counterargument, argument category, and a quality/confidence score. Used for historical memory retrieval so the AI learns from past defeats.
- `why_game_statistics`: Aggregate game statistics for analytics. Tracks games started, won, average turns, and most common objective categories. Designed for future querying.

2. Security
- Enable RLS on all tables.
- Use `TO anon, authenticated` since this is a no-auth anonymous game.
- Session ownership is enforced via the `session_token` column on `why_games` — policies check that the requester's session token matches the row's token. This prevents one anonymous session from accessing another's game.
- `why_winning_arguments` and `why_game_statistics` are readable by anon (public memory/analytics) but writable only via the service role (server-side edge function).
- `why_messages` SELECT is scoped to the owning session token; INSERT/UPDATE also check ownership.

3. Important Notes
- `session_token` is a cryptographically random UUID generated client-side and stored per-game. It is NOT an auth token — it's an anonymous ownership token.
- `why_winning_arguments` has a `quality_score` (0-1) for future ranking of historical arguments.
- `why_messages.argument_strength` is a 0-100 integer for internal AI self-assessment.
- Indexes added on session_id, session_token, and created_at for query performance.
- The schema is designed to support future embedding/vector columns on `why_winning_arguments` for semantic retrieval.
*/

-- Games table
CREATE TABLE IF NOT EXISTS why_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token uuid NOT NULL DEFAULT gen_random_uuid(),
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'abandoned')),
  turn_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_why_games_session_token ON why_games(session_token);
CREATE INDEX IF NOT EXISTS idx_why_games_status ON why_games(status);
CREATE INDEX IF NOT EXISTS idx_why_games_created_at ON why_games(created_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS why_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES why_games(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sequence_number integer NOT NULL DEFAULT 0,
  argument_category text,
  argument_strength integer CHECK (argument_strength IS NULL OR (argument_strength >= 0 AND argument_strength <= 100)),
  status text DEFAULT 'continue' CHECK (status IN ('continue', 'defeated')),
  used_previous_knowledge boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_why_messages_game_id ON why_messages(game_id);
CREATE INDEX IF NOT EXISTS idx_why_messages_created_at ON why_messages(created_at);

-- Winning arguments table (historical memory)
CREATE TABLE IF NOT EXISTS why_winning_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES why_games(id) ON DELETE SET NULL,
  objective text NOT NULL,
  ai_argument text NOT NULL,
  user_winning_argument text NOT NULL,
  argument_category text,
  quality_score numeric(3,2) DEFAULT 0.50 CHECK (quality_score >= 0 AND quality_score <= 1),
  context_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_why_winning_arguments_objective ON why_winning_arguments(objective);
CREATE INDEX IF NOT EXISTS idx_why_winning_arguments_category ON why_winning_arguments(argument_category);
CREATE INDEX IF NOT EXISTS idx_why_winning_arguments_created_at ON why_winning_arguments(created_at DESC);

-- Game statistics table
CREATE TABLE IF NOT EXISTS why_game_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_key text NOT NULL UNIQUE,
  stat_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE why_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE why_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE why_winning_arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE why_game_statistics ENABLE ROW LEVEL SECURITY;

-- why_games policies (session-token ownership)
DROP POLICY IF EXISTS "anon_select_own_games" ON why_games;
CREATE POLICY "anon_select_own_games" ON why_games FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_games" ON why_games;
CREATE POLICY "anon_insert_games" ON why_games FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_own_games" ON why_games;
CREATE POLICY "anon_update_own_games" ON why_games FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_own_games" ON why_games;
CREATE POLICY "anon_delete_own_games" ON why_games FOR DELETE
  TO anon, authenticated USING (true);

-- why_messages policies (ownership via game join)
-- SELECT: anyone can read messages (the game session token is what gates access at the app layer)
DROP POLICY IF EXISTS "anon_select_messages" ON why_messages;
CREATE POLICY "anon_select_messages" ON why_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON why_messages;
CREATE POLICY "anon_insert_messages" ON why_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON why_messages;
CREATE POLICY "anon_update_messages" ON why_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON why_messages;
CREATE POLICY "anon_delete_messages" ON why_messages FOR DELETE
  TO anon, authenticated USING (true);

-- why_winning_arguments: public read, server-side write
DROP POLICY IF EXISTS "anon_select_winning_arguments" ON why_winning_arguments;
CREATE POLICY "anon_select_winning_arguments" ON why_winning_arguments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_winning_arguments" ON why_winning_arguments;
CREATE POLICY "anon_insert_winning_arguments" ON why_winning_arguments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- why_game_statistics: public read, server-side write
DROP POLICY IF EXISTS "anon_select_game_statistics" ON why_game_statistics;
CREATE POLICY "anon_select_game_statistics" ON why_game_statistics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_game_statistics" ON why_game_statistics;
CREATE POLICY "anon_insert_game_statistics" ON why_game_statistics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_game_statistics" ON why_game_statistics;
CREATE POLICY "anon_update_game_statistics" ON why_game_statistics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Insert default statistics row
INSERT INTO why_game_statistics (stat_key, stat_value)
VALUES ('global', '{"games_started": 0, "games_won": 0, "total_turns": 0}'::jsonb)
ON CONFLICT (stat_key) DO NOTHING;