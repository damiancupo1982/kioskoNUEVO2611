/*
  # Add tenis field to members

  Adds a boolean `tenis` column to the members table to store whether
  the member has a tennis permit (imported from Excel "SI/NO" column).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'tenis'
  ) THEN
    ALTER TABLE members ADD COLUMN tenis boolean DEFAULT false;
  END IF;
END $$;
