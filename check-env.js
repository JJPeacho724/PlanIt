#!/usr/bin/env node

// Check environment variables for the chatbot
// Load .env file manually since dotenv might not be installed
const fs = require('fs');
const path = require('path');

try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const envLines = envFile.split('\n');
  envLines.forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  });
  console.log('✅ Loaded .env file');
} catch (error) {
  console.log('⚠️  Could not load .env file:', error.message);
}

console.log('=== Environment Check ===');
console.log('Raw environment variables:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'MISSING');
console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL ? 'SET' : 'MISSING');
console.log('NEXTAUTH_SECRET:', process.env.NEXTAUTH_SECRET ? 'SET' : 'MISSING');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
console.log('ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? 'SET' : 'MISSING');

console.log('\n=== OPENAI_API_KEY Details ===');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
console.log('OPENAI_API_KEY starts with sk-:', process.env.OPENAI_API_KEY?.startsWith('sk-') || false);

// Test the core env validation
console.log('\n=== Testing @acme/core env validation ===');
try {
  const { env } = require('@acme/core');
  console.log('✅ @acme/core env validation passed');
  console.log('OPENAI_API_KEY from env object:', !!env.OPENAI_API_KEY);
} catch (error) {
  console.log('❌ @acme/core env validation failed:');
  console.log(error.message);
  console.log('\nThis is likely the cause of your API errors!');
}

// Test if we can import the AI package
console.log('\n=== Testing @acme/ai package ===');
try {
  const { COMPREHENSIVE_PLANNING_KNOWLEDGE } = require('@acme/ai');
  console.log('✅ @acme/ai package imports successfully');
  console.log('COMPREHENSIVE_PLANNING_KNOWLEDGE available:', !!COMPREHENSIVE_PLANNING_KNOWLEDGE);
} catch (error) {
  console.log('❌ @acme/ai package import failed:');
  console.log(error.message);
}
