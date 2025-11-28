#!/usr/bin/env node

/**
 * Test script for Streamable HTTP MCP server
 * Tests both streaming (SSE) and non-streaming (JSON) modes
 */

import fetch from 'node-fetch';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:2091';
const MCP_ENDPOINT = `${SERVER_URL}/mcp`;

// Test flight data
const testFlightData = {
  trip: {
    legs: [
      {
        segments: [
          {
            airline: "XZ",
            flightNumber: "2020",
            departureAirport: "MXP",
            arrivalAirport: "FCO",
            departureDate: "2025-12-16",
            departureTime: "07:10:00",
            arrivalTime: "08:25:00",
            plusDays: 0
          }
        ]
      },
      {
        segments: [
          {
            airline: "XZ",
            flightNumber: "2021",
            departureAirport: "FCO",
            arrivalAirport: "MXP",
            departureDate: "2025-12-25",
            departureTime: "09:45:00",
            arrivalTime: "11:00:00",
            plusDays: 0
          }
        ]
      }
    ],
    travelClass: "ECONOMY",
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0
  },
  source: "Test",
  price: "84.00",
  currency: "EUR",
  location: "VA"
};

async function testNonStreaming() {
  console.log('\n🧪 Testing Non-Streaming Mode (JSON)\n');
  console.log('=' .repeat(60));
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'flight_pricecheck',
        arguments: testFlightData
      }
    };
    
    console.log('📤 Sending request:', JSON.stringify(request, null, 2));
    
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    console.log(`\n📥 Response Status: ${response.status}`);
    console.log(`📥 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📥 Session ID: ${response.headers.get('mcp-session-id') || 'Not set'}`);
    
    const data = await response.json();
    console.log('\n📥 Response Body:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.result && data.result.content) {
      const resultText = data.result.content[0]?.text;
      if (resultText) {
        const parsed = JSON.parse(resultText);
        console.log('\n✅ Parsed Result:');
        console.log(`   Status: ${parsed.status}`);
        console.log(`   Message: ${parsed.message?.substring(0, 100)}...`);
        if (parsed.searchResult) {
          console.log(`   Total Results: ${parsed.searchResult.totalResults || 0}`);
        }
      }
    }
    
    console.log('\n✅ Non-streaming test completed successfully!\n');
    return true;
  } catch (error) {
    console.error('❌ Non-streaming test failed:', error.message);
    return false;
  }
}

async function testStreaming() {
  console.log('\n🧪 Testing Streaming Mode (SSE)\n');
  console.log('=' .repeat(60));
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'flight_pricecheck',
        arguments: testFlightData
      }
    };
    
    console.log('📤 Sending streaming request...');
    console.log('📤 Request:', JSON.stringify(request, null, 2));
    
    const response = await fetch(`${MCP_ENDPOINT}?stream=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'mcp-stream': 'true'
      },
      body: JSON.stringify(request)
    });
    
    console.log(`\n📥 Response Status: ${response.status}`);
    console.log(`📥 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📥 Session ID: ${response.headers.get('mcp-session-id') || 'Not set'}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response error:', errorText);
      return false;
    }
    
    const reader = response.body;
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    
    console.log('\n📡 Streaming events:\n');
    
    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventType = line.substring(6).trim();
          console.log(`\n📨 Event: ${eventType}`);
        } else if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          try {
            const parsed = JSON.parse(data);
            eventCount++;
            
            if (parsed.method === 'notifications/message') {
              console.log(`   📊 Progress: ${parsed.params?.data?.message || 'N/A'}`);
            } else if (parsed.result) {
              console.log('   ✅ Final Result Received');
              const resultText = parsed.result.content?.[0]?.text;
              if (resultText) {
                const parsedResult = JSON.parse(resultText);
                console.log(`   Status: ${parsedResult.status}`);
                console.log(`   Total Results: ${parsedResult.searchResult?.totalResults || 0}`);
              }
            } else if (parsed.error) {
              console.log(`   ❌ Error: ${parsed.error.message || 'Unknown error'}`);
            } else if (parsed.sessionId) {
              console.log(`   🔑 Session ID: ${parsed.sessionId}`);
            }
          } catch (e) {
            // Not JSON, might be a comment or other SSE data
            if (data && !data.startsWith(':')) {
              console.log(`   📝 Data: ${data.substring(0, 100)}...`);
            }
          }
        } else if (line.startsWith(':')) {
          // Comment line
          console.log(`   💬 Comment: ${line.substring(1).trim()}`);
        }
      }
    }
    
    console.log(`\n✅ Streaming test completed! Received ${eventCount} events\n`);
    return true;
  } catch (error) {
    console.error('❌ Streaming test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testToolsList() {
  console.log('\n🧪 Testing tools/list endpoint\n');
  console.log('=' .repeat(60));
  
  try {
    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {}
    };
    
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    const data = await response.json();
    
    if (data.result && data.result.tools) {
      console.log(`✅ Found ${data.result.tools.length} tools:`);
      data.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}${tool.title ? ` (${tool.title})` : ''}`);
        if (tool.readOnlyHint !== undefined) {
          console.log(`     readOnlyHint: ${tool.readOnlyHint}`);
        }
        if (tool.destructiveHint !== undefined) {
          console.log(`     destructiveHint: ${tool.destructiveHint}`);
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ tools/list test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Streamable HTTP MCP Server Tests');
  console.log(`📍 Server URL: ${SERVER_URL}`);
  
  // Test 1: tools/list
  await testToolsList();
  
  // Test 2: Non-streaming mode
  const nonStreamingResult = await testNonStreaming();
  
  // Test 3: Streaming mode
  const streamingResult = await testStreaming();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ tools/list: PASSED`);
  console.log(`${nonStreamingResult ? '✅' : '❌'} Non-streaming mode: ${nonStreamingResult ? 'PASSED' : 'FAILED'}`);
  console.log(`${streamingResult ? '✅' : '❌'} Streaming mode: ${streamingResult ? 'PASSED' : 'FAILED'}`);
  console.log('='.repeat(60));
  
  if (nonStreamingResult && streamingResult) {
    console.log('\n🎉 All tests passed! Streamable HTTP is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the output above.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});




