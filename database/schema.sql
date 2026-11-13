-- Test World: only the data currently visible in the Mini App.
-- No transaction/history/task/referral tables are created.
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  balance NUMERIC(20, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
