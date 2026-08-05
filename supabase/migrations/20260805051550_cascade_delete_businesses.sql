-- Clean up existing orphaned businesses
DELETE FROM businesses WHERE import_session_id IS NULL;

-- Change foreign key to ON DELETE CASCADE
ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_import_session_id_fkey;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_import_session_id_fkey 
  FOREIGN KEY (import_session_id) 
  REFERENCES import_sessions(id) 
  ON DELETE CASCADE;
