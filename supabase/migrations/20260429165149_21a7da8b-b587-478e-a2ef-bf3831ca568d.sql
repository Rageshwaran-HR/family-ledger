
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.account_type AS ENUM ('bank', 'cash', 'card', 'wallet', 'other');
CREATE TYPE public.loan_status AS ENUM ('active', 'closed');
CREATE TYPE public.recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');

-- Families
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, family_id, role)
);

-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_family(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT family_id FROM public.profiles WHERE id = _user_id $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_family_admin(_user_id UUID, _family_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND family_id = _family_id AND role = 'admin') $$;

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'bank',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags (family-shared)
CREATE TABLE public.tags (
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
CREATE TABLE public.transactions (
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
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  remaining_balance NUMERIC(14,2) NOT NULL,
  interest_rate_monthly NUMERIC(6,3) NOT NULL DEFAULT 1.0, -- percent per month
  tenure_months INTEGER NOT NULL DEFAULT 12,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loan payments
CREATE TABLE public.loan_payments (
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
CREATE TABLE public.reminders (
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

-- Enable RLS
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- families policies
CREATE POLICY "members view family" ON public.families FOR SELECT TO authenticated
  USING (id = public.get_user_family(auth.uid()));
CREATE POLICY "any auth create family" ON public.families FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update family" ON public.families FOR UPDATE TO authenticated
  USING (public.is_family_admin(auth.uid(), id));

-- profiles policies
CREATE POLICY "view family profiles" ON public.profiles FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()) OR id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- user_roles policies
CREATE POLICY "view family roles" ON public.user_roles FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id) OR user_id = auth.uid());

-- accounts policies
CREATE POLICY "view family accounts" ON public.accounts FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "manage own accounts ins" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_user_family(auth.uid()));
CREATE POLICY "manage own accounts upd" ON public.accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "manage own accounts del" ON public.accounts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- tags policies
CREATE POLICY "view family tags" ON public.tags FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "members create tags" ON public.tags FOR INSERT TO authenticated
  WITH CHECK (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "admins update tags" ON public.tags FOR UPDATE TO authenticated
  USING (public.is_family_admin(auth.uid(), family_id));
CREATE POLICY "admins delete tags" ON public.tags FOR DELETE TO authenticated
  USING (public.is_family_admin(auth.uid(), family_id) AND is_default = false);

-- transactions policies
CREATE POLICY "view family transactions" ON public.transactions FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "insert own transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_user_family(auth.uid()));
CREATE POLICY "update own transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "delete own transactions" ON public.transactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- loans policies
CREATE POLICY "view family loans" ON public.loans FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "insert own loans" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_user_family(auth.uid()));
CREATE POLICY "update own loans" ON public.loans FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "delete own loans" ON public.loans FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- loan_payments policies
CREATE POLICY "view family loan payments" ON public.loan_payments FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "insert own loan payments" ON public.loan_payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_user_family(auth.uid()));
CREATE POLICY "update own loan payments" ON public.loan_payments FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "delete own loan payments" ON public.loan_payments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- reminders policies
CREATE POLICY "view family reminders" ON public.reminders FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()));
CREATE POLICY "insert own reminders" ON public.reminders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND family_id = public.get_user_family(auth.uid()));
CREATE POLICY "update own reminders" ON public.reminders FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "delete own reminders" ON public.reminders FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: bootstrap a family with default tags + admin role + assign profile
CREATE OR REPLACE FUNCTION public.create_family_with_admin(_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _family_id UUID;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.families (name, created_by) VALUES (_name, _uid) RETURNING id INTO _family_id;

  UPDATE public.profiles SET family_id = _family_id, updated_at = now() WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, family_id, role) VALUES (_uid, _family_id, 'admin');

  INSERT INTO public.tags (family_id, name, color, icon, is_default) VALUES
    (_family_id, 'Food',     '#e76f51', 'UtensilsCrossed', true),
    (_family_id, 'Rent',     '#a98467', 'Home', true),
    (_family_id, 'Travel',   '#2a9d8f', 'Plane', true),
    (_family_id, 'Bills',    '#e9c46a', 'Receipt', true),
    (_family_id, 'Health',   '#ef476f', 'HeartPulse', true),
    (_family_id, 'Shopping', '#9d4edd', 'ShoppingBag', true),
    (_family_id, 'Salary',   '#06a77d', 'Wallet', true),
    (_family_id, 'Other',    '#6c757d', 'Tag', true);

  RETURN _family_id;
END;
$$;
