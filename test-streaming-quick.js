#!/usr/bin/env node

/**
 * Quick streaming test for flight_pricecheck
 */

import fetch from 'node-fetch';

const testData = {
  trip: {
    legs: [{
      segments: [{
        airline: 'XZ',
        flightNumber: '2020',
        departureAirport: 'MXP',
        arrivalAirport: 'FCO',
        departureDate: '2025-12-16',
        departureTime: '07:10:00',
        arrivalTime: '08:25:00',
        plusDays: 0
      }]
    }],
    travelClass: 'ECONOMY',
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0
  },
  source: 'Test',
  price: '84.00',
  currency: 'EUR',
  location: 'VA'
};

async function testStreaming() {
  console.log('🧪 Testing SSE Streaming for flight_pricecheck\n');
  
  try {
    const response = await fetch('http://localhost:2091/mcp?stream=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'mcp-stream': 'true'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'flight_pricecheck',
          arguments: testData
        }
      })
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log(`Session ID: ${response.headers.get('mcp-session-id')}`);
    console.log('\n📡 Streaming events:\n');
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Error:', text);
      return;
    }
    
    const reader = response.body;
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    const maxEvents = 10;
    
    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventType = line.substring(6).trim();
          console.log(`\n📨 [${++eventCount}] Event: ${eventType}`);
        } else if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          try {
            const parsed = JSON.parse(data);
            if (parsed.method === 'notifications/message') {
              console.log(`   📊 Progress: ${parsed.params?.data?.message || 'N/A'}`);
            } else if (parsed.result) {
              console.log('   ✅ Final Result');
              const resultText = parsed.result.content?.[0]?.text;
              if (resultText) {
                const parsedResult = JSON.parse(resultText);
                console.log(`      Status: ${parsedResult.status}`);
                console.log(`      Results: ${parsedResult.searchResult?.totalResults || 0}`);
              }
            } else if (parsed.sessionId) {
              console.log(`   🔑 Session: ${parsed.sessionId}`);
            } else if (parsed.error) {
              console.log(`   ❌ Error: ${parsed.error.message || 'Unknown'}`);
            }
          } catch (e) {
            if (data && !data.startsWith(':')) {
              console.log(`   📝 Raw: ${data.substring(0, 50)}...`);
            }
          }
        } else if (line.startsWith(':')) {
          console.log(`   💬 ${line.substring(1).trim()}`);
        }
        
        if (eventCount >= maxEvents) break;
      }
      if (eventCount >= maxEvents) break;
    }
    
    console.log(`\n✅ Test completed! Received ${eventCount} events\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testStreaming();




