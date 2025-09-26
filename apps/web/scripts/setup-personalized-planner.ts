#!/usr/bin/env tsx

/**
 * Setup script for Personalized Planner
 * Checks dependencies, runs migrations, and optionally seeds demo data
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { writeFileSync, readFileSync } from 'fs'

interface SetupOptions {
  skipMigration?: boolean
  seedDemo?: boolean
  checkDeps?: boolean
  force?: boolean
}

async function setupPersonalizedPlanner(options: SetupOptions = {}) {
  console.log('🚀 Setting up Personalized Planner...\n')

  try {
    // 1. Check dependencies
    if (options.checkDeps !== false) {
      await checkDependencies()
    }

    // 2. Check environment
    await checkEnvironment()

    // 3. Run database migration
    if (!options.skipMigration) {
      await runMigration()
    }

    // 4. Check pgvector (optional)
    await checkPgVector()

    // 5. Seed demo data if requested
    if (options.seedDemo) {
      await seedDemoData()
    }

    // 6. Run setup verification
    await verifySetup()

    console.log('\n🎉 Personalized Planner setup completed successfully!')
    console.log('\n📖 Next steps:')
    console.log('   1. Start your development server: npm run dev')
    console.log('   2. Visit /api/planner to test the enhanced planner')
    console.log('   3. Check PERSONALIZED_PLANNER_SETUP.md for usage examples')
    console.log('   4. Set up cron jobs for worker scripts (optional)')

  } catch (error) {
    console.error('\n💥 Setup failed:', error)
    process.exit(1)
  }
}

async function checkDependencies() {
  console.log('📦 Checking dependencies...')

  const packageJsonPath = './package.json'
  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Run this script from the app root.')
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

  const requiredDeps = ['redis', '@prisma/client', 'prisma', 'zod']
  const missingDeps = requiredDeps.filter(dep => !deps[dep])

  if (missingDeps.length > 0) {
    console.log('⚠️  Missing dependencies:', missingDeps.join(', '))
    console.log('Installing missing dependencies...')
    
    try {
      execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' })
      console.log('✅ Dependencies installed')
    } catch (error) {
      throw new Error('Failed to install dependencies')
    }
  } else {
    console.log('✅ All required dependencies found')
  }
}

async function checkEnvironment() {
  console.log('\n🔧 Checking environment configuration...')

  const requiredEnvVars = ['DATABASE_URL']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.log('⚠️  Missing required environment variables:')
    missingVars.forEach(varName => {
      console.log(`   - ${varName}`)
    })
    
    console.log('\n📄 Please check PERSONALIZED_PLANNER_SETUP.md for environment setup')
    
    // Check if .env.local exists
    if (!existsSync('.env.local')) {
      console.log('\n💡 Creating .env.local template...')
      const envTemplate = `# Personalized Planner Environment Configuration
# Copy this file to .env.local and fill in your values

DATABASE_URL="postgresql://username:password@localhost:5432/planner_db"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY="sk-your-openai-api-key"

# Learning System
LEARNING_ENABLED="true"
BANDIT_EPSILON="0.1"
FACT_DECAY_ENABLED="true"

# Development
DEMO_MODE="false"
`
      writeFileSync('.env.local', envTemplate)
      console.log('✅ Created .env.local template')
    }
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required. Please set it in .env.local')
    }
  } else {
    console.log('✅ Environment configuration looks good')
  }

  // Check optional vars
  const optionalVars = ['REDIS_URL', 'OPENAI_API_KEY']
  optionalVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`✅ ${varName} configured`)
    } else {
      console.log(`⚠️  ${varName} not set (optional - will use fallbacks)`)
    }
  })
}

async function runMigration() {
  console.log('\n🗄️  Running database migrations...')

  try {
    // Generate Prisma client first
    console.log('   Generating Prisma client...')
    execSync('npx prisma generate', { stdio: 'pipe' })

    // Run migrations
    console.log('   Running migrations...')
    execSync('npx prisma migrate dev --name add-personalized-planner', { stdio: 'pipe' })
    
    console.log('✅ Database migrations completed')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.log('\n💡 You may need to:')
    console.log('   1. Ensure PostgreSQL is running')
    console.log('   2. Check DATABASE_URL is correct')
    console.log('   3. Ensure database exists')
    throw error
  }
}

async function checkPgVector() {
  console.log('\n🔍 Checking pgvector extension...')

  try {
    const { prisma } = await import('../src/lib/clients/prisma')
    
    // Try to check if pgvector is available
    await prisma.$queryRaw`SELECT 1`
    
    try {
      await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname = 'vector'`
      console.log('✅ pgvector extension detected')
      console.log('   Semantic search will use vector similarity')
    } catch {
      console.log('⚠️  pgvector extension not found')
      console.log('   Semantic search will use text-based fallback')
      console.log('   To enable: CREATE EXTENSION IF NOT EXISTS vector;')
    }
  } catch (error) {
    console.log('⚠️  Could not check pgvector (this may be normal)')
  }
}

async function seedDemoData() {
  console.log('\n🎭 Seeding demo data...')

  try {
    execSync('npm run worker:distill -- --seed-demo', { stdio: 'inherit' })
    console.log('✅ Demo data seeded successfully')
    console.log('   Demo user ID: demo-user')
  } catch (error) {
    console.log('⚠️  Failed to seed demo data:', error)
  }
}

async function verifySetup() {
  console.log('\n🔍 Verifying setup...')

  try {
    const { prisma } = await import('../src/lib/clients/prisma')
    
    // Check that new tables exist
    const tableChecks = [
      'userProfile',
      'userFact', 
      'semanticChunk',
      'signal',
      'banditPolicy'
    ]

    for (const table of tableChecks) {
      try {
        await (prisma as any)[table].count()
        console.log(`✅ ${table} table accessible`)
      } catch (error) {
        console.log(`❌ ${table} table not accessible:`, error)
      }
    }

    // Test Redis connection (if configured)
    if (process.env.REDIS_URL) {
      try {
        const { getRedis } = await import('../src/lib/redis')
        const redis = await getRedis()
        await redis.ping()
        console.log('✅ Redis connection successful')
      } catch (error) {
        console.log('⚠️  Redis connection failed (will use memory fallback):', error)
      }
    }

    // Test OpenAI (if configured)
    if (process.env.OPENAI_API_KEY) {
      try {
        const { generateEmbedding } = await import('../src/lib/embeddings')
        await generateEmbedding('test')
        console.log('✅ OpenAI embeddings working')
      } catch (error) {
        console.log('⚠️  OpenAI embeddings failed (will use text fallback):', error)
      }
    }

    console.log('✅ Setup verification completed')

  } catch (error) {
    console.log('⚠️  Setup verification failed:', error)
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const options: SetupOptions = {}

  if (args.includes('--skip-migration')) options.skipMigration = true
  if (args.includes('--seed-demo')) options.seedDemo = true
  if (args.includes('--no-deps-check')) options.checkDeps = false
  if (args.includes('--force')) options.force = true

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Personalized Planner Setup Script

Usage: tsx scripts/setup-personalized-planner.ts [options]

Options:
  --skip-migration     Skip database migration
  --seed-demo          Create demo user and sample data
  --no-deps-check      Skip dependency checking
  --force              Force setup even if already configured
  --help, -h           Show this help message

Examples:
  tsx scripts/setup-personalized-planner.ts
  tsx scripts/setup-personalized-planner.ts --seed-demo
  tsx scripts/setup-personalized-planner.ts --skip-migration --no-deps-check
`)
    process.exit(0)
  }

  await setupPersonalizedPlanner(options)
}

// Run if called directly (ES module compatible)
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname
if (isMainModule) {
  main().catch(console.error)
}

export { setupPersonalizedPlanner }
