/*
  # Add shift difference tracking

  1. Changes
    - Add `opening_difference` column to track difference when opening a shift
    - Add `closing_difference` column to track difference when closing a shift
  
  2. Details
    - opening_difference: Difference between actual opening_cash and suggested (previous closing_cash)
    - closing_difference: Difference between actual closing_cash and expected cash based on transactions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'opening_difference'
  ) THEN
    ALTER TABLE shifts ADD COLUMN opening_difference numeric(10,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'closing_difference'
  ) THEN
    ALTER TABLE shifts ADD COLUMN closing_difference numeric(10,2) DEFAULT 0;
  END IF;
END $$;