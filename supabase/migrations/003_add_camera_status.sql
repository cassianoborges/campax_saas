-- ============================================
-- ADD CAMERA STATUS FIELD
-- Migration: 003_add_camera_status
-- Description: Adds status field to cameras table for online/offline tracking
-- ============================================

-- Add status column to cameras table
ALTER TABLE cameras 
ADD COLUMN status VARCHAR(20) DEFAULT 'unknown';

-- Add index for status queries
CREATE INDEX idx_cameras_status ON cameras(status);

-- Add comment
COMMENT ON COLUMN cameras.status IS 'Status da câmera: online, offline, ou unknown';

-- Update existing cameras to unknown status
UPDATE cameras SET status = 'unknown' WHERE status IS NULL;
