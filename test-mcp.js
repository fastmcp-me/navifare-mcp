#!/usr/bin/env node

import { spawn } from 'child_process';
import { createClient } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCP() {
  console.log('Testing MCP server...');
  
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
    console.log('📋 Available tools:', tools.tools.map(t => t.name));

    // Test submit_session tool
    const testData = {
      trip: {
        legs: [{
          segments: [{
            airline: "LX",
            flightNumber: "138",
            departureAirport: "ZRH",
            arrivalAirport: "HKG",
            departureDate: "2025-07-25",
            departureTime: "22:40:00",
            arrivalTime: "16:40:00",
            plusDays: 1
          }]
        }],
        travelClass: "BUSINESS",
        adults: 2,
        children: 1,
        infantsInSeat: 0,
        infantsOnLap: 0
      },
      source: "KAYAK",
      price: "456.78",
      currency: "CHF"
    };

    console.log('🚀 Testing submit_session...');
    const result = await client.callTool({
      name: "submit_session",
      arguments: testData
    });
    
    console.log('✅ submit_session result:', result);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    serverProcess.kill();
    await client.close();
  }
}

testMCP().catch(console.error);


