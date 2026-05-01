
CREATE TABLE public.family_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  email text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_invitations_token ON public.family_invitations(token);
CREATE INDEX idx_family_invitations_family ON public.family_invitations(family_id);

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view family invitations" ON public.family_invitations
  FOR SELECT TO authenticated
  USING (family_id = public.get_user_family(auth.uid()) OR accepted_by = auth.uid());

CREATE POLICY "lookup invitation by token" ON public.family_invitations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins create invitations" ON public.family_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_family_admin(auth.uid(), family_id) AND invited_by = auth.uid());

CREATE POLICY "admins delete invitations" ON public.family_invitations
  FOR DELETE TO authenticated
  USING (public.is_family_admin(auth.uid(), family_id));

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.family_invitations%ROWTYPE;
  _uid uuid := auth.uid();
  _existing_family uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _inv FROM public.family_invitations WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already used'; END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;

  SELECT family_id INTO _existing_family FROM public.profiles WHERE id = _uid;
  IF _existing_family IS NOT NULL AND _existing_family <> _inv.family_id THEN
    RAISE EXCEPTION 'You already belong to a family';
  END IF;

  UPDATE public.profiles SET family_id = _inv.family_id, updated_at = now() WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, family_id, role)
  VALUES (_uid, _inv.family_id, 'member')
  ON CONFLICT DO NOTHING;

  UPDATE public.family_invitations
    SET accepted_by = _uid, accepted_at = now()
    WHERE id = _inv.id;

  RETURN _inv.family_id;
END;
$$;
