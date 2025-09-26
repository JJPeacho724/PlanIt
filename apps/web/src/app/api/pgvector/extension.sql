-- Run this once on your PostgreSQL database to enable pgvector for semantic search
-- This enables vector similarity search for the Personalized Planner

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Uncomment these lines after enabling the extension to add embedding columns:

-- ALTER TABLE "SemanticChunk" ADD COLUMN embedding vector(1536);
-- CREATE INDEX ON "SemanticChunk" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ALTER TABLE "Task" ADD COLUMN embedding vector(1536);  
-- CREATE INDEX ON "Task" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Note: Run these ALTER TABLE commands manually after confirming pgvector is working
-- The indexes will significantly improve semantic search performance

