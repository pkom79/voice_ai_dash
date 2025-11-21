-- Delete specific users from auth.users (cascades to public.users)
DELETE FROM auth.users 
WHERE email IN ('pkom79@gmail.com', 'pkom.biz@gmail.com');
