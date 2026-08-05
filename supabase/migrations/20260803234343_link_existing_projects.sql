-- Migration 20260803234343 placeholder
UPDATE projects
SET owner_id = (SELECT id FROM auth.users WHERE email = 'amgadghozzy@gmail.com' LIMIT 1)
WHERE owner_id IS NULL;
