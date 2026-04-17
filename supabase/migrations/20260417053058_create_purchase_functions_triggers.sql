/*
  # Purchase Invoice Functions and Triggers

  ## Functions
    - `generate_purchase_invoice_number()`: Auto-generates sequential invoice numbers in format FC-000001
    - `update_purchase_invoice_status()`: Trigger function that recalculates paid_amount and status after each payment

  ## Triggers
    - `update_invoice_status_on_payment`: Fires after INSERT on purchase_payments to keep invoice status in sync
*/

CREATE OR REPLACE FUNCTION generate_purchase_invoice_number()
RETURNS text AS $$
DECLARE
  last_number integer;
  new_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS integer)), 0) INTO last_number
  FROM purchase_invoices
  WHERE invoice_number ~ '^FC-[0-9]+$';

  new_number := 'FC-' || LPAD((last_number + 1)::text, 6, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_purchase_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid numeric;
  invoice_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid FROM purchase_payments WHERE invoice_id = NEW.invoice_id;
  SELECT total INTO invoice_total FROM purchase_invoices WHERE id = NEW.invoice_id;

  UPDATE purchase_invoices
  SET
    paid_amount = total_paid,
    status = CASE
      WHEN total_paid >= invoice_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      ELSE 'pending'
    END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invoice_status_on_payment ON purchase_payments;
CREATE TRIGGER update_invoice_status_on_payment
  AFTER INSERT ON purchase_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_invoice_status();
