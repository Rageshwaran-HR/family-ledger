-- =============================================================================
-- HEARTH FAMILY LEDGER: COMPLETE MASTER DATABASE MIGRATION
-- Project: amoxrfhtallnkghrhdhe
-- Safe, Idempotent, Production-Ready
-- =============================================================================

-- 1. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('bank', 'cash', 'card', 'wallet', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.loan_status AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. BASE SCHEMA TABLES
-- =============================================================================

-- Families
CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  notify_bills BOOLEAN NOT NULL DEFAULT true,
  notify_loans BOOLEAN NOT NULL DEFAULT true,
  notify_days_ahead INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, family_id, role)
);

-- Accounts
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'bank',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Category Tags
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#a98467',
  icon TEXT NOT NULL DEFAULT 'Tag',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);

-- Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loans
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  remaining_balance NUMERIC(14,2) NOT NULL,
  interest_rate_monthly NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  tenure_months INTEGER NOT NULL DEFAULT 12,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loan Payments
CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  principal_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(14,2),
  due_date DATE NOT NULL,
  recurrence public.recurrence NOT NULL DEFAULT 'none',
  is_paid BOOLEAN NOT NULL DEFAULT false,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Family Invitations
CREATE TABLE IF NOT EXISTS public.family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. BUSINESS MODULE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#e76f51',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  plan_name TEXT NOT NULL DEFAULT 'Monthly',
  monthly_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  billing_day INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.business_clients(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. HELPER SECURITY FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_family(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(_user_id UUID, _family_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND family_id = _family_id AND role = 'admin'
  );
$$;

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Families
  DROP POLICY IF EXISTS "families_select" ON public.families;
  CREATE POLICY "families_select" ON public.families FOR SELECT TO authenticated
    USING (id = public.get_user_family(auth.uid()) OR created_by = auth.uid());

  DROP POLICY IF EXISTS "families_insert" ON public.families;
  CREATE POLICY "families_insert" ON public.families FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

  DROP POLICY IF EXISTS "families_update" ON public.families;
  CREATE POLICY "families_update" ON public.families FOR UPDATE TO authenticated
    USING (id = public.get_user_family(auth.uid()) AND public.is_family_admin(auth.uid(), id));

  -- Profiles
  DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
  CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
  CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

  DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
  CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

  -- User Roles
  DROP POLICY IF EXISTS "roles_select" ON public.user_roles;
  CREATE POLICY "roles_select" ON public.user_roles FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR family_id = public.get_user_family(auth.uid()));

  -- Accounts
  DROP POLICY IF EXISTS "accounts_select" ON public.accounts;
  CREATE POLICY "accounts_select" ON public.accounts FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;
  CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
  CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "accounts_delete" ON public.accounts;
  CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Tags
  DROP POLICY IF EXISTS "tags_select" ON public.tags;
  CREATE POLICY "tags_select" ON public.tags FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "tags_insert" ON public.tags;
  CREATE POLICY "tags_insert" ON public.tags FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "tags_update" ON public.tags;
  CREATE POLICY "tags_update" ON public.tags FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "tags_delete" ON public.tags;
  CREATE POLICY "tags_delete" ON public.tags FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (NOT is_default OR public.is_family_admin(auth.uid(), family_id)));

  -- Transactions
  DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
  CREATE POLICY "transactions_select" ON public.transactions FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
  CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
  CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;
  CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Loans
  DROP POLICY IF EXISTS "loans_select" ON public.loans;
  CREATE POLICY "loans_select" ON public.loans FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "loans_insert" ON public.loans;
  CREATE POLICY "loans_insert" ON public.loans FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "loans_update" ON public.loans;
  CREATE POLICY "loans_update" ON public.loans FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "loans_delete" ON public.loans;
  CREATE POLICY "loans_delete" ON public.loans FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Loan Payments
  DROP POLICY IF EXISTS "loan_payments_select" ON public.loan_payments;
  CREATE POLICY "loan_payments_select" ON public.loan_payments FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "loan_payments_insert" ON public.loan_payments;
  CREATE POLICY "loan_payments_insert" ON public.loan_payments FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "loan_payments_delete" ON public.loan_payments;
  CREATE POLICY "loan_payments_delete" ON public.loan_payments FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Reminders
  DROP POLICY IF EXISTS "reminders_select" ON public.reminders;
  CREATE POLICY "reminders_select" ON public.reminders FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "reminders_insert" ON public.reminders;
  CREATE POLICY "reminders_insert" ON public.reminders FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "reminders_update" ON public.reminders;
  CREATE POLICY "reminders_update" ON public.reminders FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "reminders_delete" ON public.reminders;
  CREATE POLICY "reminders_delete" ON public.reminders FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Family Invitations
  DROP POLICY IF EXISTS "invitations_select" ON public.family_invitations;
  CREATE POLICY "invitations_select" ON public.family_invitations FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "invitations_insert" ON public.family_invitations;
  CREATE POLICY "invitations_insert" ON public.family_invitations FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND public.is_family_admin(auth.uid(), family_id));

  DROP POLICY IF EXISTS "invitations_delete" ON public.family_invitations;
  CREATE POLICY "invitations_delete" ON public.family_invitations FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND public.is_family_admin(auth.uid(), family_id));

  -- Businesses
  DROP POLICY IF EXISTS "businesses_select" ON public.businesses;
  CREATE POLICY "businesses_select" ON public.businesses FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "businesses_insert" ON public.businesses;
  CREATE POLICY "businesses_insert" ON public.businesses FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "businesses_update" ON public.businesses;
  CREATE POLICY "businesses_update" ON public.businesses FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "businesses_delete" ON public.businesses;
  CREATE POLICY "businesses_delete" ON public.businesses FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()) AND (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id)));

  -- Business Clients
  DROP POLICY IF EXISTS "business_clients_select" ON public.business_clients;
  CREATE POLICY "business_clients_select" ON public.business_clients FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "business_clients_insert" ON public.business_clients;
  CREATE POLICY "business_clients_insert" ON public.business_clients FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "business_clients_update" ON public.business_clients;
  CREATE POLICY "business_clients_update" ON public.business_clients FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "business_clients_delete" ON public.business_clients;
  CREATE POLICY "business_clients_delete" ON public.business_clients FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  -- Client Payments
  DROP POLICY IF EXISTS "client_payments_select" ON public.client_payments;
  CREATE POLICY "client_payments_select" ON public.client_payments FOR SELECT TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "client_payments_insert" ON public.client_payments;
  CREATE POLICY "client_payments_insert" ON public.client_payments FOR INSERT TO authenticated
    WITH CHECK (family_id = public.get_user_family(auth.uid()) AND user_id = auth.uid());

  DROP POLICY IF EXISTS "client_payments_update" ON public.client_payments;
  CREATE POLICY "client_payments_update" ON public.client_payments FOR UPDATE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));

  DROP POLICY IF EXISTS "client_payments_delete" ON public.client_payments;
  CREATE POLICY "client_payments_delete" ON public.client_payments FOR DELETE TO authenticated
    USING (family_id = public.get_user_family(auth.uid()));
END $$;

-- =============================================================================
-- 6. CORE AUTH & LIFECYCLE TRIGGERS
-- =============================================================================

-- Auto create profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatic Account Balance Synchronization Trigger on transactions
CREATE OR REPLACE FUNCTION public.handle_transaction_balance_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Handle DELETE or UPDATE (reverse old transaction)
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
    IF OLD.account_id IS NOT NULL THEN
      IF OLD.type = 'income' THEN
        UPDATE public.accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
      ELSIF OLD.type = 'expense' THEN
        UPDATE public.accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
      END IF;
    END IF;
  END IF;

  -- Handle INSERT or UPDATE (apply new transaction)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.account_id IS NOT NULL THEN
      IF NEW.type = 'income' THEN
        UPDATE public.accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
      ELSIF NEW.type = 'expense' THEN
        UPDATE public.accounts SET balance = balance - NEW.amount WHERE id = NEW.account_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transaction_balance ON public.transactions;
CREATE TRIGGER trg_sync_transaction_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_transaction_balance_sync();

-- =============================================================================
-- 7. FAMILY & MEMBER RPC FUNCTIONS
-- =============================================================================

-- Create Family With Admin & Default Tags
CREATE OR REPLACE FUNCTION public.create_family_with_admin(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _family_id UUID;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create family
  INSERT INTO public.families (name, created_by)
  VALUES (_name, _uid)
  RETURNING id INTO _family_id;

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, family_id, role)
  VALUES (_uid, _family_id, 'admin')
  ON CONFLICT (user_id, family_id, role) DO NOTHING;

  -- Ensure profile exists and is updated with family_id
  INSERT INTO public.profiles (id, family_id, full_name, email)
  VALUES (
    _uid,
    _family_id,
    COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = _uid), (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = _uid), ''),
    (SELECT email FROM auth.users WHERE id = _uid)
  )
  ON CONFLICT (id) DO UPDATE SET
    family_id = _family_id,
    updated_at = now();

  -- Seed default accounts (Cash and Main Bank)
  INSERT INTO public.accounts (family_id, user_id, name, type, balance, currency) VALUES
    (_family_id, _uid, 'Cash Wallet', 'cash', 0.00, 'INR'),
    (_family_id, _uid, 'Main Bank', 'bank', 0.00, 'INR')
  ON CONFLICT DO NOTHING;

  -- Seed default tags
  INSERT INTO public.tags (family_id, name, color, icon, is_default, created_by) VALUES
    (_family_id, 'Groceries', '#2a9d8f', 'ShoppingBag', true, _uid),
    (_family_id, 'Utilities', '#e76f51', 'Zap', true, _uid),
    (_family_id, 'Dining', '#f4a261', 'Utensils', true, _uid),
    (_family_id, 'Housing', '#e9c46a', 'Home', true, _uid),
    (_family_id, 'Transport', '#5b8def', 'Car', true, _uid),
    (_family_id, 'Healthcare', '#ef476f', 'Heart', true, _uid),
    (_family_id, 'Entertainment', '#9d4edd', 'Film', true, _uid),
    (_family_id, 'Salary', '#06a77d', 'Briefcase', true, _uid),
    (_family_id, 'Other', '#a98467', 'Tag', true, _uid)
  ON CONFLICT (family_id, name) DO NOTHING;

  RETURN _family_id;
END;
$$;

-- Accept Family Invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _invitation RECORD;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find valid invitation
  SELECT * INTO _invitation
  FROM public.family_invitations
  WHERE token = _token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF _invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Mark invitation accepted
  UPDATE public.family_invitations
  SET accepted_by = _uid, accepted_at = now()
  WHERE id = _invitation.id;

  -- Assign member role
  INSERT INTO public.user_roles (user_id, family_id, role)
  VALUES (_uid, _invitation.family_id, 'member')
  ON CONFLICT (user_id, family_id, role) DO NOTHING;

  -- Ensure profile exists and is updated with family_id
  INSERT INTO public.profiles (id, family_id, full_name, email)
  VALUES (
    _uid,
    _invitation.family_id,
    COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = _uid), (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = _uid), ''),
    (SELECT email FROM auth.users WHERE id = _uid)
  )
  ON CONFLICT (id) DO UPDATE SET
    family_id = _invitation.family_id,
    updated_at = now();

  RETURN _invitation.family_id;
END;
$$;

-- Update Member Role
CREATE OR REPLACE FUNCTION public.update_member_role(_member_user_id UUID, _new_role public.app_role)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller_family UUID := public.get_user_family(auth.uid());
  _target_family UUID := public.get_user_family(_member_user_id);
BEGIN
  IF NOT public.is_family_admin(auth.uid(), _caller_family) THEN
    RAISE EXCEPTION 'Only family admins can modify roles';
  END IF;
  IF _caller_family IS NULL OR _target_family IS NULL OR _caller_family <> _target_family THEN
    RAISE EXCEPTION 'Member not in your family';
  END IF;

  -- Update or insert role
  UPDATE public.user_roles SET role = _new_role WHERE user_id = _member_user_id AND family_id = _caller_family;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, family_id, role) VALUES (_member_user_id, _caller_family, _new_role);
  END IF;

  RETURN true;
END;
$$;

-- Remove Family Member
CREATE OR REPLACE FUNCTION public.remove_family_member(_member_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller_family UUID := public.get_user_family(auth.uid());
  _target_family UUID := public.get_user_family(_member_user_id);
BEGIN
  IF NOT public.is_family_admin(auth.uid(), _caller_family) THEN
    RAISE EXCEPTION 'Only family admins can remove members';
  END IF;
  IF _caller_family IS NULL OR _target_family IS NULL OR _caller_family <> _target_family THEN
    RAISE EXCEPTION 'Member not found in your family';
  END IF;
  IF _member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself as admin';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _member_user_id AND family_id = _caller_family;
  UPDATE public.profiles SET family_id = NULL, updated_at = now() WHERE id = _member_user_id;

  RETURN true;
END;
$$;

-- =============================================================================
-- 8. BACKFILL EXISTING USERS
-- =============================================================================
INSERT INTO public.profiles (id, full_name, email)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1), 'User'),
  email
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = CASE WHEN profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END;

-- =============================================================================
-- 9. REAL BANK SYNC & ACCOUNT AGGREGATOR (SETU AA)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  bank_name TEXT NOT NULL,
  account_number_mask TEXT,
  consent_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_sync_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bank_connection_id UUID REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  type public.transaction_type NOT NULL,
  description TEXT NOT NULL,
  merchant_name TEXT,
  upi_ref TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, categorized, business_matched, ignored
  linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  linked_payment_id UUID REFERENCES public.client_payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_sync_family_status ON public.bank_sync_feed(family_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_conn_family ON public.bank_connections(family_id);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_sync_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_connections_select" ON public.bank_connections;
CREATE POLICY "bank_connections_select" ON public.bank_connections FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_connections_insert" ON public.bank_connections;
CREATE POLICY "bank_connections_insert" ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_connections_update" ON public.bank_connections;
CREATE POLICY "bank_connections_update" ON public.bank_connections FOR UPDATE TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_connections_delete" ON public.bank_connections;
CREATE POLICY "bank_connections_delete" ON public.bank_connections FOR DELETE TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_sync_feed_select" ON public.bank_sync_feed;
CREATE POLICY "bank_sync_feed_select" ON public.bank_sync_feed FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_sync_feed_insert" ON public.bank_sync_feed;
CREATE POLICY "bank_sync_feed_insert" ON public.bank_sync_feed FOR INSERT TO authenticated
  WITH CHECK (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_sync_feed_update" ON public.bank_sync_feed;
CREATE POLICY "bank_sync_feed_update" ON public.bank_sync_feed FOR UPDATE TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));

DROP POLICY IF EXISTS "bank_sync_feed_delete" ON public.bank_sync_feed;
CREATE POLICY "bank_sync_feed_delete" ON public.bank_sync_feed FOR DELETE TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));


