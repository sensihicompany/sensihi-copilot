-- ============================================================
-- Step 4: Enable vector search and RPC for Sensihi Copilot
-- Run this entire file once in Supabase → SQL Editor → New query
-- ============================================================

-- 1. Enable the pgvector extension (lets Supabase store and search vectors)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create a table to store your website content + its embedding (numbers that represent meaning)
--    The copilot will search this table to answer questions from sensihi.com content.
CREATE TABLE IF NOT EXISTS sensihi_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536),   -- OpenAI text-embedding-3-small produces 1536 numbers
  metadata jsonb,           -- optional: e.g. { "url": "/solutions", "title": "Solutions" }
  created_at timestamptz DEFAULT now()
);

-- 3. Create the RPC (function) that the copilot code calls: "match_sensihi_documents"
--    It finds rows whose embedding is most similar to the user's question.
CREATE OR REPLACE FUNCTION match_sensihi_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM sensihi_documents
  WHERE embedding IS NOT NULL
    AND (1 - (embedding <=> query_embedding)) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Optional: allow the backend (service_role) to read; RLS can be added later if needed.
-- By default the table is accessible with service_role key you use in the API.
