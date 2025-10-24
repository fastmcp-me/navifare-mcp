#!/usr/bin/env node

/**
 * Simple STDIO MCP Server for MCP Inspector
 * This is a working version that properly handles STDIO protocol
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { submit_session, submit_and_poll_session } from './dist/navifare.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to parse natural language flight requests using Gemini
async function parseFlightRequest(userRequest, context) {
  try {
            console.error('🔍 Starting Gemini request...');
            console.error('📝 User request:', userRequest);
            console.error('🔑 API key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 'Not set');
            console.error('🔑 API key starts with:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'Not set');
            
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            console.error('🤖 Model initialized:', model);
    
    const prompt = `Analyze this flight request: "${userRequest}"

First, identify what flight information the user HAS provided and what is MISSING.

IMPORTANT: If the user provides dates like "November 4th" or "Nov 4", assume the current year unless they specify otherwise. If they provide times like "6:40 PM" or "6.40pm", convert to 24-hour format.

If the user has provided complete flight information (airline, flight number, airports, dates, times), return JSON with this structure:
{
  "trip": {
    "legs": [{"segments": [{"airline": "XX", "flightNumber": "123", "departureAirport": "XXX", "arrivalAirport": "XXX", "departureDate": "YYYY-MM-DD", "departureTime": "HH:MM:SS", "arrivalTime": "HH:MM:SS", "plusDays": 0}]}],
    "travelClass": "ECONOMY",
    "adults": 1,
    "children": 0,
    "infantsInSeat": 0,
    "infantsOnLap": 0
  },
  "source": "MCP",
  "price": "100.00",
  "currency": "EUR",
  "location": "IT"
}

If the user has NOT provided complete information, analyze what they provided and what's missing, then return:
{"needsMoreInfo": true, "message": "I can see you want to [what they provided]. To complete your flight search, I need: [only the specific missing information]."}

Return ONLY JSON.`;

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout after 45 seconds')), 45000) // Set to 45 seconds to work around MCP Inspector timeout
            );
            
            console.error('📤 Sending request to Gemini...');
            console.error('📝 Prompt length:', prompt.length);
            console.error('📝 Prompt preview:', prompt.substring(0, 200) + '...');
            
            const startTime = Date.now();
            console.error('⏰ Starting Gemini API call at:', new Date().toISOString());
            
            const result = await Promise.race([
              model.generateContent(prompt),
              timeoutPromise
            ]);
            
            const endTime = Date.now();
            console.error('⏰ Gemini API call completed in:', endTime - startTime, 'ms');
            
            console.error('✅ Received response from Gemini');
            const response = await result.response;
            const text = response.text();
            console.error('📥 Raw response length:', text.length);
            console.error('📥 Raw response preview:', text.substring(0, 200) + '...');
    
    // Clean up the response text (remove markdown code blocks if present)
    let cleanedText = text.trim();
    console.error('🧹 Cleaning response...');
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      console.error('🧹 Removed ```json markdown');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      console.error('🧹 Removed ``` markdown');
    }
    
    console.error('🧹 Cleaned text preview:', cleanedText.substring(0, 200) + '...');
    
    // Parse the JSON response
    const flightData = JSON.parse(cleanedText);
    console.error('✅ Successfully parsed JSON');
    console.error('🔍 Parsed flight data:', JSON.stringify(flightData, null, 2));
    
    // Check if Gemini returned a needsMoreInfo response
    if (flightData.needsMoreInfo) {
      console.error('🔍 Gemini detected missing information');
      return {
        needsMoreInfo: true,
        message: flightData.message,
        missingFields: flightData.missingFields || []
      };
    }
    
    // Check for missing required fields in the new nested structure
    console.error('🔍 Checking for missing fields...');
    const missingFields = [];
    
    // Check if we have the basic trip structure
    if (!flightData.trip) {
      missingFields.push('trip information');
    } else {
      // Check legs
      if (!flightData.trip.legs || !Array.isArray(flightData.trip.legs) || flightData.trip.legs.length === 0) {
        missingFields.push('flight legs');
      } else {
        // Check each leg's segments
        flightData.trip.legs.forEach((leg, legIndex) => {
          if (!leg.segments || !Array.isArray(leg.segments) || leg.segments.length === 0) {
            missingFields.push(`segments for leg ${legIndex + 1}`);
          } else {
            leg.segments.forEach((segment, segmentIndex) => {
              // Check for null values or missing fields
              if (!segment.airline || segment.airline === null) missingFields.push(`airline code for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.flightNumber || segment.flightNumber === null) missingFields.push(`flight number for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.departureAirport || segment.departureAirport === null) missingFields.push(`departure airport for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.arrivalAirport || segment.arrivalAirport === null) missingFields.push(`arrival airport for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.departureDate || segment.departureDate === null) missingFields.push(`departure date for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.departureTime || segment.departureTime === null) missingFields.push(`departure time for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
              if (!segment.arrivalTime || segment.arrivalTime === null) missingFields.push(`arrival time for leg ${legIndex + 1}, segment ${segmentIndex + 1}`);
            });
          }
        });
      }
      
      // Check passenger information
      if (!flightData.trip.adults) missingFields.push('number of adults');
      if (!flightData.trip.travelClass) missingFields.push('travel class');
    }
    
    console.error('🔍 Missing fields check complete. Found:', missingFields.length, 'missing fields');
    
    if (missingFields.length > 0) {
      console.error('❌ Missing fields detected:', missingFields);
      
      // Generate a user-friendly question about missing information
      let question = "I need a bit more information to search for your flight. ";
      if (missingFields.length === 1) {
        question += `Could you please provide: ${missingFields[0]}?`;
      } else if (missingFields.length <= 3) {
        question += `Could you please provide: ${missingFields.slice(0, -1).join(', ')} and ${missingFields[missingFields.length - 1]}?`;
      } else {
        question += `Could you please provide more details about your flight? I'm missing: ${missingFields.slice(0, 3).join(', ')} and ${missingFields.length - 3} other details.`;
      }
      
      return {
        needsMoreInfo: true,
        message: question,
        missingFields,
        flightData
      };
    }
    
    console.error('✅ All required fields present, returning flight data');
    return {
      needsMoreInfo: false,
      flightData
    };
    
          } catch (error) {
            console.error('❌ Error parsing flight request with Gemini:', error);
            console.error('❌ Error details:', error.message);
            console.error('❌ Error stack:', error.stack);
            console.error('❌ Error type:', error.constructor.name);
            console.error('❌ Error occurred at:', new Date().toISOString());
    
    // Fallback to basic parsing if Gemini fails
    return {
      needsMoreInfo: true,
      message: `I encountered an error parsing your request. Please provide: departure airport, arrival airport, departure date, return date, departure time, arrival time, return departure time, return arrival time, airline code, flight number.`,
      missingFields: ['departure airport', 'arrival airport', 'departure date', 'return date', 'departure time', 'arrival time', 'return departure time', 'return arrival time', 'airline code', 'flight number']
    };
  }
}

// Helper function to transform parsed data to the exact API format
function transformToApiFormat(flightData) {
  // If the flightData already has the correct structure, return it as-is
  if (flightData.trip && flightData.trip.legs) {
    return flightData;
  }
  
  // Otherwise, transform the old format to the new format
  return {
    trip: {
      legs: [
        {
          segments: [
            {
              airline: flightData.airline,
              flightNumber: flightData.flightNumber,
              departureAirport: flightData.departure,
              arrivalAirport: flightData.arrival,
              departureDate: flightData.departureDate,
              departureTime: flightData.departureTime,
              arrivalTime: flightData.arrivalTime,
              plusDays: 0
            }
          ]
        },
        {
          segments: [
            {
              airline: flightData.airline, // Assuming same airline for return
              flightNumber: flightData.flightNumber, // Assuming same flight number for return
              departureAirport: flightData.arrival,
              arrivalAirport: flightData.departure,
              departureDate: flightData.returnDate,
              departureTime: flightData.returnDepartureTime,
              arrivalTime: flightData.returnArrivalTime,
              plusDays: 0
            }
          ]
        }
      ],
      travelClass: flightData.travelClass,
      adults: flightData.adults,
      children: flightData.children,
      infantsInSeat: flightData.infantsInSeat,
      infantsOnLap: flightData.infantsOnLap
    },
    source: flightData.source,
    price: flightData.price,
    currency: flightData.currency,
    location: flightData.location
  };
}

// Simple MCP server that just echoes back what it receives
process.stdin.setEncoding('utf8');

process.stdin.on('data', async (data) => {
  try {
    const request = JSON.parse(data.trim());
    
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'navifare-mcp',
            version: '0.1.0'
          }
        }
      };
      console.log(JSON.stringify(response));
    } else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'flight_pricecheck',
              description: 'Find a better price for a specific flight the user has already found. This tool searches multiple booking sources to compare prices and find cheaper alternatives for the exact same flight details.',
              inputSchema: {
                type: 'object',
                properties: {
                  flightData: {
                    type: 'object',
                    description: 'Complete flight data payload containing the specific flight details the user found, including airline, flight numbers, airports, dates, times, and the price they saw'
                  }
                },
                required: ['flightData']
              }
            },
            {
              name: 'format_flight_pricecheck_request',
              description: 'Parse flight details from natural language to prepare for price comparison. Use this when the user mentions a specific flight they found and wants to check for better prices. I\'ll ask follow-up questions to collect all required flight details.',
              inputSchema: {
                type: 'object',
                properties: {
                  user_request: { type: 'string', description: 'Describe the specific flight you found and want to check for better prices (e.g., "I found LX 1612 from MXP to FCO on Nov 4th at 6:40 PM for 150 EUR")' },
                  conversation_context: { type: 'string', description: 'Previous conversation context if this is a follow-up question' }
                },
                required: ['user_request']
              }
            }
          ]
        }
      };
      console.log(JSON.stringify(response));
    } else if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      
      let result;
      
          if (name === 'format_flight_pricecheck_request') {
        console.error('🚀 Starting flight search...');
        // Parse the user's natural language request
        const parsedRequest = await parseFlightRequest(args.user_request, args.conversation_context);
        console.error('📊 Parsed request result:', parsedRequest.needsMoreInfo ? 'Needs more info' : 'Ready to proceed');
        
        if (parsedRequest.needsMoreInfo) {
          result = {
            message: parsedRequest.message,
            needsMoreInfo: true,
            missingFields: parsedRequest.missingFields
          };
        } else {
          // Automatically proceed with search_flights since we have all the information
          console.error('✅ Flight information parsed successfully! Automatically proceeding with search_flights...');
          console.error('📊 Parsed flight data:', JSON.stringify(parsedRequest.flightData, null, 2));
          
          // Set source to MCP as requested
          const searchData = {
            ...parsedRequest.flightData,
            source: 'MCP'
          };
          
          console.error('📤 Search flights payload:', JSON.stringify(searchData, null, 2));
          
          try {
            // Transform to API format and call the actual API
            const apiRequest = transformToApiFormat(searchData);
            const searchResult = await submit_and_poll_session(apiRequest);
            
            result = {
              message: 'Flight search completed successfully!',
              searchResult: searchResult,
              searchData: searchData
            };
          } catch (apiError) {
            console.error('❌ API Error:', apiError);
            result = {
              message: `Flight search failed: ${apiError.message}`,
              error: apiError.message,
              searchData: searchData
            };
          }
        }
      } else if (name === 'flight_pricecheck') {
        console.error('🔍 Processing search_flights tool...');
        
        // Get the flight data from the input
        const flightData = args.flightData;
        
        // Set source to MCP as requested
        const searchData = {
          ...flightData,
          source: 'MCP'
        };
        
        console.error('📤 Search flights payload:', JSON.stringify(searchData, null, 2));
        
        try {
          // Transform to API format and call the actual API
          const apiRequest = transformToApiFormat(searchData);
          const searchResult = await submit_and_poll_session(apiRequest);
          
          result = {
            message: 'Flight search completed successfully!',
            searchResult: searchResult,
            searchData: searchData
          };
        } catch (apiError) {
          console.error('❌ API Error:', apiError);
          result = {
            message: `Flight search failed: ${apiError.message}`,
            error: apiError.message,
            searchData: searchData
          };
        }
      } else {
        result = {
          message: 'Tool called successfully',
          tool: name,
          arguments: args
        };
      }
      
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
      console.log(JSON.stringify(response));
    }
  } catch (error) {
    // Ignore invalid JSON
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();