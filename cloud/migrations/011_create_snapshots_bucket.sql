-- Create project-snapshots storage bucket for file metadata
-- This stores gzip-compressed JSON files with file metadata

-- Create bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, owner, public)
VALUES ('project-snapshots', 'project-snapshots', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on project-snapshots bucket
CREATE POLICY "Authenticated users can read project snapshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-snapshots' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Project members can list their snapshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-snapshots' AND
    (storage.foldername(name))[1] IN (
      SELECT CAST(p.id AS text)
      FROM projects p
      WHERE p.owner_id = auth.uid()::uuid OR
            p.id IN (
              SELECT project_id FROM project_members
              WHERE user_id = auth.uid()::uuid AND status = 'accepted'
            )
    )
  );
