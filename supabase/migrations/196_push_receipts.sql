-- Pending Expo push receipts to poll for delayed DeviceNotRegistered errors.
CREATE TABLE IF NOT EXISTS push_receipts (
  ticket_id text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
