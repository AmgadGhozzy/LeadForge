-- Reassign all businesses and import sessions to the user's project
DO $$
DECLARE
  target_user_id uuid;
  target_project_id uuid;
BEGIN
  -- Get user ID for amgadghozzy@gmail.com
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'amgadghozzy@gmail.com' LIMIT 1;

  IF target_user_id IS NOT NULL THEN
    -- Ensure all unowned projects belong to this user
    UPDATE projects SET owner_id = target_user_id WHERE owner_id IS NULL;

    -- Get the main project for this user
    SELECT id INTO target_project_id FROM projects WHERE owner_id = target_user_id ORDER BY created_at ASC LIMIT 1;

    IF target_project_id IS NOT NULL THEN
      -- Reassign all existing businesses to this project
      UPDATE businesses SET project_id = target_project_id;
      
      -- Reassign all import sessions to this project
      UPDATE import_sessions SET project_id = target_project_id;
    END IF;
  END IF;
END $$;
