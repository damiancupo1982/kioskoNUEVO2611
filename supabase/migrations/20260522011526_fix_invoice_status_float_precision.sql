/*
  # Fix invoice status floating point precision

  The trigger that marks invoices as "paid" was using exact equality which fails
  when the total has floating point rounding errors (e.g. 240912.20000000004 vs 240912.2).

  ## Changes
  - `update_purchase_invoice_status`: Use ROUND(..., 2) on both sides so tiny
    floating point fractions are ignored when deciding if the invoice is fully paid.
  - Fix existing invoices whose status is stuck on "partial" due to this bug,
    by rounding their stored total to 2 decimal places and recalculating status.
*/

CREATE OR REPLACE FUNCTION update_purchase_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid numeric;
  invoice_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM purchase_payments WHERE invoice_id = NEW.invoice_id;

  SELECT total INTO invoice_total
  FROM purchase_invoices WHERE id = NEW.invoice_id;

  UPDATE purchase_invoices
  SET
    paid_amount = total_paid,
    status = CASE
      WHEN ROUND(total_paid::numeric, 2) >= ROUND(invoice_total::numeric, 2) THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      ELSE 'pending'
    END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix existing invoices with floating point drift in total
UPDATE purchase_invoices
SET
  total = ROUND(total::numeric, 2),
  status = CASE
    WHEN ROUND(paid_amount::numeric, 2) >= ROUND(total::numeric, 2) AND paid_amount > 0 THEN 'paid'
    WHEN paid_amount > 0 THEN 'partial'
    ELSE 'pending'
  END
WHERE total <> ROUND(total::numeric, 2);
