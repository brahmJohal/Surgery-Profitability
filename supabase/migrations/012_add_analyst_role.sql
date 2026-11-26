-- Add a dedicated role without granting access to finance or administration.
alter type public.user_role add value if not exists 'analyst';
