-- Enable pgcrypto in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Set password to 'Password123!' and ensure email is confirmed
UPDATE auth.users
SET encrypted_password = extensions.crypt('Password123!', extensions.gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'amgadghozzy@gmail.com';
