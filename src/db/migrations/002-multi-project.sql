-- Migration 002: Multi-project support
-- Adds columns to the projects table for multi-tenant governance

-- GitHub App installation ID for auto-discovery
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_installation_id INTEGER;

-- Where this config was loaded from
ALTER TABLE projects ADD COLUMN IF NOT EXISTS config_source TEXT NOT NULL DEFAULT 'local';

-- When the config was last synced from the remote repo
ALTER TABLE projects ADD COLUMN IF NOT EXISTS config_synced_at TIMESTAMPTZ;

-- Cached philosophy and constitution content for remote projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS philosophy_content TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS constitution_content TEXT;

-- Encrypted API keys for per-project model access
ALTER TABLE projects ADD COLUMN IF NOT EXISTS anthropic_api_key_encrypted TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT;

-- Project status for lifecycle management
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Index for looking up projects by installation ID
CREATE INDEX IF NOT EXISTS projects_installation_idx ON projects(github_installation_id);

-- Index for looking up active projects
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
