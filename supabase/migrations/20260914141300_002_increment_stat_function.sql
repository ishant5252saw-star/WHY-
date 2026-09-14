/*
# Create increment_stat RPC function

1. New Functions
- `increment_stat(key text)`: Atomically increments a numeric field inside the `why_game_statistics` JSONB `stat_value` column. Used by the edge function to update counters (games_started, games_won, total_turns) without race conditions.

2. Security
- The function is SECURITY DEFINER so it can update the statistics table regardless of the caller's role.
- It only modifies the `why_game_statistics` table, which contains no sensitive data.

3. Important Notes
- Uses `jsonb_set` to update a specific key within the JSONB blob.
- Idempotent: if the key doesn't exist in the JSONB, it initializes to 1.
- The `global` row is created by migration 001.
*/

CREATE OR REPLACE FUNCTION increment_stat(key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE why_game_statistics
  SET stat_value = jsonb_set(
    stat_value,
    ARRAY[key],
    to_jsonb(COALESCE((stat_value ->> key)::integer, 0) + 1)
  ),
  updated_at = now()
  WHERE stat_key = 'global';
END;
$$;

GRANT EXECUTE ON FUNCTION increment_stat(text) TO anon, authenticated;