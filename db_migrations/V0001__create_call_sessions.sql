CREATE TABLE IF NOT EXISTS call_sessions (
    id VARCHAR(12) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    offer_sdp TEXT,
    answer_sdp TEXT,
    offer_ice JSONB DEFAULT '[]',
    answer_ice JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'waiting',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created ON call_sessions(created_at);
