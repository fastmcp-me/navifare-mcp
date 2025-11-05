#!/usr/bin/env node

/**
 * HTTP Server for Navifare MCP Server
 * Implements MCP protocol over HTTP for MCP client integration
 * Based on OpenAI Apps SDK deployment guidelines
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { submit_session, get_session_results, submit_and_poll_session } from './dist/navifare.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 2091;

// Initialize Gemini AI only when needed
let genAI = null;
function getGeminiAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// ============================================================================
// Helper Functions (copied from stdio-server.js)
// ============================================================================

// Helper function to parse natural language flight requests using Gemini
async function parseFlightRequest(userRequest) {
  try {
    console.log('🔍 Starting Gemini request...');
    console.log('📝 User request:', userRequest.substring(0, 200) + '...');
    
    const model = getGeminiAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Get current date context dynamically
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const prompt = `Analyze this flight request: "${userRequest}"

First, identify what flight information the user HAS provided and what is MISSING.

CRITICAL REQUIREMENTS:
1. AIRLINE: Use the 2-3 letter IATA airline code (e.g., "AZ", "LH", "BA", "AF"), NOT the airline name (e.g., NOT "ITA Airways", "Lufthansa", "British Airways"). If only the airline name is provided, convert it to its IATA code.
2. DATES: Use the CURRENT YEAR (${currentYear}) for dates unless explicitly specified otherwise. If a date appears to be in the past (e.g., 2014, 2023), convert it to ${currentYear} or the appropriate future year. For dates without a year, if month/day >= today (${currentDate}), use ${currentYear}; if earlier, use ${currentYear + 1}. Dates must be in YYYY-MM-DD format.
3. TIMES: Convert times like "6:40 PM" or "6.40pm" to 24-hour format "HH:MM:SS" (e.g., "18:40:00"). Always respect AM/PM indicators:
   - 1:55 PM → 13:55:00 (add 12 hours)
   - 10:45 PM → 22:45:00 (add 12 hours)
   - 1:55 AM → 01:55:00 (keep same)
   - 12:00 PM → 12:00:00 (noon)
   - 12:00 AM → 00:00:00 (midnight)

If the user has provided complete flight information (airline code, flight number, airports, dates, times), return JSON with this structure:
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
      setTimeout(() => reject(new Error('Request timeout after 45 seconds')), 45000)
    );
    
    const startTime = Date.now();
    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise
    ]);
    const endTime = Date.now();
    console.log(`⏰ Gemini API call completed in ${endTime - startTime}ms`);
    
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
    
    // Check if Gemini returned a needsMoreInfo response
    if (flightData.needsMoreInfo) {
      return {
        needsMoreInfo: true,
        message: flightData.message,
        missingFields: flightData.missingFields || []
      };
    }
    
    // Check for missing required fields
    const missingFields = [];
    if (!flightData.trip) {
      missingFields.push('trip information');
    } else {
      if (!flightData.trip.legs || !Array.isArray(flightData.trip.legs) || flightData.trip.legs.length === 0) {
        missingFields.push('flight legs');
      } else {
        flightData.trip.legs.forEach((leg, legIndex) => {
          if (!leg.segments || !Array.isArray(leg.segments) || leg.segments.length === 0) {
            missingFields.push(`segments for leg ${legIndex + 1}`);
          } else {
            leg.segments.forEach((segment, segmentIndex) => {
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
      if (!flightData.trip.adults) missingFields.push('number of adults');
      if (!flightData.trip.travelClass) missingFields.push('travel class');
    }
    
    if (missingFields.length > 0) {
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
    
    return {
      needsMoreInfo: false,
      flightData
    };
    
  } catch (error) {
    console.error('❌ Error parsing flight request with Gemini:', error);
    return {
      needsMoreInfo: true,
      message: `I encountered an error parsing your request. Please provide: departure airport, arrival airport, departure date, return date, departure time, arrival time, return departure time, return arrival time, airline code, flight number.`,
      missingFields: ['departure airport', 'arrival airport', 'departure date', 'return date', 'departure time', 'arrival time', 'return departure time', 'return arrival time', 'airline code', 'flight number']
    };
  }
}

// Helper function to split round trip segments in legs format (same logic as geminiService.ts)
// Reuses the round trip detection pattern from the web app
function splitRoundTripLegs(legs) {
  if (!legs || legs.length === 0) return legs;
  
  // Check each leg for round trip patterns
  const normalizedLegs = [];
  
  for (const leg of legs) {
    if (!leg.segments || leg.segments.length < 2) {
      // Single segment or no segments - keep as-is
      normalizedLegs.push(leg);
      continue;
    }
    
    const segments = leg.segments;
    const firstSegment = segments[0];
    
    // Need departureAirport/arrivalAirport (API format) or departure/arrival (extracted format)
    const origin = firstSegment.departureAirport || firstSegment.departure;
    
    if (!origin) {
      // Can't determine origin, keep as-is
      normalizedLegs.push(leg);
      continue;
    }
    
    // Check if any segment returns to origin (round trip pattern)
    // This matches the logic from geminiService.ts: detectRoundTripPattern + segment splitting
    let foundReturn = false;
    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      const arrival = segment.arrivalAirport || segment.arrival;
      
      if (arrival && arrival.toUpperCase() === origin.toUpperCase()) {
        // Found return flight - split segments (same logic as geminiService.ts lines 690-697)
        console.log(`🔄 Splitting round trip: first ${i} segments are outbound, remaining are return`);
        const outboundSegments = segments.slice(0, i);
        const returnSegments = segments.slice(i);
        
        normalizedLegs.push({ segments: outboundSegments });
        normalizedLegs.push({ segments: returnSegments });
        foundReturn = true;
        break;
      }
    }
    
    if (!foundReturn) {
      // No round trip pattern detected, keep leg as-is
      normalizedLegs.push(leg);
    }
  }
  
  return normalizedLegs;
}

function transformToApiFormat(flightData) {
  // If the flightData already has the correct structure, check if round trip needs splitting
  if (flightData.trip && flightData.trip.legs) {
    // Reuse the round trip splitting logic (same pattern as geminiService.ts)
    const normalizedLegs = splitRoundTripLegs(flightData.trip.legs);
    
    if (normalizedLegs.length !== flightData.trip.legs.length) {
      // Legs were split, return normalized structure
      return {
        ...flightData,
        trip: {
          ...flightData.trip,
          legs: normalizedLegs
        }
      };
    }
    
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
              airline: flightData.airline,
              flightNumber: flightData.flightNumber,
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

// Helper function to optimize images for Gemini API
async function optimizeImagesForGemini(images) {
  const optimizedImages = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    
    // Clean the base64 data thoroughly before processing
    let data = img.data || '';
    
    // Remove data URI prefix if present
    if (data.startsWith('data:image/')) {
      data = data.split(',')[1] || data;
    }
    
    // Remove ALL whitespace (spaces, newlines, tabs, etc.)
    data = data.replace(/\s/g, '');
    
    // Validate that we have actual data
    if (!data || data.length < 100) {
      console.log(`❌ Image ${i} has invalid or too short base64 data (${data.length} chars)`);
      throw new Error(`Image ${i} has invalid base64 data`);
    }

    try {
      // Validate base64 before decoding
      const decoded = Buffer.from(data, 'base64');
      
      // Verify the decoded buffer is valid
      if (decoded.length === 0) {
        throw new Error('Decoded buffer is empty');
      }

      // More aggressive optimization strategy
      let optimizedBuffer;

      if (decoded.length > 500 * 1024) { // Over 500KB - heavy compression
        optimizedBuffer = await sharp(decoded)
          .resize(800, 600, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 60, progressive: true })
          .toBuffer();
      } else if (decoded.length > 200 * 1024) { // Over 200KB - moderate compression
        optimizedBuffer = await sharp(decoded)
          .resize(1000, 750, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 75, progressive: true })
          .toBuffer();
      } else {
        // Small enough, just ensure it's JPEG format
        if (img.mimeType === 'image/jpeg' || img.mimeType === 'image/jpg') {
          optimizedBuffer = decoded;
        } else {
          // Convert other formats to JPEG
          optimizedBuffer = await sharp(decoded)
            .jpeg({ quality: 85 })
            .toBuffer();
        }
      }

      const optimizedBase64 = optimizedBuffer.toString('base64');

      // Additional check: if even after optimization the base64 is still too large, compress more
      if (optimizedBase64.length > 5 * 1024 * 1024) { // 5MB base64 limit per image
        // Apply more aggressive compression
        const emergencyBuffer = await sharp(decoded)
          .resize(600, 450, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 40, progressive: true })
          .toBuffer();

        const finalBase64 = emergencyBuffer.toString('base64');
        
        if (!finalBase64 || finalBase64.length < 100) {
          throw new Error(`Emergency optimized base64 is too short (${finalBase64?.length || 0} chars)`);
        }
        
        optimizedImages.push({
          data: finalBase64,
          mimeType: 'image/jpeg'
        });
      } else {
        if (!optimizedBase64 || optimizedBase64.length < 100) {
          throw new Error(`Optimized base64 is too short (${optimizedBase64?.length || 0} chars)`);
        }
        
        optimizedImages.push({
          data: optimizedBase64,
          mimeType: 'image/jpeg'
        });
      }

    } catch (error) {
      console.log(`❌ Failed to optimize image ${i}:`, error.message);
      
      // If optimization fails, try with original (but ensure it's clean)
      let fallbackData = data;
      if (fallbackData.startsWith('data:image/')) {
        fallbackData = fallbackData.split(',')[1] || fallbackData;
      }
      fallbackData = fallbackData.replace(/\s/g, '');
      
      // Validate fallback data
      if (!fallbackData || fallbackData.length < 100) {
        throw new Error(`Cannot process image ${i}: optimization failed and original data is invalid`);
      }
      
      optimizedImages.push({
        data: fallbackData,
        mimeType: img.mimeType || 'image/jpeg'
      });
    }
  }

  return optimizedImages;
}

// Helper function to extract flight details from images using Gemini
async function extractFlightDetailsFromImages(images) {
  console.log('🚀 extractFlightDetailsFromImages STARTED');
  console.log('📊 Input images count:', images.length);

  // Check API key first
  if (!process.env.GEMINI_API_KEY) {
    return {
      error: 'Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.'
    };
  }

  const model = getGeminiAI().getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Get current date context
  const currentYear = new Date().getFullYear();
  const currentDate = new Date().toISOString().split('T')[0];
  console.log('📅 Current date context:', { currentYear, currentDate });

  // Optimize images before sending to Gemini
  console.log('🖼️ Starting image optimization...');
  const optimizedImages = await optimizeImagesForGemini(images);
  console.log('✅ Image optimization completed');

  // Check optimized size
  let optimizedTotalSize = 0;
  for (let i = 0; i < optimizedImages.length; i++) {
    optimizedTotalSize += optimizedImages[i].data?.length || 0;
  }
  const maxOptimizedSize = 10 * 1024 * 1024; // 10MB after optimization
  if (optimizedTotalSize > maxOptimizedSize) {
    return {
      error: `Images are still too large after optimization (${Math.round(optimizedTotalSize / 1024 / 1024)}MB). Please use smaller original images.`
    };
  }

  // Convert optimized images to the format expected by Gemini
  const imageParts = optimizedImages.map((img, index) => {
    let cleanedData = img.data || '';
    
    if (!cleanedData) {
      throw new Error(`Image ${index} has no data property`);
    }
    
    // Remove data URI prefix if present
    if (cleanedData.startsWith('data:image/')) {
      cleanedData = cleanedData.split(',')[1] || cleanedData;
    }
    
    // Remove ALL whitespace
    cleanedData = cleanedData.replace(/\s/g, '');
    
    // Validate cleaned data
    if (!cleanedData || cleanedData.length < 100) {
      throw new Error(`Image ${index} has invalid base64 data after cleaning`);
    }

    return {
      inlineData: {
        data: cleanedData,
        mimeType: img.mimeType || 'image/jpeg'
      }
    };
  });

  // Build comprehensive prompt (same as stdio-server.js)
  const prompt = `Analyze this flight booking screenshot and return ONLY a valid JSON object in the exact structure below:

{
  "tripType": "one_way" | "round_trip",
  "cabinClass": "economy" | "premium_economy" | "business" | "first",
  "passengers": {
    "adults": NUMBER,
    "children": NUMBER,
    "infants": NUMBER
  },
  "outboundSegments": [
    {
      "airline": "AIRLINE_NAME" | null,
      "flightNumber": "FULL_FLIGHT_NUMBER_WITH_PREFIX" | null,
      "departure": "DEPARTURE_AIRPORT_CODE" | null,
      "arrival": "ARRIVAL_AIRPORT_CODE" | null, 
      "departureTime": "HH:MM" | null,
      "arrivalTime": "HH:MM" | null,
      "date": "YYYY-MM-DD" | null,
      "flightDuration": "HH:MM" | null
    }
  ],
  "returnSegments": [],
  "totalPrice": NUMBER | null,
  "currency": "CURRENCY_CODE" | null
}

CRITICAL: Use JSON null (not the string "null") for missing values!

CRITICAL: PRICE & CURRENCY
Extract total price in any format (€299, $450, £320, ¥50000, 299.99 etc).
Detect symbols (€, $, £, ¥, CHF, CAD…) or codes (EUR, USD, GBP, JPY…).
Look for labels: Total, Price, Fare, Cost, Amount.
If multiple prices, pick the cheapest. If per-person, multiply by passenger count.
Currency must be 3-letter ISO code:
- If currency symbol "$" is visible → default to "USD"
- If currency symbol "€" is visible → default to "EUR"
- For other symbols, also convert to ISO code on the most likely symbol (e.g., £ → GBP, ¥ → JPY)
- If not visible or ambiguous → JSON null (NOT the string "null").
If price not visible → totalPrice: JSON null (NOT the string "null").

EXTRACTION RULES

Trip type: one_way or round_trip.
Cabin class: detect Economy, Business, Premium, First. Default economy.
Passengers: extract counts carefully:
- Look for explicit passenger count indicators: "2 adults", "2 passengers", "per person", "total for X people"
- If you see per-person price and total price (e.g., "$249/person, $497 total"), calculate passenger count: totalPrice ÷ perPersonPrice = passenger count
- Do NOT default to 1 adult if passenger count is clearly visible in the screenshot
- Only default {"adults":1,"children":0,"infants":0} if passenger count is truly unclear.
Segments - CRITICAL: Extract ALL flights visible in the screenshot:
- You MUST extract every flight segment you see, even if there are multiple flights
- Look for ALL flight information blocks, cards, or sections in the image
- Do NOT stop after extracting the first flight - continue until you've extracted all visible flights

ROUND-TRIP vs ONE-WAY CLASSIFICATION:
- ROUND-TRIP: If you see flights going from A → B AND B → A (returns to origin), classify as round_trip
- If the second flight's arrival airport matches the first flight's departure airport → it's a return flight (round-trip)
- Example: LGW → ATH (first flight), ATH → LGW (second flight) = round_trip (LGW is origin, second flight returns to LGW)
- Look for visual indicators: "Flight to [City]" and "Flight to [Origin City]", "Return", "Back", "Round trip"
- IGNORE text that says "One-way tickets" - this is just explaining pricing structure, NOT the trip type
- If you see two separate flights going in opposite directions → it's round_trip
- ONE-WAY: Only if you see flights going A → B → C (all in same direction, never returning to origin)

SEGMENT CLASSIFICATION RULES:
- Outbound segments = all flights from origin city to destination city (including connections)
- Return segments = all flights from destination city back to origin city (including connections)
- If you see "Flight to Athens" and "Flight to London" on the same booking → it's round_trip
- Use labels (Outbound, Return, Andata e ritorno, Aller et retour…), logical flow, and airport matching
Airline: prefer two-letter code near flight number, else full name; if unclear → JSON null (NOT the string "null").
Flight number: extract the COMPLETE flight number including airline prefix (e.g., "DY816" from Norwegian DY816, "U2123" from United Express U2123, "W46011" from Wizz Air Malta W46011). Include any letters or digits that appear before the numeric part. Examples: "BA553" → "BA553", "DY816" → "DY816", "U2123" → "U2123", "FR100" → "FR100". If unclear → JSON null (NOT the string "null").
Airports: 3-letter IATA; if unclear → JSON null (NOT the string "null").
Times: 24-hour HH:MM format. CRITICAL TIME EXTRACTION RULES:
- ALWAYS look for and respect AM/PM indicators in the screenshot
- If you see "PM" written next to a time, it is PM - convert to 24-hour by adding 12 hours
- If you see "AM" written next to a time, it is AM - keep the same hour (except 12:XX AM becomes 00:XX)
- CRITICAL: If you see a time with "+1" or "+2" suffix (e.g., "1:55 PM+1", "8:40 PM+1"), the "+1" indicates next-day arrival, but you MUST still respect the PM/AM indicator
- CRITICAL: "1:55 PM+1" means 1:55 PM the next day = 13:55, NOT 01:55
- CRITICAL: "8:40 PM+1" means 8:40 PM the next day = 20:40, NOT 08:40
- The "+1" suffix does NOT mean to ignore PM - if you see "PM", convert it: 1:55 PM = 13:55
- Convert 12-hour to 24-hour format correctly:
  * 1:55 PM → 13:55 (add 12 hours)
  * 10:45 PM → 22:45 (add 12 hours)
  * 11:45 PM → 23:45 (add 12 hours)
  * 12:00 PM → 12:00 (noon stays 12:00)
  * 1:55 AM → 01:55 (keep same)
  * 12:00 AM → 00:00 (midnight becomes 00:00)
- Examples with +1 suffix: "1:55 PM+1" → 13:55, "8:40 PM+1" → 20:40
- If you see a time with AM/PM indicator, extract it correctly in 24-hour format - do NOT ignore the AM/PM indicator
- If AM/PM indicator is unclear or missing, mark as lower confidence but still extract the time
- If unclear → JSON null (NOT the string "null").
Dates: Format YYYY-MM-DD.

Today = ${currentDate}, year = ${currentYear}.
If year missing: if month/day ≥ today → ${currentYear}; if earlier → ${currentYear + 1}.

Never return past dates. If unclear → JSON null (NOT the string "null").
Flight duration: convert 22h 30m → 22:30, 1d 2h 30m → 26:30; if unclear → JSON null (NOT the string "null").

SAFER DEFAULTS - USE IF NO CONTRASTING INFORMATION IS VISIBLE
cabinClass: economy
passengers: {"adults":1,"children":0,"infants":0}
All unclear fields → JSON null (not the string "null")

ABSOLUTELY CRITICAL

Never guess or invent values.
Use JSON null (not the string "null") for missing/unclear values.
If no flight details at all (irrelevant screenshot), return every field as JSON null.
Return ONLY the JSON object, no extra text.`;

  try {
    // Build payload with text and images
    const payloadToSend = {
      contents: [
        {
          parts: [
            { text: prompt },
            ...imageParts
          ]
        }
      ]
    };

    // Add timeout to Gemini API call (60 seconds for larger images)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 60 seconds')), 60000)
    );

    const startTime = Date.now();
    console.log(`📤 Sending payload with ${imageParts.length} image(s) to Gemini...`);

    const result = await Promise.race([
      model.generateContent(payloadToSend),
      timeoutPromise
    ]);
    const endTime = Date.now();

    console.log(`⏰ Gemini API call completed in ${endTime - startTime}ms`);

    const text = result.response.text() || '';
    console.log('📥 Received response from Gemini API, length:', text.length);
    
    // Try to parse the JSON response
    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      
      // Check if the response contains flight-related content
      if (!cleanedText.includes('tripType') && !cleanedText.includes('outboundSegments')) {
        return {
          error: 'No flight details found in the image(s). Please upload a flight booking screenshot or itinerary.'
        };
      }
      
      let parsed = JSON.parse(cleanedText);
      console.log('✅ Successfully parsed JSON');
      
      // Apply post-processing functions
      // 1. Convert airline names to IATA codes
      parsed = convertAirlineNamesToIataCodes(parsed);
      console.log('🔄 Converted airline names to IATA codes');
      
      // 2. Normalize dates to resolve missing years and avoid past dates
      parsed = fixPastDates(parsed, currentYear, currentDate);
      console.log('🔄 Normalized dates');
      
      // 3. Detect round trip pattern if segments form A → B → A
      const isRoundTripPattern = detectRoundTripPattern(
        parsed.outboundSegments || [],
        parsed.returnSegments || []
      );
      
      if (isRoundTripPattern && parsed.tripType !== 'round_trip') {
        console.log('🔄 Detected round trip pattern, updating tripType');
        parsed.tripType = 'round_trip';
        
        // Split segments into outbound and return based on pattern
        const allSegments = [...(parsed.outboundSegments || [])];
        const firstSegment = allSegments[0];
        const origin = firstSegment?.departure;
        
        if (origin) {
          const outboundSegs = [];
          const returnSegs = [];
          let foundReturn = false;
          
          for (const seg of allSegments) {
            if (!foundReturn && seg.arrival !== origin) {
              outboundSegs.push(seg);
            } else {
              foundReturn = true;
              returnSegs.push(seg);
            }
          }
          
          parsed.outboundSegments = outboundSegs;
          parsed.returnSegments = returnSegs;
        }
      }
      
      return parsed;
    } catch (parseError) {
      console.error('❌ Failed to parse JSON response:', parseError);
      return {
        error: `Failed to parse flight details from image. Please ensure the image contains a clear flight booking screenshot.`,
        details: parseError.message
      };
    }
  } catch (error) {
    console.error('❌ Error analyzing images:', error);
    return {
      error: `Failed to analyze images: ${error.message}`,
      details: error.message
    };
  }
}

// Helper function to normalize dates and fix past dates
function fixPastDates(data, currentYear, currentDateISO) {
  const today = currentDateISO ? new Date(currentDateISO) : new Date();
  const todayMonth = today.getMonth() + 1; // 1-12
  const todayDay = today.getDate(); // 1-31

  const toTwo = (n) => (n < 10 ? `0${n}` : String(n));

  const resolveMonthName = (mon) => {
    const map = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
    };
    const key = mon.trim().toLowerCase();
    return map[key] ?? null;
  };

  const normalizeDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return dateString;
    const trimmed = dateString.trim();

    // Case 1: Full ISO date
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, yearStr, mm, dd] = isoMatch;
      const yearNum = parseInt(yearStr, 10);
      if (yearNum < currentYear) {
        console.log(`🔄 Fixing past year in date: ${trimmed} → ${currentYear}-${mm}-${dd}`);
        return `${currentYear}-${mm}-${dd}`;
      }
      return trimmed;
    }

    // Case 2: Numeric month-day without year: MM-DD or M-D
    const mdMatch = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (mdMatch) {
      const monthNum = Math.min(12, Math.max(1, parseInt(mdMatch[1], 10)));
      const dayNum = Math.min(31, Math.max(1, parseInt(mdMatch[2], 10)));
      let yearForDate = currentYear;
      if (monthNum < todayMonth || (monthNum === todayMonth && dayNum < todayDay)) {
        yearForDate = currentYear + 1;
      }
      return `${yearForDate}-${toTwo(monthNum)}-${toTwo(dayNum)}`;
    }

    // Case 3: Month-name and day without year: e.g., "Sep 16" or "September 5"
    const mNameMatch = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})$/);
    if (mNameMatch) {
      const monthResolved = resolveMonthName(mNameMatch[1]);
      const dayNum = Math.min(31, Math.max(1, parseInt(mNameMatch[2], 10)));
      if (monthResolved) {
        let yearForDate = currentYear;
        if (monthResolved < todayMonth || (monthResolved === todayMonth && dayNum < todayDay)) {
          yearForDate = currentYear + 1;
        }
        return `${yearForDate}-${toTwo(monthResolved)}-${toTwo(dayNum)}`;
      }
    }

    // Unknown format: return as-is
    return dateString;
  };

  // Normalize outbound segments
  if (data.outboundSegments) {
    data.outboundSegments = data.outboundSegments.map(segment => ({
      ...segment,
      date: normalizeDate(segment.date)
    }));
  }

  // Normalize return segments
  if (data.returnSegments) {
    data.returnSegments = data.returnSegments.map(segment => ({
      ...segment,
      date: normalizeDate(segment.date)
    }));
  }

  return data;
}

// Helper function to detect round trip pattern (returns to origin)
function detectRoundTripPattern(outboundSegments, returnSegments) {
  const allSegments = [
    ...(outboundSegments || []),
    ...(returnSegments || [])
  ].filter(segment =>
    segment.departure &&
    segment.arrival &&
    typeof segment.departure === 'string' &&
    typeof segment.arrival === 'string' &&
    segment.departure.length === 3 &&
    segment.arrival.length === 3
  );

  // Need at least 2 segments to form a round trip
  if (allSegments.length < 2) {
    return false;
  }

  // Find the origin airport (departure of the first segment)
  const firstSegment = allSegments[0];
  const origin = firstSegment.departure.toUpperCase();

  // Check if any segment arrives back at the origin
  for (let i = 0; i < allSegments.length; i++) {
    const segment = allSegments[i];
    const arrival = segment.arrival.toUpperCase();

    // If any segment arrives at the origin (and it's not the first segment starting from origin),
    // we have a round trip
    if (arrival === origin) {
      const route = allSegments
        .map(s => `${s.departure.toUpperCase()} → ${s.arrival.toUpperCase()}`)
        .join(', ');
      console.log(`✅ Round trip detected: ${route} (returns to origin ${origin})`);
      return true;
    }
  }

  return false;
}

// Simplified airline code conversion function
function convertAirlineNameToIataCode(airlineName) {
  if (!airlineName) return '';
  
  // If already a 2-3 letter code, return uppercase
  if ((airlineName.length === 2 || airlineName.length === 3) && /^[A-Z]{2,3}$/i.test(airlineName)) {
    return airlineName.toUpperCase();
  }

  // Common airline name to IATA code mapping
  const airlineMap = {
    'ita airways': 'AZ',
    'lufthansa': 'LH',
    'british airways': 'BA',
    'air france': 'AF',
    'swiss': 'LX',
    'swiss international': 'LX',
    'klm': 'KL',
    'emirates': 'EK',
    'american airlines': 'AA',
    'united airlines': 'UA',
    'delta': 'DL',
    'qatar airways': 'QR',
    'singapore airlines': 'SQ',
    'cathay pacific': 'CX',
    'japan airlines': 'JL',
    'ana': 'NH',
    'norwegian': 'DY',
    'wizz air': 'W6',
    'ryanair': 'FR',
    'easyjet': 'U2',
    'alitalia': 'AZ',
    'turkish airlines': 'TK',
    'ethiopian airlines': 'ET',
    'air canada': 'AC',
    'australia': 'QF',
    'qantas': 'QF'
  };

  const normalized = airlineName.toLowerCase().trim();
  
  // Direct match
  if (airlineMap[normalized]) {
    return airlineMap[normalized];
  }

  // Partial match (contains airline name)
  for (const [key, code] of Object.entries(airlineMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return code;
    }
  }

  // Try to extract from flight number (e.g., "AZ573" -> "AZ")
  const flightNumberMatch = airlineName.match(/^([A-Z]{2,3})\d+/i);
  if (flightNumberMatch) {
    return flightNumberMatch[1].toUpperCase();
  }

  // Return as-is if no match found
  return airlineName;
}

// Extract airline code from flight number (Phase 1 extraction)
function extractAirlineCodeFromFlightNumber(flightNumber) {
  if (!flightNumber || typeof flightNumber !== 'string') {
    return null;
  }
  
  // Normalize: remove spaces, dashes, convert to uppercase
  const normalized = flightNumber.replace(/[\s-]/g, '').toUpperCase().trim();
  
  if (normalized.length < 2) {
    return null;
  }
  
  // Extract first 2 characters
  const firstTwo = normalized.substring(0, 2);
  
  // Check if at least one character is a letter
  const hasLetter = /[A-Z]/.test(firstTwo);
  
  if (!hasLetter) {
    return null;
  }
  
  // Return the 2-character code
  return firstTwo;
}

// Helper function to convert airline names to IATA codes in extracted data
function convertAirlineNamesToIataCodes(data) {
  console.log('🔧 Converting airline names to IATA codes...');

  // Process outbound segments
  if (data.outboundSegments && Array.isArray(data.outboundSegments)) {
    data.outboundSegments = data.outboundSegments.map((segment, index) => {
      // Phase 1: Try to extract airline code from flight number
      let iataCode = null;
      if (segment.flightNumber) {
        iataCode = extractAirlineCodeFromFlightNumber(segment.flightNumber);
        if (iataCode) {
          console.log(`  ✈️ Outbound ${index + 1}: Phase 1 - Extracted "${iataCode}" from flight number "${segment.flightNumber}"`);
        }
      }
      
      // Phase 2: Fallback to airline name lookup if Phase 1 didn't work
      if (!iataCode && segment.airline && segment.airline !== 'null' && segment.airline !== 'undefined' && segment.airline !== 'N/A') {
        const originalAirline = segment.airline;
        iataCode = convertAirlineNameToIataCode(segment.airline);
        console.log(`  ✈️ Outbound ${index + 1}: Phase 2 - Converted "${originalAirline}" -> "${iataCode}"`);
      }
      
      return {
        ...segment,
        airline: iataCode || ''
      };
    });
  }

  // Process return segments
  if (data.returnSegments && Array.isArray(data.returnSegments)) {
    data.returnSegments = data.returnSegments.map((segment, index) => {
      let iataCode = null;
      if (segment.flightNumber) {
        iataCode = extractAirlineCodeFromFlightNumber(segment.flightNumber);
        if (iataCode) {
          console.log(`  ✈️ Return ${index + 1}: Phase 1 - Extracted "${iataCode}" from flight number "${segment.flightNumber}"`);
        }
      }
      if (!iataCode && segment.airline && segment.airline !== 'null' && segment.airline !== 'undefined' && segment.airline !== 'N/A') {
        const originalAirline = segment.airline;
        iataCode = convertAirlineNameToIataCode(segment.airline);
        console.log(`  ✈️ Return ${index + 1}: Phase 2 - Converted "${originalAirline}" -> "${iataCode}"`);
      }
      return {
        ...segment,
        airline: iataCode || ''
      };
    });
  }

  return data;
}

// Helper function to check if extracted flight data is complete
function isExtractedDataComplete(extractedData) {
  // Check if we have basic structure
  if (!extractedData) {
    return false;
  }
  
  // Check outbound segments
  if (!extractedData.outboundSegments || !Array.isArray(extractedData.outboundSegments) || extractedData.outboundSegments.length === 0) {
    return false;
  }
  
  // Check each outbound segment for required fields
  for (const segment of extractedData.outboundSegments) {
    if (!segment.airline || segment.airline === null) return false;
    if (!segment.flightNumber || segment.flightNumber === null) return false;
    if (!segment.departure || segment.departure === null) return false;
    if (!segment.arrival || segment.arrival === null) return false;
    if (!segment.date || segment.date === null) return false;
    if (!segment.departureTime || segment.departureTime === null) return false;
    if (!segment.arrivalTime || segment.arrivalTime === null) return false;
  }
  
  // Check return segments (for round trips)
  if (extractedData.tripType === 'round_trip') {
    if (!extractedData.returnSegments || !Array.isArray(extractedData.returnSegments) || extractedData.returnSegments.length === 0) {
      return false;
    }
    
    for (const segment of extractedData.returnSegments) {
      if (!segment.airline || segment.airline === null) return false;
      if (!segment.flightNumber || segment.flightNumber === null) return false;
      if (!segment.departure || segment.departure === null) return false;
      if (!segment.arrival || segment.arrival === null) return false;
      if (!segment.date || segment.date === null) return false;
      if (!segment.departureTime || segment.departureTime === null) return false;
      if (!segment.arrivalTime || segment.arrivalTime === null) return false;
    }
  }
  
  // Check passenger information (must have at least adults count)
  if (!extractedData.passengers || extractedData.passengers.adults === null || extractedData.passengers.adults === undefined) {
    return false;
  }
  
  // Check cabin class
  if (!extractedData.cabinClass || extractedData.cabinClass === null) {
    return false;
  }
  
  // Check price and currency (required for price comparison)
  if (extractedData.totalPrice === null || extractedData.totalPrice === undefined) {
    return false;
  }
  
  if (!extractedData.currency || extractedData.currency === null) {
    return false;
  }
  
  return true;
}

// Helper function to transform extracted data to the format expected by flight_pricecheck
function transformExtractedToFlightData(extractedData) {
  const transformedData = {
    trip: {
      legs: [],
      travelClass: extractedData.cabinClass?.toUpperCase() || 'ECONOMY',
      adults: extractedData.passengers?.adults || 1,
      children: extractedData.passengers?.children || 0,
      infantsInSeat: extractedData.passengers?.infants || 0,
      infantsOnLap: 0
    },
    source: 'IMAGE_EXTRACTION',
    price: extractedData.totalPrice?.toString() || '0.00',
    currency: extractedData.currency || 'EUR',
    location: 'IT'
  };
  
  // Transform outbound segments
  if (extractedData.outboundSegments && extractedData.outboundSegments.length > 0) {
    transformedData.trip.legs.push({
      segments: extractedData.outboundSegments.map(segment => ({
        airline: segment.airline || null,
        flightNumber: segment.flightNumber || null,
        departureAirport: segment.departure || null,
        arrivalAirport: segment.arrival || null,
        departureDate: segment.date || null,
        departureTime: segment.departureTime || null,
        arrivalTime: segment.arrivalTime || null,
        plusDays: 0
      }))
    });
  }
  
  // Transform return segments
  if (extractedData.returnSegments && extractedData.returnSegments.length > 0) {
    transformedData.trip.legs.push({
      segments: extractedData.returnSegments.map(segment => ({
        airline: segment.airline || null,
        flightNumber: segment.flightNumber || null,
        departureAirport: segment.departure || null,
        arrivalAirport: segment.arrival || null,
        departureDate: segment.date || null,
        departureTime: segment.departureTime || null,
        arrivalTime: segment.arrivalTime || null,
        plusDays: 0
      }))
    });
  }
  
  return transformedData;
}

// Enable CORS for MCP clients
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

// MCP server metadata endpoint (GET /mcp)
app.get('/mcp', (req, res) => {
  res.json({
    name: 'navifare-mcp',
    version: '0.1.0',
    description: 'Flight price discovery and comparison service. Users should provide flight details conversationally, which will be structured into the required format.',
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
        name: 'extract_flight_from_image',
        description: 'Extract flight details from one or more booking screenshots/images. Upload images of flight bookings, itineraries, or confirmation emails. The tool will extract flight information and return it. If the data is complete, use it to call flight_pricecheck. If incomplete, use format_flight_pricecheck_request to ask the user for missing details. ⚠️ CRITICAL: Images MUST be provided as base64-encoded strings. File IDs, file paths, or URLs will NOT work and will cause the tool to fail. You MUST convert images to base64 encoding before calling this tool.',
        inputSchema: {
          type: 'object',
          properties: {
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  data: {
                    type: 'string',
                    description: '⚠️ CRITICAL REQUIREMENT: Image data MUST be a base64-encoded string. NO OTHER FORMAT WILL WORK. Do NOT send file IDs (like "file_000000009ca4720aaf20f16309d0c674"), file paths (like "/mnt/data/image.png"), or URLs. These will be rejected and the tool will fail. Format: Provide ONLY the raw base64 string without any data URI prefix. Example CORRECT: "iVBORw0KGgoAAAANSUhEUgAA..." (just the base64 characters). Example INCORRECT: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." (has prefix - will fail). Example INCORRECT: "file_000000009ca4720aaf20f16309d0c674" (file ID - will fail). Example INCORRECT: "/mnt/data/image.png" (file path - will fail). If you have an image file, you MUST: 1) Read the file content, 2) Convert it to base64 encoding, 3) Provide ONLY the base64 string (no prefix, no file path, no file ID).'
                  },
                  mimeType: {
                    type: 'string',
                    description: 'MIME type of the image. Required values: "image/png", "image/jpeg", "image/jpg", "image/webp", or "image/gif". Must match the actual image format.'
                  }
                },
                required: ['data', 'mimeType']
              },
              minItems: 1,
              description: 'Array of images to analyze for flight details. ⚠️ CRITICAL: Each image MUST have base64-encoded data. File paths or file IDs will NOT work and will be rejected.'
            }
          },
          required: ['images']
        }
      },
      {
        name: 'format_flight_pricecheck_request',
        description: 'Parse flight details from natural language text or transcribed image content to format them for price comparison. Use this when: 1) The user mentions a specific flight they found and wants to check for better prices, 2) The user uploads flight booking screenshots/images - YOU MUST first transcribe the image contents to text (read all text visible in the image including flight numbers, airlines, dates, times, airports, prices, etc.), then call this tool with the transcribed text. This tool will parse and format the request, asking follow-up questions if information is missing. Once complete, use the returned flightData to call flight_pricecheck. IMPORTANT: This tool is stateless - each call is independent and does not retain previous context. If you receive a needsMoreInfo response and need to provide missing data, you MUST include the complete previous flight details along with the missing information in the user_request field, otherwise Gemini will not have the flight context.',
        inputSchema: {
          type: 'object',
          properties: {
            user_request: { type: 'string', description: 'Flight details in natural language text. If the user uploaded an image, YOU MUST first transcribe ALL visible text from the image (flight numbers, airlines, airports, dates, times, prices, passenger counts, etc.) into text format, then provide that transcribed text here. Example: "I found flight AZ 573 from ZRH to FCO on November 19th at 7:15 PM, arriving at 8:45 PM, for 200 EUR. Round trip returning AZ 572 from FCO to ZRH on November 22nd at 8:20 AM, arriving at 9:55 AM." Include all details you can see in the image. IMPORTANT: If providing missing data after a needsMoreInfo response, include the complete previous flight details along with the missing fields so Gemini has full context.' }
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
    // Validate request format
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      });
      return;
    }
    
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
      // Valid sources: MANUAL, KAYAK, GOOGLE_FLIGHTS, BOOKING, MCP, IMAGE_EXTRACTION
      if (args.source && typeof args.source === 'string') {
        const validSources = ['MANUAL', 'KAYAK', 'GOOGLE_FLIGHTS', 'BOOKING', 'MCP', 'IMAGE_EXTRACTION'];
        if (!validSources.includes(args.source.toUpperCase())) {
          args.source = 'MANUAL'; // Default to MANUAL for unknown sources
        } else {
          args.source = args.source.toUpperCase(); // Normalize to uppercase
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
      // Return list of available tools directly
      const tools = [
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
          name: 'extract_flight_from_image',
          description: 'Extract flight details from one or more booking screenshots/images. Upload images of flight bookings, itineraries, or confirmation emails. The tool will extract flight information and return it. If the data is complete, use it to call flight_pricecheck. If incomplete, use format_flight_pricecheck_request to ask the user for missing details. ⚠️ CRITICAL: Images MUST be provided as base64-encoded strings. File IDs, file paths, or URLs will NOT work and will cause the tool to fail. You MUST convert images to base64 encoding before calling this tool.',
          inputSchema: {
            type: 'object',
            properties: {
              images: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'string',
                      description: '⚠️ CRITICAL REQUIREMENT: Image data MUST be a base64-encoded string. NO OTHER FORMAT WILL WORK. Do NOT send file IDs (like "file_000000009ca4720aaf20f16309d0c674"), file paths (like "/mnt/data/image.png"), or URLs. These will be rejected and the tool will fail. Format: Provide ONLY the raw base64 string without any data URI prefix. Example CORRECT: "iVBORw0KGgoAAAANSUhEUgAA..." (just the base64 characters). Example INCORRECT: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." (has prefix - will fail). Example INCORRECT: "file_000000009ca4720aaf20f16309d0c674" (file ID - will fail). Example INCORRECT: "/mnt/data/image.png" (file path - will fail). If you have an image file, you MUST: 1) Read the file content, 2) Convert it to base64 encoding, 3) Provide ONLY the base64 string (no prefix, no file path, no file ID).'
                    },
                    mimeType: {
                      type: 'string',
                      description: 'MIME type of the image. Required values: "image/png", "image/jpeg", "image/jpg", "image/webp", or "image/gif". Must match the actual image format.'
                    }
                  },
                  required: ['data', 'mimeType']
                },
                minItems: 1,
                description: 'Array of images to analyze for flight details. ⚠️ CRITICAL: Each image MUST have base64-encoded data. File paths or file IDs will NOT work and will be rejected.'
              }
            },
            required: ['images']
          }
        },
        {
          name: 'format_flight_pricecheck_request',
          description: 'Parse flight details from natural language text or transcribed image content to format them for price comparison. Use this when: 1) The user mentions a specific flight they found and wants to check for better prices, 2) The user uploads flight booking screenshots/images - YOU MUST first transcribe the image contents to text (read all text visible in the image including flight numbers, airlines, dates, times, airports, prices, etc.), then call this tool with the transcribed text. This tool will parse and format the request, asking follow-up questions if information is missing. Once complete, use the returned flightData to call flight_pricecheck. IMPORTANT: This tool is stateless - each call is independent and does not retain previous context. If you receive a needsMoreInfo response and need to provide missing data, you MUST include the complete previous flight details along with the missing information in the user_request field, otherwise Gemini will not have the flight context.',
          inputSchema: {
            type: 'object',
            properties: {
              user_request: { type: 'string', description: 'Flight details in natural language text. If the user uploaded an image, YOU MUST first transcribe ALL visible text from the image (flight numbers, airlines, airports, dates, times, prices, passenger counts, etc.) into text format, then provide that transcribed text here. Example: "I found flight AZ 573 from ZRH to FCO on November 19th at 7:15 PM, arriving at 8:45 PM, for 200 EUR. Round trip returning AZ 572 from FCO to ZRH on November 22nd at 8:20 AM, arriving at 9:55 AM." Include all details you can see in the image. IMPORTANT: If providing missing data after a needsMoreInfo response, include the complete previous flight details along with the missing fields so Gemini has full context.' }
            },
            required: ['user_request']
          }
        }
      ];
      
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: tools
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
      
      if (name === 'extract_flight_from_image') {
        console.log('📷 extract_flight_from_image tool called!');

        const images = args.images;
        
        // Optimize logging - avoid expensive operations on large base64 strings
        let totalDataSize = 0;
        const imageTypes = [];
        const imageSizes = [];
        if (images && images.length > 0) {
          for (let i = 0; i < images.length; i++) {
            imageTypes.push(images[i].mimeType);
            const size = images[i].data?.length || 0;
            imageSizes.push(size);
            totalDataSize += size;
          }
        }
        console.log('📊 Tool arguments:', {
          hasImages: !!images,
          imageCount: images?.length || 0,
          imageTypes: imageTypes,
          imageSizes: imageSizes,
          totalDataSize: totalDataSize
        });

        if (!images || images.length === 0) {
          result = {
            error: 'No images provided. Please provide at least one image.'
          };
        } else {
          console.log(`✅ Received ${images.length} image(s)`);

          // Process images: convert file paths to base64 if needed
          const processedImages = [];
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            
            if (!img.data || !img.mimeType) {
              continue;
            }
            
            let data = img.data || '';
            
            // Check if data is a file ID (some clients may pass file IDs like "file_000000009ca4720aaf20f16309d0c674")
            if (data.startsWith('file_') && data.length > 10) {
              console.error(`❌ Detected file ID instead of base64: ${data}`);
              continue; // Skip file IDs - the client must convert to base64 first
            }
            
            // Check if data is a file path (some clients may pass file paths)
            if (data.startsWith('/') || data.startsWith('./') || data.includes('/mnt/data/')) {
              console.log(`📁 Detected file path: ${data}, attempting to convert to base64...`);
              try {
                // Check if file exists
                if (fs.existsSync(data)) {
                  // Read file and convert to base64
                  const fileBuffer = fs.readFileSync(data);
                  data = fileBuffer.toString('base64');
                  console.log(`✅ Successfully converted file to base64 (${fileBuffer.length} bytes)`);
                } else {
                  console.error(`❌ File not found: ${data}. The client must convert images to base64 before sending.`);
                  continue;
                }
              } catch (fileError) {
                console.error(`❌ Error reading file ${data}:`, fileError.message);
                continue;
              }
            }
            
            // Remove data URI prefix if present
            if (data.startsWith('data:image/')) {
              data = data.split(',')[1] || data;
            }
            
            // Remove ALL whitespace
            data = data.replace(/\s/g, '');
            
            // Check if it looks like base64 data (at least 100 chars)
            if (data.length < 100) {
              console.warn(`⚠️ Image ${i + 1} data too short (${data.length} chars), skipping`);
              continue;
            }
            
            // Check if it's valid base64
            try {
              const decoded = Buffer.from(data, 'base64');
              
              if (decoded.length === 0) {
                console.warn(`⚠️ Image ${i + 1} decoded to empty buffer, skipping`);
                continue;
              }

              // Check file size (Gemini has limits, roughly 20MB per image)
              if (decoded.length > 20 * 1024 * 1024) {
                console.warn(`⚠️ Image ${i + 1} too large (${decoded.length} bytes), skipping`);
                continue;
              }

              // Add processed image
              processedImages.push({
                data: data,
                mimeType: img.mimeType
              });
            } catch (e) {
              console.error(`❌ Image ${i + 1} invalid base64:`, e.message);
              continue;
            }
          }
          
          // Validate that we have at least one valid image
          if (processedImages.length === 0) {
            const hasFileIds = images.some(img => img.data && img.data.startsWith('file_'));
            const hasFilePaths = images.some(img => img.data && (img.data.startsWith('/') || img.data.includes('/mnt/data/')));
            
            let errorMessage = 'No valid images provided. ';
            if (hasFileIds) {
              errorMessage += 'You provided file IDs (like "file_000000009ca4720aaf20f16309d0c674") instead of base64 data. The client MUST convert images to base64 encoding before calling this tool. Read the image file, encode it as base64, and provide only the base64 string (without any data URI prefix).';
            } else if (hasFilePaths) {
              errorMessage += 'You provided file paths, but the files are not accessible on the server. The client MUST convert images to base64 encoding before calling this tool. Read the image file, encode it as base64, and provide only the base64 string (without any data URI prefix).';
            } else {
              errorMessage += 'Please ensure images are provided as base64-encoded strings (not file IDs or file paths) with proper mimeType (image/png, image/jpeg, etc).';
            }
            
            result = {
              error: errorMessage
            };
          } else {
            console.log(`✅ Processed ${processedImages.length} valid image(s) out of ${images.length} provided`);
            
            try {
              // Extract flight details from images using Gemini
              console.log('🔍 About to call extractFlightDetailsFromImages...');
              const extractedData = await extractFlightDetailsFromImages(processedImages);
              console.log('✅ extractFlightDetailsFromImages completed successfully!');
              
              if (extractedData.error) {
                result = {
                  error: extractedData.error,
                  extractedData: extractedData
                };
              } else {
                // Check if the RAW extracted data is complete
                const isComplete = isExtractedDataComplete(extractedData);
                console.log(`📊 Extracted data completeness check: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
                
                if (isComplete) {
                  // Data is complete - transform and return it
                  const transformedData = transformExtractedToFlightData(extractedData);
                  console.log('✅ Flight details extracted successfully!');
                  
                  result = {
                    message: 'Flight details extracted successfully! The data is complete and ready for price comparison.',
                    extractedData: extractedData,
                    flightData: transformedData,
                    isComplete: true
                  };
                  console.log('✅ Returning complete flight data for flight_pricecheck tool');
                } else {
                  // Data is incomplete - pass it to format_flight_pricecheck_request
                  const missingFields = [];
                  if (!extractedData.passengers || extractedData.passengers.adults === null || extractedData.passengers.adults === undefined) {
                    missingFields.push('passengers (adults count)');
                  }
                  if (extractedData.totalPrice === null || extractedData.totalPrice === undefined) {
                    missingFields.push('total price');
                  }
                  if (!extractedData.currency || extractedData.currency === null) {
                    missingFields.push('currency');
                  }
                  
                  result = {
                    message: `Flight details extracted, but some information is missing: ${missingFields.join(', ')}. Call format_flight_pricecheck_request with user_request parameter containing the extractedData JSON below (paste it as a string) to ask the user for the missing details.`,
                    extractedData: extractedData,
                    isComplete: false,
                    missingFields: missingFields,
                    nextStep: 'Call format_flight_pricecheck_request with user_request parameter containing the extractedData JSON below (paste it as a string)'
                  };
                  console.log('⚠️ Returning incomplete flight data - should use format_flight_pricecheck_request');
                  console.log('📋 Missing fields:', missingFields.join(', '));
                }
              }
            } catch (extractError) {
              console.error('❌ Extraction Error:', extractError);
              result = {
                error: `Failed to extract flight details: ${extractError.message}`
              };
            }
          }
        }
      } else if (name === 'format_flight_pricecheck_request') {
        console.log('🚀 Starting format_flight_pricecheck_request...');
        
        // Validate that we have user_request
        if (!args.user_request) {
          throw new Error('user_request must be provided');
        }
        
        // Parse the user's natural language request (which may contain pasted extracted data)
        const parsedRequest = await parseFlightRequest(args.user_request);
        console.log('📊 Parsed request result:', parsedRequest.needsMoreInfo ? 'Needs more info' : 'Ready to proceed');
        
        if (parsedRequest.needsMoreInfo) {
          result = {
            message: parsedRequest.message + ' IMPORTANT: When providing the missing information, include the complete previous flight details (paste the full extracted data or previous request) along with the missing fields, as this tool does not retain context between calls.',
            needsMoreInfo: true,
            missingFields: parsedRequest.missingFields
          };
        } else {
          // Flight information parsed successfully - return formatted flightData for flight_pricecheck
          console.log('✅ Flight information parsed successfully!');
          console.log('📊 Parsed flight data:', JSON.stringify(parsedRequest.flightData, null, 2));
          
          // Determine source based on whether the request contains extracted data indicators
          const source = (args.user_request.includes('extracted') || args.user_request.includes('{"tripType"') || args.user_request.includes('outboundSegments')) 
            ? 'IMAGE_EXTRACTION' 
            : 'MCP';
          
          // Prepare flightData exactly as flight_pricecheck will use it
          const flightData = {
            ...parsedRequest.flightData,
            source: source
          };
          
          console.log('📤 Formatted flightData for flight_pricecheck:', JSON.stringify(flightData, null, 2));
          
          result = {
            message: 'Flight details parsed and formatted successfully! Use the flightData below to call flight_pricecheck.',
            flightData: flightData,
            readyForPriceCheck: true
          };
        }
      } else if (name === 'flight_pricecheck') {
        console.log('🔍 Processing flight_pricecheck tool...');
        
        // Get the flight data from the input
        const flightData = args.flightData;
        
        // Preserve the source from the formatted request (or default to MCP)
        const searchData = {
          ...flightData,
          source: flightData.source || 'MCP'
        };
        
        console.log('📤 Search flights payload:', JSON.stringify(searchData, null, 2));
        
        try {
          // Transform to API format and sanitize the request
          const apiRequest = transformToApiFormat(searchData);
          console.log('📤 API Request after transformation:', JSON.stringify(apiRequest, null, 2));
          const sanitizedRequest = sanitizeSubmitArgs(apiRequest);
          console.log('📤 API Request after sanitization:', JSON.stringify(sanitizedRequest, null, 2));
          
          // Define progress callback to stream results as they appear
          const onProgress = (progressResults) => {
            // Send progress notification via notifications/message
            const resultCount = progressResults.totalResults || progressResults.results?.length || 0;
            const status = progressResults.status || 'IN_PROGRESS';
            
            console.log(`📤 Streaming ${resultCount} result${resultCount !== 1 ? 's' : ''} (status: ${status})`);
          };
          
          const searchResult = await submit_and_poll_session(sanitizedRequest, onProgress);
          console.log('✅ Search complete:', JSON.stringify(searchResult, null, 2));
          
          // Store the flight data globally so the widget can access it
          global.lastFlightResults = searchResult;
          
          result = {
            message: `Flight price search completed! Found ${searchResult.totalResults || searchResult.results?.length || 0} result(s).`,
            searchResult: searchResult,
            status: searchResult.status || 'COMPLETED'
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
      
      // Format response
      const response = {
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
      
      // Debug: Log the response being sent
      console.log('📤 Sending response:', JSON.stringify(response, null, 2));
      
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
║  Ready for MCP client integration via ngrok!                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  console.log('\n📝 Next steps:');
  console.log('   1. Run: ngrok http 2091');
  console.log('   2. Copy the ngrok HTTPS URL');
  console.log('   3. Add /mcp to the end of the URL');
  console.log('   4. Configure in your MCP client settings\n');
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
