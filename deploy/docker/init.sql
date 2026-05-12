-- Quantum Portfolio Database Initialization
-- This script runs when the PostgreSQL container starts for the first time.

-- Create schema version tracking table
CREATE TABLE IF NOT EXISTS schema_version (
    id SERIAL PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Insert initial version
INSERT INTO schema_version (version, description)
VALUES ('1.0.0', 'Initial schema creation');

-- Optimization results cache (optional, for persisting results)
CREATE TABLE IF NOT EXISTS optimization_results (
    id SERIAL PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL UNIQUE,
    tickers TEXT[] NOT NULL,
    start_date DATE,
    end_date DATE,
    objective VARCHAR(50),
    result JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_optimization_results_hash ON optimization_results(request_hash);
CREATE INDEX IF NOT EXISTS idx_optimization_results_expires ON optimization_results(expires_at);

-- Audit log for compliance
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    endpoint VARCHAR(200),
    request_id VARCHAR(36),
    client_ip VARCHAR(45),
    payload JSONB,
    response_status INTEGER,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Multi-tenant API keys and usage tracking
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    tenant_id VARCHAR(100) NOT NULL,
    key_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
