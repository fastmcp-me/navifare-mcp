#!/usr/bin/env node

/**
 * HTTP Server for Navifare MCP Server
 * Implements MCP protocol over HTTP for ChatGPT integration
 * Based on OpenAI Apps SDK deployment guidelines
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { submit_session, submit_and_poll_session } from './dist/navifare.js';

const app = express();
const PORT = process.env.PORT || 2091;

// Enable CORS for ChatGPT
app.use(cors({
  origin: '*',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Serve static widget files
app.use('/widget', express.static('web/dist'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'navifare-mcp',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// Widget JavaScript endpoint
app.get('/widget/component.js', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  const componentPath = path.join(__dirname, 'web', 'dist', 'component.js');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(componentPath);
});

// MCP Resources endpoint - serves UI widgets
app.get('/resources/:resourceId', (req, res) => {
  const { resourceId } = req.params;

  if (resourceId === 'flight-results.html') {
    // Get the base URL (works for both localhost and ngrok)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const flightData = global.lastFlightResults || null;

    res.setHeader('Content-Type', 'text/html+skybridge');
    res.send(`
<div id="flight-results-root"></div>
<script>
  // Inject flight data into window.openai
  window.openai = window.openai || {};
  window.openai.toolOutput = ${flightData ? JSON.stringify(flightData) : 'null'};
</script>
<script type="module" src="${baseUrl}/widget/component.js"></script>
    `.trim());
  } else {
    res.status(404).json({ error: 'Resource not found' });
  }
});

// Helper function to handle the start_flight_search tool
async function handleStartFlightSearch(args) {
  const { user_request, conversation_context } = args;
  
  // Parse the user's natural language request
  const parsedRequest = await parseFlightRequest(user_request, conversation_context);
  
  if (parsedRequest.needsMoreInfo) {
    return {
      message: parsedRequest.message,
      needsMoreInfo: true,
      missingFields: parsedRequest.missingFields
    };
  }
  
  // If we have all the information, transform it to the exact API format
  const apiRequest = transformToApiFormat(parsedRequest.flightData);
  
  // Call the existing search_flights functionality with the properly formatted data
  return await submit_and_poll_session(apiRequest);
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to parse natural language flight requests using Gemini
async function parseFlightRequest(userRequest, context) {
  try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `You are a flight booking assistant. Parse the following user request and extract flight information.

User Request: "${userRequest}"
${context ? `Previous Context: "${context}"` : ''}

Extract the flight information and return it as a JSON object with this EXACT structure:

{
  "trip": {
    "legs": [
      {
        "segments": [
          {
            "airline": "XZ",
            "flightNumber": "2224",
            "departureAirport": "MXP",
            "arrivalAirport": "FCO",
            "departureDate": "2025-11-03",
            "departureTime": "18:40:00",
            "arrivalTime": "20:05:00",
            "plusDays": 0
          }
        ]
      },
      {
        "segments": [
          {
            "airline": "XZ",
            "flightNumber": "2225",
            "departureAirport": "FCO",
            "arrivalAirport": "MXP",
            "departureDate": "2025-11-11",
            "departureTime": "21:10:00",
            "arrivalTime": "22:35:00",
            "plusDays": 0
          }
        ]
      }
    ],
    "travelClass": "ECONOMY",
    "adults": 1,
    "children": 0,
    "infantsInSeat": 0,
    "infantsOnLap": 0
  },
  "source": "ChatGPT",
  "price": "0.00",
  "currency": "EUR",
  "location": "IT"
}

IMPORTANT RULES:
- Use 3-letter IATA airport codes (e.g., "MXP", "FCO", "JFK", "LAX")
- Use 2-letter airline codes (e.g., "XZ", "LX", "AA", "DL")
- Dates must be in YYYY-MM-DD format
- Times must be in HH:MM:SS format
- For round-trip flights, create two legs with segments
- For one-way flights, create one leg with segments
- Set plusDays to 0 unless flight crosses midnight
- travelClass should be "ECONOMY", "BUSINESS", or "FIRST"
- If passenger count is not specified, default to 1 adult
- If dates are relative (tomorrow, next week), calculate actual dates

Return ONLY the JSON object. Do not include any other text or explanation.`;

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), 30000)
            );
            
            const result = await Promise.race([
              model.generateContent(prompt),
              timeoutPromise
            ]);
            
            const response = await result.response;
            const text = response.text();
    
    // Clean up the response text (remove markdown code blocks if present)
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse the JSON response
    const flightData = JSON.parse(cleanedText);
    
    // Check for missing required fields
    const missingFields = [];
    if (!flightData.departure) missingFields.push('departure airport');
    if (!flightData.arrival) missingFields.push('arrival airport');
    if (!flightData.departureDate) missingFields.push('departure date');
    if (!flightData.returnDate) missingFields.push('return date');
    if (!flightData.departureTime) missingFields.push('departure time');
    if (!flightData.arrivalTime) missingFields.push('arrival time');
    if (!flightData.returnDepartureTime) missingFields.push('return departure time');
    if (!flightData.returnArrivalTime) missingFields.push('return arrival time');
    if (!flightData.airline) missingFields.push('airline code');
    if (!flightData.flightNumber) missingFields.push('flight number');
    
    if (missingFields.length > 0) {
      return {
        needsMoreInfo: true,
        message: `I need more information to search for your flight. Please provide: ${missingFields.join(', ')}.`,
        missingFields,
        flightData
      };
    }
    
    return {
      needsMoreInfo: false,
      flightData
    };
    
  } catch (error) {
    console.error('Error parsing flight request with Gemini:', error);
    
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

// MCP server metadata endpoint (GET /mcp)
app.get('/mcp', (req, res) => {
  res.json({
    name: 'navifare-mcp',
    version: '0.1.0',
    description: 'Flight price discovery and comparison service. Users should provide flight details conversationally, which will be structured into the required format.',
    tools: [
      {
        name: 'pricecheck',
        description: 'Find a better price for a specific flight the user has already found. This tool searches multiple booking sources to compare prices and find cheaper alternatives for the exact same flight details. The user must provide the specific flight they found including airline, flight numbers, airports, dates, times, and the price they saw.',
        _meta: {
          'openai/outputTemplate': 'ui://widget/flight-results.html',
          'openai/toolInvocation/invoking': 'Comparing prices across multiple booking sites...',
          'openai/toolInvocation/invoked': 'Found better prices for your flight!',
          'openai/outputFormat': 'structured'
        },
        inputSchema: {
          type: 'object',
          properties: {
            trip: {
              type: 'object',
              properties: {
                legs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      segments: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            airline: { type: 'string', description: 'Two-letter airline code (e.g., LX)' },
                            flightNumber: { type: 'string', description: 'Flight number (e.g., 1612)' },
                            departureAirport: { type: 'string', description: 'Three-letter IATA code (e.g., ZRH)' },
                            arrivalAirport: { type: 'string', description: 'Three-letter IATA code (e.g., LHR)' },
                            departureDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                            departureTime: { type: 'string', description: 'Time in HH:MM or HH:MM:SS format' },
                            arrivalTime: { type: 'string', description: 'Time in HH:MM or HH:MM:SS format' },
                            plusDays: { type: 'number', description: 'Days to add to arrival date (0 for same day, 1 for next day)' }
                          },
                          required: ['airline', 'flightNumber', 'departureAirport', 'arrivalAirport', 'departureDate', 'departureTime', 'arrivalTime', 'plusDays']
                        }
                      }
                    },
                    required: ['segments']
                  }
                },
                travelClass: { type: 'string', description: 'e.g., ECONOMY, BUSINESS, FIRST' },
                adults: { type: 'number' },
                children: { type: 'number' },
                infantsInSeat: { type: 'number' },
                infantsOnLap: { type: 'number' }
              },
              required: ['legs', 'travelClass', 'adults', 'children', 'infantsInSeat', 'infantsOnLap']
            },
            source: { type: 'string', description: 'Source of the price (e.g., "ChatGPT")' },
            price: { type: 'string', description: 'Reference price' },
            currency: { type: 'string', description: 'Three-letter currency code (e.g., USD, EUR)' },
            location: { type: 'string', description: 'User location (optional)' }
          },
          required: ['trip', 'source', 'price', 'currency']
        }
      },
      {
        name: 'format_flight_pricecheck_request',
        description: 'Parse flight details from natural language to prepare for price comparison. Use this when the user mentions a specific flight they found and wants to check for better prices. I\'ll ask follow-up questions to collect all required flight details.',
        _meta: {
          'openai/toolInvocation/invoking': 'Parsing your flight details...',
          'openai/toolInvocation/invoked': 'Ready to compare prices!',
          'openai/outputFormat': 'structured'
        },
        inputSchema: {
          type: 'object',
          properties: {
            user_request: { type: 'string', description: 'Describe your flight needs in natural language (e.g., "I want to fly from Milan to Rome on November 3rd, returning November 11th")' },
            conversation_context: { type: 'string', description: 'Previous conversation context if this is a follow-up question' }
          },
          required: ['user_request']
        }
      }
    ]
  });
});

// MCP tool invocation endpoint (POST /mcp)
app.post('/mcp', async (req, res) => {
  console.log('📥 Received MCP request:', JSON.stringify(req.body, null, 2));
  
  try {
    const { method, params } = req.body;

    function sanitizeSubmitArgs(rawArgs) {
      if (!rawArgs || typeof rawArgs !== 'object') return rawArgs;
      const args = { ...rawArgs };

      // Ensure required top-level fields exist
      if (!args.trip) args.trip = {};
      if (!args.trip.legs) args.trip.legs = [];

      // Normalize travelClass to uppercase as many backends require enums
      if (typeof args.trip.travelClass === 'string') {
        args.trip.travelClass = args.trip.travelClass.toUpperCase();
      }

      // Format price to 2 decimal places (e.g., "99" -> "99.00")
      if (typeof args.price === 'string' || typeof args.price === 'number') {
        const numeric = Number(String(args.price).replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(numeric)) {
          args.price = numeric.toFixed(2);
        }
      }

      // Ensure currency is 3-letter uppercase
      if (typeof args.currency === 'string') {
        args.currency = args.currency.trim().toUpperCase();
      }

      // Extract 2-letter country code from location if needed
      if (typeof args.location === 'string' && args.location.trim()) {
        const loc = args.location.trim();

        // Timezone to country mapping
        const timezoneToCountry = {
          'Europe/Rome': 'IT',
          'Europe/Milan': 'IT',
          'Europe/Paris': 'FR',
          'Europe/London': 'GB',
          'America/New_York': 'US',
          'America/Los_Angeles': 'US',
        };

        // City/country name mapping (for common cases like "Milan, Italy")
        const cityCountryMapping = {
          'italy': 'IT', 'italia': 'IT',
          'france': 'FR', 'francia': 'FR',
          'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
          'united states': 'US', 'usa': 'US', 'america': 'US',
          'spain': 'ES', 'espana': 'ES',
          'germany': 'DE', 'deutschland': 'DE',
          'switzerland': 'CH', 'svizzera': 'CH',
        };

        if (loc in timezoneToCountry) {
          args.location = timezoneToCountry[loc];
        } else if (loc.length === 2 && loc.match(/^[A-Z]{2}$/i)) {
          // Already a 2-letter code
          args.location = loc.toUpperCase();
        } else {
          // Handle cases like "EU-Rome" - extract the country part
          const parts = loc.split('-');
          if (parts.length === 2 && parts[1].length === 2 && parts[1].match(/^[A-Z]{2}$/i)) {
            args.location = parts[1].toUpperCase();
          } else {
            // Try to find country name in the string (e.g., "Milan, Italy" -> "IT")
            const lowerLoc = loc.toLowerCase();
            let found = false;
            for (const [country, code] of Object.entries(cityCountryMapping)) {
              if (lowerLoc.includes(country)) {
                args.location = code;
                found = true;
                break;
              }
            }
            // Try to extract explicit 2-letter code (e.g., "Rome, IT")
            if (!found) {
              const match = loc.match(/\b([A-Z]{2})\b/);
              if (match && match[1] !== 'EU') { // Avoid matching "EU" as a country code
                args.location = match[1];
                found = true;
              }
            }
            // If we still can't parse it, remove the field entirely
            if (!found) {
              delete args.location;
            }
          }
        }
      } else {
        // If no location provided, remove the field entirely (backend doesn't accept empty string)
        delete args.location;
      }

      // Ensure source is valid (backend only accepts specific values)
      // Valid sources: MANUAL, KAYAK, GOOGLE_FLIGHTS, BOOKING
      if (args.source && typeof args.source === 'string') {
        const validSources = ['MANUAL', 'KAYAK', 'GOOGLE_FLIGHTS', 'BOOKING'];
        if (!validSources.includes(args.source.toUpperCase())) {
          args.source = 'MANUAL'; // Default to MANUAL for non-standard sources like ChatGPT
        }
      } else {
        args.source = 'MANUAL';
      }

      // Ensure infants fields are always present
      if (!Number.isFinite(args.trip.infantsInSeat)) args.trip.infantsInSeat = 0;
      if (!Number.isFinite(args.trip.infantsOnLap)) args.trip.infantsOnLap = 0;

      // Walk all segments and normalize fields
      for (const leg of args.trip.legs) {
        if (!leg.segments) continue;
        for (const seg of leg.segments) {
          if (typeof seg.flightNumber === 'string') {
            // Keep numeric-only per existing web extract rules
            const match = seg.flightNumber.match(/\d+/);
            if (match) seg.flightNumber = match[0];
          }
          // Ensure plusDays present
          if (!Number.isFinite(seg.plusDays)) seg.plusDays = 0;
          
          // Ensure times are in HH:MM:SS format (backend requires seconds)
          // If times are missing/empty, set to "00:00:00" as a fallback
          if (typeof seg.departureTime === 'string') {
            if (seg.departureTime.length === 5) {
              seg.departureTime = seg.departureTime + ':00'; // "13:00" -> "13:00:00"
            } else if (!seg.departureTime || seg.departureTime.trim() === '') {
              seg.departureTime = '00:00:00'; // Empty -> "00:00:00"
            }
          } else if (!seg.departureTime) {
            seg.departureTime = '00:00:00';
          }
          
          if (typeof seg.arrivalTime === 'string') {
            if (seg.arrivalTime.length === 5) {
              seg.arrivalTime = seg.arrivalTime + ':00'; // "14:10" -> "14:10:00"
            } else if (!seg.arrivalTime || seg.arrivalTime.trim() === '') {
              seg.arrivalTime = '00:00:00'; // Empty -> "00:00:00"
            }
          } else if (!seg.arrivalTime) {
            seg.arrivalTime = '00:00:00';
          }
        }
      }

      return args;
    }

    function generateTripSummary(flightData) {
      if (!flightData?.trip?.legs || flightData.trip.legs.length === 0) {
        return null;
      }

      try {
        const firstLeg = flightData.trip.legs[0];
        const lastLeg = flightData.trip.legs[flightData.trip.legs.length - 1];
        
        if (!firstLeg.segments || !lastLeg.segments || firstLeg.segments.length === 0 || lastLeg.segments.length === 0) {
          return null;
        }

        const firstSegment = firstLeg.segments[0];
        const lastSegment = lastLeg.segments[lastLeg.segments.length - 1];
        
        // Build route string
        let route;
        if (flightData.trip.legs.length === 1) {
          // One-way
          route = `${firstSegment.departureAirport} → ${lastSegment.arrivalAirport}`;
        } else {
          // Round-trip or multi-city
          route = `${firstSegment.departureAirport} ⇄ ${lastSegment.arrivalAirport}`;
        }
        
        // Format date
        const departureDate = new Date(firstSegment.departureDate);
        const formattedDate = departureDate.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
        
        // Build passenger string
        const adults = flightData.trip.adults || 0;
        const children = flightData.trip.children || 0;
        const infants = (flightData.trip.infantsInSeat || 0) + (flightData.trip.infantsOnLap || 0);
        
        let passengers = '';
        if (adults > 0) passengers += `${adults} adult${adults !== 1 ? 's' : ''}`;
        if (children > 0) passengers += `${passengers ? ', ' : ''}${children} child${children !== 1 ? 'ren' : ''}`;
        if (infants > 0) passengers += `${passengers ? ', ' : ''}${infants} infant${infants !== 1 ? 's' : ''}`;
        
        // Travel class
        const travelClass = flightData.trip.travelClass?.toLowerCase().replace('_', ' ') || 'economy';
        const capitalizedClass = travelClass.charAt(0).toUpperCase() + travelClass.slice(1);

        return {
          route: route,
          date: formattedDate,
          passengers: passengers || '1 passenger',
          class: capitalizedClass
        };
      } catch (error) {
        console.log('Error generating trip summary:', error);
        return null;
      }
    }
    
    // Handle MCP initialization
    if (method === 'initialize') {
      console.log('🤝 Handling initialize request');
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: 'navifare-mcp',
            version: '0.1.0'
          }
        }
      });
      return;
    }
    
    // Handle notifications (no response needed)
    if (method === 'notifications/initialized' || method === 'initialized') {
      console.log('✅ Initialization complete');
      res.status(200).end();
      return;
    }
    
    // Handle MCP protocol methods
    if (method === 'tools/list') {
      // Return list of available tools
      const metadata = await fetch('http://localhost:2091/mcp').then(r => r.json());
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: metadata.tools
        }
      });
      return;
    }
    
    if (method === 'resources/list') {
      // Return list of UI resources
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          resources: [
            {
              uri: 'ui://widget/flight-results.html',
              name: 'Flight Results Widget',
              description: 'Interactive UI for displaying flight price comparison results',
              mimeType: 'text/html+skybridge'
            }
          ]
        }
      });
      return;
    }
    
    if (method === 'resources/read') {
      // Serve the resource content
      const { uri } = params;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      if (uri === 'ui://widget/flight-results.html') {
        // Get the latest flight data from a global store or pass it via URL
        const flightData = global.lastFlightResults || null;

        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            contents: [
              {
                uri: 'ui://widget/flight-results.html',
                mimeType: 'text/html+skybridge',
                text: `
<div id="flight-results-root"></div>
<script>
  // Inject flight data into window.openai
  window.openai = window.openai || {};
  window.openai.toolOutput = ${flightData ? JSON.stringify(flightData) : 'null'};
</script>
<script type="module" src="${baseUrl}/widget/component.js"></script>
                `.trim()
              }
            ]
          }
        });
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32602,
            message: `Resource not found: ${uri}`
          }
        });
      }
      return;
    }
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      
      console.log(`🔧 Calling tool: ${name}`);
      console.log('📝 Arguments:', JSON.stringify(args, null, 2));
      
      let result;
      
      let cleanedArgs = null; // Store cleaned args for trip summary
      
      if (name === 'pricecheck') {
        // Validate that we have flight segments before submitting
        if (!args.trip?.legs || args.trip.legs.length === 0) {
          throw new Error('Missing flight information. Please ask the user for flight details (dates, times, flight numbers, airports) before searching.');
        }
        
        // Validate that we have at least 2 legs for round-trip flights
        if (args.trip.legs.length < 2) {
          throw new Error('Navifare requires round-trip flights. Please ask the user for both outbound and return flight details including dates, times, flight numbers, and airports for both legs.');
        }
        
        for (const leg of args.trip.legs) {
          if (!leg.segments || leg.segments.length === 0) {
            throw new Error('Missing flight segments. Please ask the user for complete flight details including airline, flight number, airports, dates, and times.');
          }
        }
        
        // Sanitize payload and submit with auto-polling
        const cleaned = sanitizeSubmitArgs(args);
        cleanedArgs = cleaned; // Store for later use
        console.log('🚀 Submitting to Navifare API:', JSON.stringify(cleaned, null, 2));
        result = await submit_and_poll_session(cleaned);
        console.log('✅ Search complete:', JSON.stringify(result, null, 2));
      } else if (name === 'submit_session') {
        // Sanitize payload to mirror web app extraction rules
        const cleaned = sanitizeSubmitArgs(args);
        console.log('🚀 Submitting to Navifare API:', JSON.stringify(cleaned, null, 2));
        result = await submit_session(cleaned);
        console.log('✅ Navifare API response:', JSON.stringify(result, null, 2));
      } else if (name === 'format_flight_pricecheck_request') {
        result = await handleStartFlightSearch(args);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        });
        return;
      }
      
      console.log('✅ Tool execution successful');
      
      // Format response with structured content for the widget
      let response;
      
      if (name === 'pricecheck') {
        // For pricecheck, always return the widget response format
        const enhancedResult = {
          ...result,
          tripSummary: generateTripSummary(cleanedArgs)
        };
        
        // Store the flight data globally so the widget can access it
        global.lastFlightResults = enhancedResult;
        
        // Get the base URL for widget loading - force HTTPS for ngrok
        const baseUrl = req.get('host')?.includes('ngrok') 
          ? `https://${req.get('host')}` 
          : `${req.protocol}://${req.get('host')}`;
        
        // Create the widget HTML
        const widgetHtml = `
<div id="flight-results-root"></div>
<script>
  // Inject flight data into window.openai
  window.openai = window.openai || {};
  window.openai.toolOutput = ${JSON.stringify(enhancedResult)};
</script>
<script type="module" src="${baseUrl}/widget/component.js"></script>
        `.trim();
        
        // Return response with React component UI (following OpenAI Apps SDK pattern)
        response = {
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: 'html',
                html: widgetHtml
              }
            ]
          }
        };
      } else {
        // For other tools, return simple response
        response = {
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };
      }
      
      // Debug: Log the response being sent to ChatGPT
      console.log('📤 Sending response to ChatGPT:', JSON.stringify(response, null, 2));
      
      res.json(response);
      return;
    }
    
    // Unknown method
    res.status(400).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    });

  } catch (error) {
    console.error('❌ Error handling MCP request:', error);
      res.status(500).json({ 
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ 
    error: 'Server error',
    message: err.message 
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  🚀 Navifare MCP HTTP Server Running                          ║
║                                                                ║
║  Local:     http://localhost:${PORT}                              ║
║  MCP:       http://localhost:${PORT}/mcp                          ║
║  Health:    http://localhost:${PORT}/health                       ║
║                                                                ║
║  Ready for ChatGPT integration via ngrok!                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  console.log('\n📝 Next steps:');
  console.log('   1. Run: ngrok http 2091');
  console.log('   2. Copy the ngrok HTTPS URL');
  console.log('   3. Add /mcp to the end of the URL');
  console.log('   4. Configure in ChatGPT settings\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
