
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_bills boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_loans boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_days_ahead integer NOT NULL DEFAULT 7;
