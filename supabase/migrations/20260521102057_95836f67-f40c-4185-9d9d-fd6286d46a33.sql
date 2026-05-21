-- Create admin user directly in auth.users
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Skip if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@mycityradiusattendance.com') THEN
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'admin@mycityradiusattendance.com',
    crypt('admin123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin"}',
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'admin@mycityradiusattendance.com', 'email_verified', true),
    'email',
    new_user_id::text,
    now(), now(), now()
  );

  -- Ensure profile exists (trigger should create it, but be safe)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (new_user_id, 'Admin', 'admin@mycityradiusattendance.com')
  ON CONFLICT DO NOTHING;

  -- Ensure admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;