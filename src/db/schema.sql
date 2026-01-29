-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repository TEXT NOT NULL,
    constitution_path TEXT NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Decisions table with pgvector embeddings
CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    decision_number INTEGER NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('adopted', 'superseded', 'reversed')),
    decision_maker TEXT NOT NULL,
    
    -- Content
    decision TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    considerations TEXT,
    uncertainties TEXT,
    reversibility TEXT,
    would_change_if TEXT,
    
    -- Metadata
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    related_decisions TEXT[],
    tags TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(project_id, decision_number)
);

-- Index for semantic search
CREATE INDEX IF NOT EXISTS decisions_embedding_idx ON decisions 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for project lookups
CREATE INDEX IF NOT EXISTS decisions_project_idx ON decisions(project_id);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL REFERENCES decisions(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    
    -- Challenge content
    argument TEXT NOT NULL,
    evidence TEXT,
    
    -- Response
    responded_by TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    response TEXT,
    outcome TEXT,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS challenges_decision_idx ON challenges(decision_id);
CREATE INDEX IF NOT EXISTS challenges_project_idx ON challenges(project_id);
CREATE INDEX IF NOT EXISTS challenges_status_idx ON challenges(status);

-- Sessions table for tracking agent sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    role TEXT NOT NULL,
    request JSONB NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'blocked')),
    
    -- Tracking
    tool_uses JSONB DEFAULT '[]'::jsonb,
    decisions_logged TEXT[],
    escalations TEXT[]
);

CREATE INDEX IF NOT EXISTS sessions_project_idx ON sessions(project_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions(status);

-- Audit log for full traceability
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id TEXT REFERENCES projects(id),
    session_id TEXT REFERENCES sessions(id),
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    trust_level TEXT
);

CREATE INDEX IF NOT EXISTS audit_log_project_idx ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS audit_log_session_idx ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp);

-- Wiki drafts for approval workflow
CREATE TABLE IF NOT EXISTS wiki_drafts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL CHECK (type IN ('new_page', 'edit_page')),
    page_path TEXT NOT NULL,
    proposed_content TEXT NOT NULL,
    original_content TEXT,
    proposed_by TEXT NOT NULL,
    proposed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edit_summary TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    feedback TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wiki_drafts_project_idx ON wiki_drafts(project_id);
CREATE INDEX IF NOT EXISTS wiki_drafts_status_idx ON wiki_drafts(status);
CREATE INDEX IF NOT EXISTS wiki_drafts_page_idx ON wiki_drafts(project_id, page_path);

-- Wiki metadata cache for search optimization
CREATE TABLE IF NOT EXISTS wiki_metadata (
    id SERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    page_path TEXT NOT NULL,
    title TEXT NOT NULL,
    last_modified TIMESTAMP WITH TIME ZONE NOT NULL,
    modified_by TEXT NOT NULL,
    summary TEXT,
    content_hash TEXT,
    
    -- For search
    content_tsvector tsvector,
    
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(project_id, page_path)
);

CREATE INDEX IF NOT EXISTS wiki_metadata_project_idx ON wiki_metadata(project_id);
CREATE INDEX IF NOT EXISTS wiki_metadata_search_idx ON wiki_metadata USING GIN(content_tsvector);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_challenges_updated_at BEFORE UPDATE ON challenges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wiki_drafts_updated_at BEFORE UPDATE ON wiki_drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
