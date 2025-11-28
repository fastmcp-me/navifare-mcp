#!/usr/bin/env node

import { spawn } from 'child_process';
import { createClient } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCP() {
  console.log('🧪 Testing MCP server (quick test)...');
  
  // Start the MCP server
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  // Create MCP client
  const client = createClient({
    name: "test-client",
    version: "1.0.0"
  }, {
    reader: serverProcess.stdout,
    writer: serverProcess.stdin
  });

  try {
    // Connect to server
    await client.connect();
    console.log('✅ Connected to MCP server');

    // List available tools
    const tools = await client.listTools();
    console.log('✅ Available tools:', tools.tools.map(t => t.name));
    
    // Verify expected tools exist
    const toolNames = tools.tools.map(t => t.name);
    const expectedTools = ['search_flights', 'submit_session', 'get_session_results'];
    const missingTools = expectedTools.filter(t => !toolNames.includes(t));
    
    if (missingTools.length === 0) {
      console.log('✅ All expected tools are present');
    } else {
      console.log('❌ Missing tools:', missingTools);
      process.exit(1);
    }
    
    console.log('✅ MCP server test passed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    serverProcess.kill();
    await client.close();
    process.exit(0);
  }
}

testMCP().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});


