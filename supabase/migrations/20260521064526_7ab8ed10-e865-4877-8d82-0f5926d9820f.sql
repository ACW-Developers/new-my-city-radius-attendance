
-- Admins can insert/update any profile (needed for backup import upserts)
CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Make sure admin role management has WITH CHECK
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Admins can insert activity logs (for backup import)
CREATE POLICY "Admins can insert activity logs"
ON public.activity_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));
