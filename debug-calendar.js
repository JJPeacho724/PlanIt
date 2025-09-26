#!/usr/bin/env node

/**
 * Debug script for calendar integration issues
 * Run this to test authentication and task creation
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 Debug Calendar Integration Issues\n');

// Check if the development server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      console.log('✅ Development server is running');
      return true;
    }
  } catch (error) {
    console.log('❌ Development server not running');
    return false;
  }
}

// Test authentication endpoint
async function testAuth() {
  try {
    const response = await fetch('http://localhost:3000/api/auth/session');
    const session = await response.json();
    
    if (session?.user?.email) {
      console.log('✅ User authenticated:', session.user.email);
      return session;
    } else {
      console.log('❌ No authenticated user found');
      return null;
    }
  } catch (error) {
    console.log('❌ Auth check failed:', error.message);
    return null;
  }
}

// Test task creation
async function testTaskCreation() {
  try {
    const response = await fetch('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Debug Test Task',
        description: 'This is a test task created by the debug script',
        priority: 1,
        effortMinutes: 30
      })
    });
    
    if (response.ok) {
      const task = await response.json();
      console.log('✅ Task creation successful:', task.title);
      return task;
    } else {
      console.log('❌ Task creation failed:', response.status);
      return null;
    }
  } catch (error) {
    console.log('❌ Task creation error:', error.message);
    return null;
  }
}

// Test event generation
async function testEventGeneration() {
  try {
    const response = await fetch('http://localhost:3000/api/events/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeGoogleData: true,
        preferences: {
          breakMinutes: 15,
          minBlockMinutes: 30,
          resolveConflicts: 'push'
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Event generation successful:', data.eventDrafts?.length || 0, 'events created');
      return data;
    } else {
      const error = await response.text();
      console.log('❌ Event generation failed:', response.status, error);
      return null;
    }
  } catch (error) {
    console.log('❌ Event generation error:', error.message);
    return null;
  }
}

// Main debug function
async function main() {
  console.log('Step 1: Checking development server...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('\n🚨 Please start the development server first:');
    console.log('   cd apps/web && npm run dev');
    return;
  }
  
  console.log('\nStep 2: Checking authentication...');
  const session = await testAuth();
  
  if (!session) {
    console.log('\n🚨 Please sign in to the application:');
    console.log('   1. Go to http://localhost:3000');
    console.log('   2. Click "Sign In" button');
    console.log('   3. Sign in with Google');
    return;
  }
  
  console.log('\nStep 3: Testing task creation...');
  const task = await testTaskCreation();
  
  console.log('\nStep 4: Testing event generation...');
  const events = await testEventGeneration();
  
  console.log('\n📋 Debug Summary:');
  console.log('- Server:', serverRunning ? '✅ Running' : '❌ Not running');
  console.log('- Auth:', session ? '✅ Authenticated' : '❌ Not authenticated');
  console.log('- Tasks:', task ? '✅ Working' : '❌ Failed');
  console.log('- Events:', events ? '✅ Working' : '❌ Failed');
  
  if (serverRunning && session && task && events) {
    console.log('\n🎉 Everything looks good! The sparkly button should work now.');
  } else {
    console.log('\n🔧 Issues found. Please check the logs above and fix any problems.');
  }
}

// Make fetch available in Node.js
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

main().catch(console.error);
