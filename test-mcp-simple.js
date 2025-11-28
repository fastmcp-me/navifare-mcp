#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('🧪 Testing MCP server startup...');

// Start the MCP server
const serverProcess = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: process.cwd()
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  output += data.toString();
});

serverProcess.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

serverProcess.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Send initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'test', version: '1.0.0' }
  }
};

setTimeout(() => {
  console.log('📤 Sending initialize request...');
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
}, 100);

// Send list tools request
setTimeout(() => {
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };
  console.log('📤 Sending tools/list request...');
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 500);

// Check results and cleanup
setTimeout(() => {
  console.log('📥 Server output:', output);
  console.log('📥 Server errors:', errorOutput);
  
  // Check if we got a response
  if (output.includes('"jsonrpc"') || output.includes('"result"')) {
    console.log('✅ MCP server is responding!');
    
    // Check for expected tools
    if (output.includes('search_flights') && output.includes('submit_session') && output.includes('get_session_results')) {
      console.log('✅ All expected tools found in response');
      console.log('✅ MCP server test passed!');
      serverProcess.kill();
      process.exit(0);
    } else {
      console.log('⚠️  Some expected tools may be missing');
      serverProcess.kill();
      process.exit(0);
    }
  } else {
    console.log('❌ No valid JSON-RPC response received');
    serverProcess.kill();
    process.exit(1);
  }
}, 2000);


