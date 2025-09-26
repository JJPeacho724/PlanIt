-- Personalized Planner Learning Tables
-- Run this SQL script to manually create the learning tables

-- 1. UserProfile table
CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- Create unique index for UserProfile
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");

-- 2. UserFact table
CREATE TABLE IF NOT EXISTS "UserFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT,
    "halfLifeDays" INTEGER NOT NULL DEFAULT 30,
    "lastValidated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFact_pkey" PRIMARY KEY ("id")
);

-- Create indexes for UserFact
CREATE UNIQUE INDEX IF NOT EXISTS "UserFact_userId_factType_key_key" ON "UserFact"("userId", "factType", "key");
CREATE INDEX IF NOT EXISTS "UserFact_userId_confidence_idx" ON "UserFact"("userId", "confidence");

-- 3. SemanticChunk table
CREATE TABLE IF NOT EXISTS "SemanticChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "chunkType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticChunk_pkey" PRIMARY KEY ("id")
);

-- Create index for SemanticChunk
CREATE INDEX IF NOT EXISTS "SemanticChunk_userId_chunkType_idx" ON "SemanticChunk"("userId", "chunkType");

-- 4. Signal table
CREATE TABLE IF NOT EXISTS "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "delta" DOUBLE PRECISION,
    "banditKey" TEXT,
    "success" BOOLEAN,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Signal
CREATE INDEX IF NOT EXISTS "Signal_userId_key_idx" ON "Signal"("userId", "key");
CREATE INDEX IF NOT EXISTS "Signal_userId_banditKey_idx" ON "Signal"("userId", "banditKey");

-- 5. BanditPolicy table
CREATE TABLE IF NOT EXISTS "BanditPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "banditKey" TEXT NOT NULL,
    "armName" TEXT NOT NULL,
    "pulls" INTEGER NOT NULL DEFAULT 0,
    "rewards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BanditPolicy_pkey" PRIMARY KEY ("id")
);

-- Create indexes for BanditPolicy
CREATE UNIQUE INDEX IF NOT EXISTS "BanditPolicy_userId_banditKey_armName_key" ON "BanditPolicy"("userId", "banditKey", "armName");
CREATE INDEX IF NOT EXISTS "BanditPolicy_userId_banditKey_idx" ON "BanditPolicy"("userId", "banditKey");

-- Add foreign key constraints (if User table exists)
DO $$ 
BEGIN
    -- Check if User table exists before adding foreign keys
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'User') THEN
        -- Add foreign key constraints
        ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        
        ALTER TABLE "UserFact" ADD CONSTRAINT "UserFact_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        
        ALTER TABLE "SemanticChunk" ADD CONSTRAINT "SemanticChunk_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        
        ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        
        ALTER TABLE "BanditPolicy" ADD CONSTRAINT "BanditPolicy_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION 
    WHEN duplicate_object THEN 
        -- Constraints already exist, do nothing
        NULL;
END $$;

-- Insert a demo user for testing (if not exists)
INSERT INTO "User" ("id", "email", "name", "profile", "createdAt", "updatedAt")
VALUES (
    'demo-user', 
    'demo@example.com', 
    'Demo User',
    '{"demo": true}',
    NOW(),
    NOW()
)
ON CONFLICT ("email") DO NOTHING;

-- Create demo user profile
INSERT INTO "UserProfile" ("id", "userId", "profileJson", "createdAt", "updatedAt")
VALUES (
    'profile-demo-user',
    'demo-user',
    '{
        "goals": ["Ship APM apps", "Workout 5x/week", "Learn new technologies"],
        "constraints": {
            "work_hours": "9-18",
            "no_meetings_before": "10:00",
            "lunch_break": "12:00-13:00"
        },
        "preferences": {
            "planning_style": "time_blocking",
            "break_duration": "15min",
            "deep_work_blocks": "90min",
            "energy_pattern": "morning_person"
        }
    }',
    NOW(),
    NOW()
)
ON CONFLICT ("userId") DO UPDATE SET
    "profileJson" = EXCLUDED."profileJson",
    "updatedAt" = NOW();

-- Insert some demo facts
INSERT INTO "UserFact" ("id", "userId", "factType", "key", "value", "confidence", "source", "createdAt", "updatedAt")
VALUES 
    ('fact-1', 'demo-user', 'preference', 'work_hours', '9-18', 0.9, 'demo', NOW(), NOW()),
    ('fact-2', 'demo-user', 'preference', 'break_duration', '15min', 0.8, 'demo', NOW(), NOW()),
    ('fact-3', 'demo-user', 'pattern', 'energy_peak', 'morning', 0.7, 'demo', NOW(), NOW()),
    ('fact-4', 'demo-user', 'constraint', 'no_meetings_before', '10:00', 0.9, 'demo', NOW(), NOW())
ON CONFLICT ("userId", "factType", "key") DO UPDATE SET
    "value" = EXCLUDED."value",
    "confidence" = EXCLUDED."confidence",
    "updatedAt" = NOW();

-- Create default bandit policies for demo user
INSERT INTO "BanditPolicy" ("id", "userId", "banditKey", "armName", "pulls", "rewards", "createdAt", "updatedAt")
VALUES 
    ('bandit-1', 'demo-user', 'planner:variant', 'A', 0, 0, NOW(), NOW()),
    ('bandit-2', 'demo-user', 'planner:variant', 'B', 0, 0, NOW(), NOW()),
    ('bandit-3', 'demo-user', 'planner:variant', 'C', 0, 0, NOW(), NOW())
ON CONFLICT ("userId", "banditKey", "armName") DO NOTHING;

-- Show created tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t 
WHERE table_name IN ('UserProfile', 'UserFact', 'SemanticChunk', 'Signal', 'BanditPolicy')
ORDER BY table_name;

-- Show demo data
SELECT 'Demo User Created' as status, id, email, name FROM "User" WHERE id = 'demo-user';
SELECT 'Facts Created' as status, COUNT(*) as count FROM "UserFact" WHERE "userId" = 'demo-user';
SELECT 'Profile Created' as status, COUNT(*) as count FROM "UserProfile" WHERE "userId" = 'demo-user';
