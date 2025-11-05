#!/usr/bin/env node

/**
 * Simple STDIO MCP Server for MCP Inspector
 * This is a working version that properly handles STDIO protocol
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { submit_session, submit_and_poll_session } from './dist/navifare.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Helper function to parse natural language flight requests using Gemini
async function parseFlightRequest(userRequest) {
  try {
            console.error('🔍 Starting Gemini request...');
            console.error('📝 User request:', userRequest);
            console.error('🔑 API key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 'Not set');
            console.error('🔑 API key starts with:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'Not set');

            const model = getGeminiAI().getGenerativeModel({ model: "gemini-2.5-flash" });
            console.error('🤖 Model initialized:', model);
    
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
        console.error(`🔄 Splitting round trip: first ${i} segments are outbound, remaining are return`);
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
      console.error(`❌ Image ${i} has invalid or too short base64 data (${data.length} chars)`);
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
        
        // Verify the base64 string is complete (not truncated)
        if (!finalBase64 || finalBase64.length < 100) {
          throw new Error(`Emergency optimized base64 is too short (${finalBase64?.length || 0} chars)`);
        }
        
        optimizedImages.push({
          data: finalBase64,
          mimeType: 'image/jpeg'
        });
      } else {
        // Verify the base64 string is complete (not truncated)
        if (!optimizedBase64 || optimizedBase64.length < 100) {
          throw new Error(`Optimized base64 is too short (${optimizedBase64?.length || 0} chars)`);
        }
        
        optimizedImages.push({
          data: optimizedBase64,
          mimeType: 'image/jpeg'
        });
      }

    } catch (error) {
      console.error(`❌ Failed to optimize image ${i}:`, error.message);
      
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
  console.error('🚀 extractFlightDetailsFromImages STARTED');
  console.error('📊 Input images count:', images.length);

  // Check API key first
  console.error('🔑 Checking Gemini API key...');
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set');
    return {
      error: 'Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.'
    };
  }
  console.error('✅ Gemini API key found, length:', process.env.GEMINI_API_KEY.length);

  const model = getGeminiAI().getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Get current date context
  const currentYear = new Date().getFullYear();
  const currentDate = new Date().toISOString().split('T')[0];
  console.error('📅 Current date context:', { currentYear, currentDate });

  // Optimize images before sending to Gemini
  console.error('🖼️ Starting image optimization...');
  const optimizedImages = await optimizeImagesForGemini(images);
  console.error('✅ Image optimization completed');

  // Check optimized size - be even more conservative
  const optimizedTotalSize = optimizedImages.reduce((sum, img) => sum + (img.data?.length || 0), 0);
  const maxOptimizedSize = 10 * 1024 * 1024; // 10MB after optimization
  if (optimizedTotalSize > maxOptimizedSize) {
    console.error(`❌ Even after optimization, total size too large (${optimizedTotalSize} chars, max ${maxOptimizedSize})`);
    return {
      error: `Images are still too large after optimization (${Math.round(optimizedTotalSize / 1024 / 1024)}MB). Please use smaller original images.`
    };
  }

  // If we have multiple images and they're still large, suggest using just one
  if (optimizedImages.length > 1 && optimizedTotalSize > 5 * 1024 * 1024) {
    console.error(`⚠️ Multiple images detected with large total size (${optimizedTotalSize} chars). Consider using fewer images.`);
  }

  // Convert optimized images to the format expected by Gemini
  const imageParts = optimizedImages.map((img, index) => {
    // Clean the base64 data thoroughly
    let cleanedData = img.data || '';
    
    // Validate we have data
    if (!cleanedData) {
      throw new Error(`Image ${index} has no data property`);
    }
    
    // Remove data URI prefix if present
    if (cleanedData.startsWith('data:image/')) {
      cleanedData = cleanedData.split(',')[1] || cleanedData;
    }
    
    // Remove ALL whitespace (spaces, newlines, tabs, etc.)
    cleanedData = cleanedData.replace(/\s/g, '');
    
    // Validate base64 data is not empty and has minimum length
    if (!cleanedData || cleanedData.length < 100) {
      console.error(`❌ Image ${index} has invalid base64 data (length: ${cleanedData?.length || 0})`);
      throw new Error(`Image ${index} has invalid or empty base64 data (only ${cleanedData?.length || 0} chars)`);
    }

    // Validate base64 format (check for proper padding and valid characters)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanedData)) {
      console.error(`❌ Image ${index} contains invalid base64 characters`);
      throw new Error(`Image ${index} contains invalid base64 characters`);
    }
    
    // Validate base64 can be decoded and represents a valid image
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(cleanedData, 'base64');
      if (imageBuffer.length === 0) {
        throw new Error('Decoded buffer is empty');
      }
    } catch (e) {
      console.error(`❌ Invalid base64 data for image ${index}: ${e.message}`);
      throw new Error(`Invalid base64 image data for image ${index}: ${e.message}`);
    }

    // Validate that the decoded buffer represents a valid image format
    // Check for PNG header: 89 50 4E 47 0D 0A 1A 0A
    // Check for JPEG header: FF D8 FF
    // Check for WebP header: RIFF ... WEBP
    const isPNG = imageBuffer.length >= 8 && 
      imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
      imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;
    
    const isJPEG = imageBuffer.length >= 3 && 
      imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF;
    
    const isWebP = imageBuffer.length >= 12 &&
      imageBuffer.slice(0, 4).toString() === 'RIFF' &&
      imageBuffer.slice(8, 12).toString() === 'WEBP';

    if (!isPNG && !isJPEG && !isWebP) {
      // Check if the base64 might be truncated by looking at the size
      // Truncated base64 might decode but not have valid image headers
      const looksTruncated = imageBuffer.length < 1000; // Suspiciously small for an image
      
      if (looksTruncated) {
        console.error(`❌ Image ${index} appears to be truncated (only ${imageBuffer.length} bytes)`);
        throw new Error(`Image ${index} appears to be truncated or incomplete. The base64 data is too short (${imageBuffer.length} bytes) or does not contain a valid image header. Please ensure the full image data is provided.`);
      }
      
      console.error(`❌ Image ${index} does not match any known image format (PNG, JPEG, or WebP)`);
      throw new Error(`Image ${index} does not appear to be a valid image format (PNG, JPEG, or WebP). The decoded data does not match any known image format headers.`);
    }
    
    return {
      inlineData: {
        data: cleanedData,
        mimeType: img.mimeType || 'image/jpeg'
      }
    };
  });
  
  // Check total payload size (all images combined)
  const totalImageSize = images.reduce((sum, img) => {
    const data = img.data.replace(/^data:image\/[^;]+;base64,/, '').replace(/\s/g, '');
    return sum + data.length;
  }, 0);

  // Gemini has limits on total request size (including prompt) - be more conservative
  const maxTotalSize = 30 * 1024 * 1024; // 30MB total (more conservative)
  if (totalImageSize > maxTotalSize) {
    console.error(`❌ Total image size too large (${totalImageSize} chars, max ${maxTotalSize})`);
    return {
      error: `Images are too large to process (${Math.round(totalImageSize / 1024 / 1024)}MB total). Please use smaller images or fewer images.`
    };
  }

  // Use the currentYear and currentDate already declared above
  
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
All unclear fields → JSON null (NOT the string "null")

ABSOLUTELY CRITICAL
Never guess or invent values.
Use JSON null (not the string "null") for missing/unclear values.
If no flight details at all (irrelevant screenshot), return every field as JSON null.
Return ONLY the JSON object, no extra text.`;

  try {
    console.error('🤖 Preparing Gemini API request...');
    // Log summary (avoid expensive reduce/map operations)
    console.error(`📊 Optimized ${optimizedImages.length} image(s), total size: ${optimizedTotalSize} chars`);

    // Quick validation before sending
    console.error(`🖼️ Preparing ${imageParts.length} image(s) for Gemini API...`);
    let totalSize = 0;
    for (let i = 0; i < imageParts.length; i++) {
      const part = imageParts[i];
      if (!part.inlineData?.data || part.inlineData.data.length < 100) {
        throw new Error(`Image part ${i} has invalid or truncated data (${part.inlineData?.data?.length || 0} chars)`);
      }
      totalSize += part.inlineData.data.length;
    }
    console.error(`✅ All images validated, total size: ${totalSize} chars`);

    console.error('🚀 Calling Gemini API...');
    const payloadToSend = [prompt, ...imageParts];

    // Add timeout to Gemini API call (60 seconds for larger images)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 60 seconds')), 60000)
    );

    const startTime = Date.now();
    console.error('⏰ Gemini API call starting at:', new Date().toISOString());
    console.error(`📤 Sending payload with ${imageParts.length} image(s) to Gemini...`);

    const result = await Promise.race([
      model.generateContent(payloadToSend),
      timeoutPromise
    ]);
    const endTime = Date.now();

    console.error(`⏰ Gemini API call completed in ${endTime - startTime}ms`);
    console.error('📥 Got result from Gemini API');

    const text = result.response.text() || '';
    console.error('📥 Received response from Gemini API, length:', text.length);
    console.error('📥 Response preview:', text.substring(0, 200) + '...');
    
    // Try to parse the JSON response
    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      console.error('🧹 Cleaned response text');
      
      // Check if the response contains flight-related content
      if (!cleanedText.includes('tripType') && !cleanedText.includes('outboundSegments')) {
        return {
          error: 'No flight details found in the image(s). Please upload a flight booking screenshot or itinerary.'
        };
      }
      
      let parsed = JSON.parse(cleanedText);
      console.error('✅ Successfully parsed JSON');
      
      // Apply post-processing functions (reused from geminiService.ts)
      // 1. Convert airline names to IATA codes
      parsed = convertAirlineNamesToIataCodes(parsed);
      console.error('🔄 Converted airline names to IATA codes');
      
      // 2. Normalize dates to resolve missing years and avoid past dates
      parsed = fixPastDates(parsed, currentYear, currentDate);
      console.error('🔄 Normalized dates');
      
      // 3. Detect round trip pattern if segments form A → B → A
      const isRoundTripPattern = detectRoundTripPattern(
        parsed.outboundSegments || [],
        parsed.returnSegments || []
      );
      
      if (isRoundTripPattern && parsed.tripType !== 'round_trip') {
        console.error('🔄 Detected A → B → A pattern, forcing round_trip');
        parsed.tripType = 'round_trip';
        
        // If round-trip was detected but returnSegments is empty, check if both flights are in outboundSegments
        // and split them appropriately
        if ((!parsed.returnSegments || parsed.returnSegments.length === 0) &&
            parsed.outboundSegments && parsed.outboundSegments.length >= 2) {
          const outbound = parsed.outboundSegments;
          const firstFlight = outbound[0];
          const origin = firstFlight.departure;
          
          // Check if any segment returns to origin
          for (let i = 1; i < outbound.length; i++) {
            if (outbound[i].arrival === origin) {
              // Found return flight - split segments
              console.error(`🔄 Splitting segments: first ${i} segments are outbound, remaining are return`);
              parsed.returnSegments = outbound.slice(i);
              parsed.outboundSegments = outbound.slice(0, i);
              break;
            }
          }
        }
      }
      
      console.error('✅ Post-processing completed');
      return parsed;
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      return {
        error: `Failed to parse flight details: ${parseError.message}. Raw response: ${text.substring(0, 500)}`
      };
    }
  } catch (error) {
    console.error('❌ Gemini API error occurred!');
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);

    // Check if it's a timeout error
    if (error.message && error.message.includes('timed out')) {
      console.error('⏰ This was a timeout error');
      return {
        error: 'The image analysis timed out. The image might be too complex or the service is busy. Please try with a simpler image or try again later.',
        details: error.message
      };
    }

    // Check if it's a Google Generative AI error
    if (error.message && error.message.includes('Unable to process input image')) {
      console.error('🖼️ This was an image processing error from Gemini');
      return {
        error: 'The image could not be processed by Gemini. The image data may be corrupted, truncated, or in an unsupported format. Please ensure the image is a valid PNG, JPEG, or WebP file and try again. If the problem persists, the image may be too large or corrupted.',
        extractedData: {
          error: 'Failed to analyze images: Unable to process input image',
          details: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting'
        }
      };
    }

    // Check if it's a quota/rate limit error
    if (error.message && (error.message.includes('quota') || error.message.includes('rate limit'))) {
      console.error('📊 This was a quota/rate limit error');
      return {
        error: 'Gemini API quota exceeded. Please try again later.',
        details: error.message
      };
    }

    // Check if it's an authentication error
    if (error.message && (error.message.includes('API_KEY') || error.message.includes('authentication'))) {
      console.error('🔑 This was an authentication error');
      return {
        error: 'Gemini API authentication failed. Please check your API key.',
        details: error.message
      };
    }

    console.error('❓ Unknown error type, returning generic error');
    return {
      error: `Failed to analyze images: ${error.message}`,
      details: error.message
    };
  }
}

// Helper function to normalize dates and fix past dates
// Reused from geminiService.ts - ensures dates are never in the past and resolves missing years
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
        console.error(`🔄 Fixing past year in date: ${trimmed} → ${currentYear}-${mm}-${dd}`);
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
// Reused from geminiService.ts
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
      console.error(`✅ Round trip detected: ${route} (returns to origin ${origin})`);
      return true;
    }
  }

  return false;
}

// Simplified airline code conversion function (fallback only - Phase 2)
// Converts common airline names to IATA codes (simplified version without full airline lookup)
function convertAirlineNameToIataCode(airlineName) {
  if (!airlineName) return '';
  
  // If already a 2-3 letter code, return uppercase
  if ((airlineName.length === 2 || airlineName.length === 3) && /^[A-Z]{2,3}$/i.test(airlineName)) {
    return airlineName.toUpperCase();
  }

  // Limited airline name to IATA code mapping (fallback only)
  // This is only used when flight number extraction fails
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

  // Return as-is if no match found
  return airlineName;
}

// Extract airline code from flight number (Phase 1 extraction)
// Extracts first 2 characters if at least one of them is a letter
// Examples: "U2123" → "U2", "AZ123" → "AZ", "A2123" → "A2", "9W123" → "9W"
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

// Clean flight number by extracting just the numeric part and stripping leading zeros
function cleanFlightNumber(flightNumber) {
  if (!flightNumber || typeof flightNumber !== 'string') {
    return '';
  }
  
  // Normalize: remove spaces, dashes, convert to uppercase
  const normalized = flightNumber.replace(/[\s-]/g, '').toUpperCase().trim();
  
  // Extract numeric part (everything after the airline code prefix)
  // Match pattern: 2-3 letters followed by numbers
  const match = normalized.match(/^[A-Z]{2,3}(\d+)$/);
  if (match) {
    const numericPart = match[1];
    // Strip leading zeros but keep at least one digit
    return numericPart.replace(/^0+/, '') || '0';
  }
  
  // Fallback: extract all digits if no letter prefix found
  const allDigits = normalized.replace(/\D/g, '');
  if (allDigits) {
    return allDigits.replace(/^0+/, '') || '0';
  }
  
  return '';
}

// Helper function to convert airline names to IATA codes in extracted data
// Uses Phase 1 extraction from flight number first, then falls back to airline name lookup
function convertAirlineNamesToIataCodes(data) {
  console.error('🔧 Converting airline names to IATA codes...');

  // Process outbound segments
  if (data.outboundSegments && Array.isArray(data.outboundSegments)) {
    data.outboundSegments = data.outboundSegments.map((segment, index) => {
      // Phase 1: Try to extract airline code from flight number
      let iataCode = null;
      let cleanedFlightNumber = segment.flightNumber;
      
      if (segment.flightNumber) {
        iataCode = extractAirlineCodeFromFlightNumber(segment.flightNumber);
        if (iataCode) {
          console.error(`  ✈️ Outbound ${index + 1}: Phase 1 - Extracted "${iataCode}" from flight number "${segment.flightNumber}"`);
          // Clean the flight number by removing the airline prefix
          cleanedFlightNumber = cleanFlightNumber(segment.flightNumber);
          if (cleanedFlightNumber !== segment.flightNumber) {
            console.error(`  ✈️ Outbound ${index + 1}: Cleaned flight number "${segment.flightNumber}" -> "${cleanedFlightNumber}"`);
          }
        }
      }
      
      // Phase 2: Fallback to airline name lookup if Phase 1 didn't work
      if (!iataCode && segment.airline && segment.airline !== 'null' && segment.airline !== 'undefined' && segment.airline !== 'N/A') {
        const originalAirline = segment.airline;
        iataCode = convertAirlineNameToIataCode(segment.airline);
        console.error(`  ✈️ Outbound ${index + 1}: Phase 2 - Converted "${originalAirline}" -> "${iataCode}"`);
      }
      
      return {
        ...segment,
        airline: iataCode || '',
        flightNumber: cleanedFlightNumber || segment.flightNumber || ''
      };
    });
  }

  // Process return segments
  if (data.returnSegments && Array.isArray(data.returnSegments)) {
    data.returnSegments = data.returnSegments.map((segment, index) => {
      // Phase 1: Try to extract airline code from flight number
      let iataCode = null;
      let cleanedFlightNumber = segment.flightNumber;
      
      if (segment.flightNumber) {
        iataCode = extractAirlineCodeFromFlightNumber(segment.flightNumber);
        if (iataCode) {
          console.error(`  ✈️ Return ${index + 1}: Phase 1 - Extracted "${iataCode}" from flight number "${segment.flightNumber}"`);
          // Clean the flight number by removing the airline prefix
          cleanedFlightNumber = cleanFlightNumber(segment.flightNumber);
          if (cleanedFlightNumber !== segment.flightNumber) {
            console.error(`  ✈️ Return ${index + 1}: Cleaned flight number "${segment.flightNumber}" -> "${cleanedFlightNumber}"`);
          }
        }
      }
      
      // Phase 2: Fallback to airline name lookup if Phase 1 didn't work
      if (!iataCode && segment.airline && segment.airline !== 'null' && segment.airline !== 'undefined' && segment.airline !== 'N/A') {
        const originalAirline = segment.airline;
        iataCode = convertAirlineNameToIataCode(segment.airline);
        console.error(`  ✈️ Return ${index + 1}: Phase 2 - Converted "${originalAirline}" -> "${iataCode}"`);
      }
      
      return {
        ...segment,
        airline: iataCode || '',
        flightNumber: cleanedFlightNumber || segment.flightNumber || ''
      };
    });
  }

  return data;
}

// Helper function to check if extracted flight data is complete
// This checks the RAW extracted data (before transformation with defaults)
function isExtractedDataComplete(extractedData) {
  console.error('🔍 isExtractedDataComplete: Starting completeness check');
  console.error('🔍 isExtractedDataComplete: Checking extractedData:', {
    hasExtractedData: !!extractedData,
    hasOutboundSegments: !!extractedData?.outboundSegments,
    outboundSegmentsLength: extractedData?.outboundSegments?.length || 0,
    tripType: extractedData?.tripType,
    hasPassengers: !!extractedData?.passengers,
    passengersAdults: extractedData?.passengers?.adults,
    passengersAdultsType: typeof extractedData?.passengers?.adults,
    passengersAdultsIsNull: extractedData?.passengers?.adults === null,
    passengersAdultsIsUndefined: extractedData?.passengers?.adults === undefined,
    cabinClass: extractedData?.cabinClass,
    cabinClassIsNull: extractedData?.cabinClass === null,
    totalPrice: extractedData?.totalPrice,
    totalPriceType: typeof extractedData?.totalPrice,
    totalPriceIsNull: extractedData?.totalPrice === null,
    totalPriceIsUndefined: extractedData?.totalPrice === undefined,
    currency: extractedData?.currency,
    currencyIsNull: extractedData?.currency === null
  });
  
  // Check if we have basic structure
  if (!extractedData) {
    console.error('❌ isExtractedDataComplete: Missing extractedData object');
    return false;
  }
  
  // Check outbound segments
  if (!extractedData.outboundSegments || !Array.isArray(extractedData.outboundSegments) || extractedData.outboundSegments.length === 0) {
    console.error('❌ isExtractedDataComplete: Missing or empty outboundSegments');
    return false;
  }
  
  // Check each outbound segment for required fields
  for (const segment of extractedData.outboundSegments) {
    if (!segment.airline || segment.airline === null) {
      console.error('❌ isExtractedDataComplete: Missing airline in outbound segment');
      return false;
    }
    if (!segment.flightNumber || segment.flightNumber === null) {
      console.error('❌ isExtractedDataComplete: Missing flightNumber in outbound segment');
      return false;
    }
    if (!segment.departure || segment.departure === null) {
      console.error('❌ isExtractedDataComplete: Missing departure in outbound segment');
      return false;
    }
    if (!segment.arrival || segment.arrival === null) {
      console.error('❌ isExtractedDataComplete: Missing arrival in outbound segment');
      return false;
    }
    if (!segment.date || segment.date === null) {
      console.error('❌ isExtractedDataComplete: Missing date in outbound segment');
      return false;
    }
    if (!segment.departureTime || segment.departureTime === null) {
      console.error('❌ isExtractedDataComplete: Missing departureTime in outbound segment');
      return false;
    }
    if (!segment.arrivalTime || segment.arrivalTime === null) {
      console.error('❌ isExtractedDataComplete: Missing arrivalTime in outbound segment');
      return false;
    }
  }
  
  // Check return segments (for round trips)
  if (extractedData.tripType === 'round_trip') {
    if (!extractedData.returnSegments || !Array.isArray(extractedData.returnSegments) || extractedData.returnSegments.length === 0) {
      console.error('❌ isExtractedDataComplete: Missing or empty returnSegments for round trip');
      return false;
    }
    
    for (const segment of extractedData.returnSegments) {
      if (!segment.airline || segment.airline === null) {
        console.error('❌ isExtractedDataComplete: Missing airline in return segment');
        return false;
      }
      if (!segment.flightNumber || segment.flightNumber === null) {
        console.error('❌ isExtractedDataComplete: Missing flightNumber in return segment');
        return false;
      }
      if (!segment.departure || segment.departure === null) {
        console.error('❌ isExtractedDataComplete: Missing departure in return segment');
        return false;
      }
      if (!segment.arrival || segment.arrival === null) {
        console.error('❌ isExtractedDataComplete: Missing arrival in return segment');
        return false;
      }
      if (!segment.date || segment.date === null) {
        console.error('❌ isExtractedDataComplete: Missing date in return segment');
        return false;
      }
      if (!segment.departureTime || segment.departureTime === null) {
        console.error('❌ isExtractedDataComplete: Missing departureTime in return segment');
        return false;
      }
      if (!segment.arrivalTime || segment.arrivalTime === null) {
        console.error('❌ isExtractedDataComplete: Missing arrivalTime in return segment');
        return false;
      }
    }
  }
  
  // Check passenger information (must have at least adults count)
  if (!extractedData.passengers || extractedData.passengers.adults === null || extractedData.passengers.adults === undefined) {
    console.error('❌ isExtractedDataComplete: Missing passengers or adults count');
    console.error('❌ isExtractedDataComplete: passengers:', extractedData.passengers);
    console.error('❌ isExtractedDataComplete: passengers.adults:', extractedData.passengers?.adults);
    return false;
  }
  
  // Check cabin class
  if (!extractedData.cabinClass || extractedData.cabinClass === null) {
    console.error('❌ isExtractedDataComplete: Missing cabinClass');
    return false;
  }
  
  // Check price and currency (required for price comparison)
  if (extractedData.totalPrice === null || extractedData.totalPrice === undefined) {
    console.error('❌ isExtractedDataComplete: Missing totalPrice');
    console.error('❌ isExtractedDataComplete: totalPrice value:', extractedData.totalPrice);
    console.error('❌ isExtractedDataComplete: totalPrice type:', typeof extractedData.totalPrice);
    return false;
  }
  
  if (!extractedData.currency || extractedData.currency === null) {
    console.error('❌ isExtractedDataComplete: Missing currency');
    console.error('❌ isExtractedDataComplete: currency value:', extractedData.currency);
    return false;
  }
  
  console.error('✅ isExtractedDataComplete: All checks passed - data is COMPLETE');
  return true;
}

// Helper function to transform extracted data to the format expected by flight_pricecheck
function transformExtractedToFlightData(extractedData) {
  // Transform the extracted data to match the expected format
  const transformedData = {
    trip: {
      legs: [],
      travelClass: extractedData.cabinClass?.toUpperCase() || 'ECONOMY',
      adults: extractedData.passengers?.adults || 1,
      children: extractedData.passengers?.children || 0,
      infantsInSeat: extractedData.passengers?.infants || 0,
      infantsOnLap: 0 // Default to 0 as this is rarely shown in screenshots
    },
    source: 'IMAGE_EXTRACTION',
    price: extractedData.totalPrice?.toString() || '0.00',
    currency: extractedData.currency || 'EUR',
    location: 'IT' // Default location
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
        plusDays: 0 // Default to 0
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
        plusDays: 0 // Default to 0
      }))
    });
  }
  
  return transformedData;
}

// Simple MCP server that just echoes back what it receives
process.stdin.setEncoding('utf8');

// Buffer for incomplete messages (STDIO receives data in chunks)
let inputBuffer = '';

process.stdin.on('data', async (data) => {
  // Append new data to buffer
  inputBuffer += data;
  
  // Process complete messages (separated by newlines)
  const lines = inputBuffer.split('\n');
  // Keep the last (potentially incomplete) line in the buffer
  inputBuffer = lines.pop() || '';
  
  // Process each complete line
  for (const line of lines) {
    if (!line.trim()) continue; // Skip empty lines
    
    let request;
    try {
      request = JSON.parse(line.trim());
      console.error('✅ JSON parsed successfully, method:', request.method);
      
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
              name: 'extract_flight_from_image',
              description: 'Extract flight details from one or more booking screenshots/images. Upload images of flight bookings, itineraries, or confirmation emails. The tool will extract flight information and return it. If the data is complete, use it to call flight_pricecheck. If incomplete, use format_flight_pricecheck_request to ask the user for missing details.',
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
                          description: 'Base64-encoded image data (without data:image/... prefix)'
                        },
                        mimeType: {
                          type: 'string',
                          description: 'MIME type of the image (e.g., image/jpeg, image/png)'
                        }
                      },
                      required: ['data', 'mimeType']
                    },
                    minItems: 1,
                    description: 'Array of images to analyze for flight details'
                  }
                },
                required: ['images']
              }
            },
            {
              name: 'format_flight_pricecheck_request',
              description: 'Parse flight details from natural language or extracted image data to format them for price comparison. Use this when the user mentions a specific flight they found and wants to check for better prices, or when extract_flight_from_image returns incomplete data. This tool will parse and format the request, asking follow-up questions if information is missing. Once complete, use the returned flightData to call flight_pricecheck. IMPORTANT: This tool is stateless - each call is independent and does not retain previous context. If you receive a needsMoreInfo response and need to provide missing data, you MUST include the complete previous flight details (from the extracted data or previous response) along with the missing information in the user_request field, otherwise Gemini will not have the flight context.',
              inputSchema: {
                type: 'object',
                properties: {
                  user_request: { type: 'string', description: 'Describe the specific flight you found and want to check for better prices (e.g., "I found LX 1612 from MXP to FCO on Nov 4th at 6:40 PM for 150 EUR"). You can also paste extracted data from extract_flight_from_image here if it\'s incomplete. IMPORTANT: If providing missing data after a needsMoreInfo response, include the complete previous flight details (e.g., paste the full extracted JSON and add the missing fields) so Gemini has full context.' }
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
        
        console.error(`🔧 Tool called: ${name}`);
        console.error('📝 Arguments received:', {
          hasImages: !!args.images,
          imageCount: args.images?.length || 0,
          hasFlightData: !!args.flightData,
          hasUserRequest: !!args.user_request
        });
        
        let result;
        
        if (name === 'extract_flight_from_image') {
            console.error('📷 extract_flight_from_image tool called!');

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
            console.error('📊 Tool arguments:', {
              hasImages: !!images,
              imageCount: images?.length || 0,
              imageTypes: imageTypes,
              imageSizes: imageSizes,
              totalDataSize: totalDataSize
            });

            if (!images || images.length === 0) {
              console.error('❌ No images provided');
              result = {
                error: 'No images provided. Please provide at least one image.'
              };
            } else {
              console.error(`✅ Received ${images.length} image(s)`);

              // Validate images first - this is fast and prevents hanging on bad data
              let hasValidImage = false;
              for (let i = 0; i < images.length; i++) {
                const img = images[i];
                
                // Check if image has valid structure
                if (!img.data || !img.mimeType) {
                  console.error(`❌ Image ${i} missing required fields (hasData: ${!!img.data}, hasMimeType: ${!!img.mimeType})`);
                  continue;
                }
                
                // Clean and validate base64 data
                let data = img.data || '';
                
                // Remove data URI prefix if present
                if (data.startsWith('data:image/')) {
                  data = data.split(',')[1] || data;
                }
                
                // Remove ALL whitespace
                data = data.replace(/\s/g, '');
                
                // Check if it looks like base64 data (at least 100 chars)
                if (data.length < 100) {
                  console.error(`❌ Image ${i} data too short (${data.length} chars)`);
                  continue;
                }
                
                // Check if it's valid base64
                try {
                  const decoded = Buffer.from(data, 'base64');
                  
                  // Verify decoded buffer is not empty
                  if (decoded.length === 0) {
                    continue;
                  }

                  // Check file size (Gemini has limits, roughly 20MB per image)
                  if (decoded.length > 20 * 1024 * 1024) {
                    console.error(`❌ Image ${i} too large (${decoded.length} bytes)`);
                    continue;
                  }

                  hasValidImage = true;
                } catch (e) {
                  console.error(`❌ Image ${i} invalid base64: ${e.message}`);
                  continue;
                }
              }
              
              if (!hasValidImage) {
                result = {
                  error: 'No valid images provided. Please ensure images are in base64 format with proper mimeType (image/png, image/jpeg, etc).'
                };
              } else {
                try {
                  // Extract flight details from images using Gemini
                  console.error('🔍 About to call extractFlightDetailsFromImages...');
                  const extractedData = await extractFlightDetailsFromImages(images);
                console.error('✅ extractFlightDetailsFromImages completed successfully!');
                
                if (extractedData.error) {
                  result = {
                    error: extractedData.error,
                    extractedData: extractedData
                  };
                } else {
                  // Log the raw extracted data before checking completeness
                  console.error('📋 Raw extracted data from Gemini:', JSON.stringify(extractedData, null, 2));
                  console.error('📋 Extracted data keys:', Object.keys(extractedData || {}));
                  console.error('📋 passengers object:', extractedData?.passengers);
                  console.error('📋 passengers.adults:', extractedData?.passengers?.adults);
                  console.error('📋 totalPrice:', extractedData?.totalPrice);
                  console.error('📋 currency:', extractedData?.currency);
                  
                  // Check if the RAW extracted data is complete (before transformation with defaults)
                  const isComplete = isExtractedDataComplete(extractedData);
                  console.error(`📊 Extracted data completeness check: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
                  
                  if (isComplete) {
                    // Data is complete - transform and return it so the model can call flight_pricecheck
                    const transformedData = transformExtractedToFlightData(extractedData);
                    console.error('✅ Flight details extracted successfully!');
                    
                    result = {
                      message: 'Flight details extracted successfully! The data is complete and ready for price comparison.',
                      extractedData: extractedData,
                      flightData: transformedData,
                      isComplete: true
                    };
                    console.error('✅ Returning complete flight data for flight_pricecheck tool');
                  } else {
                    // Data is incomplete - pass it to format_flight_pricecheck_request
                    // Identify what's missing for better user feedback
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
                    console.error('⚠️ Returning incomplete flight data - should use format_flight_pricecheck_request');
                    console.error('📋 Missing fields:', missingFields.join(', '));
                  }
                  console.error('✅ Tool execution completed successfully');
                  console.error('📤 Returning result:', JSON.stringify(result, null, 2));
                }
              } catch (extractError) {
                console.error('❌ Extraction Error:', extractError);
                console.error('❌ Error details:', extractError.message);
                result = {
                  error: `Failed to extract flight details: ${extractError.message}`
                };
              }
              }
            }
            console.error('🏁 extract_flight_from_image tool finished');
        } else if (name === 'format_flight_pricecheck_request') {
          console.error('🚀 Starting format_flight_pricecheck_request...');
          
          // Validate that we have user_request
          if (!args.user_request) {
            throw new Error('user_request must be provided');
          }
          
          // Parse the user's natural language request (which may contain pasted extracted data)
          const parsedRequest = await parseFlightRequest(args.user_request);
          console.error('📊 Parsed request result:', parsedRequest.needsMoreInfo ? 'Needs more info' : 'Ready to proceed');
          
          if (parsedRequest.needsMoreInfo) {
            result = {
              message: parsedRequest.message + ' IMPORTANT: When providing the missing information, include the complete previous flight details (paste the full extracted data or previous request) along with the missing fields, as this tool does not retain context between calls.',
              needsMoreInfo: true,
              missingFields: parsedRequest.missingFields
            };
          } else {
            // Flight information parsed successfully - return formatted flightData for flight_pricecheck
            console.error('✅ Flight information parsed successfully!');
            console.error('📊 Parsed flight data:', JSON.stringify(parsedRequest.flightData, null, 2));
            
            // Determine source based on whether the request contains extracted data indicators
            // If user_request contains JSON-like structure or mentions "extracted", assume IMAGE_EXTRACTION
            const source = (args.user_request.includes('extracted') || args.user_request.includes('{"tripType"') || args.user_request.includes('outboundSegments')) 
              ? 'IMAGE_EXTRACTION' 
              : 'MCP';
            
            // Prepare flightData exactly as flight_pricecheck will use it
            const flightData = {
              ...parsedRequest.flightData,
              source: source
            };
            
            console.error('📤 Formatted flightData for flight_pricecheck:', JSON.stringify(flightData, null, 2));
            
            result = {
              message: 'Flight details parsed and formatted successfully! Use the flightData below to call flight_pricecheck.',
              flightData: flightData,
              readyForPriceCheck: true
            };
          }
        } else if (name === 'flight_pricecheck') {
          console.error('🔍 Processing flight_pricecheck tool...');
          
          // Get the flight data from the input
          const flightData = args.flightData;
          
          // Preserve the source from the formatted request (or default to MCP)
          const searchData = {
            ...flightData,
            source: flightData.source || 'MCP'
          };
          
          console.error('📤 Search flights payload:', JSON.stringify(searchData, null, 2));
          
          try {
            // Transform to API format and sanitize the request
            const apiRequest = transformToApiFormat(searchData);
            console.error('📤 API Request after transformation:', JSON.stringify(apiRequest, null, 2));
            const sanitizedRequest = sanitizeSubmitArgs(apiRequest);
            console.error('📤 API Request after sanitization:', JSON.stringify(sanitizedRequest, null, 2));
            console.error('📤 API Request keys:', Object.keys(sanitizedRequest));
            console.error('📤 API Request trip keys:', sanitizedRequest.trip ? Object.keys(sanitizedRequest.trip) : 'NO TRIP');
            console.error('📤 API Request trip.legs:', sanitizedRequest.trip?.legs ? `${sanitizedRequest.trip.legs.length} legs` : 'NO LEGS');
            
            // Define progress callback to stream results as they appear
            const onProgress = (progressResults) => {
              // Send progress notification via notifications/message (which MCP Inspector displays)
              // Include the full results JSON so users can see all results as they arrive
              const resultCount = progressResults.totalResults || progressResults.results?.length || 0;
              const status = progressResults.status || 'IN_PROGRESS';
              
              // Send a message notification with the results
              const messageNotification = {
                jsonrpc: '2.0',
                method: 'notifications/message',
                params: {
                  level: 'info',
                  logger: 'stdio',
                  data: {
                    message: `📊 Flight search progress: Found ${resultCount} result${resultCount !== 1 ? 's' : ''} (status: ${status})`,
                    results: progressResults,
                    resultCount: resultCount,
                    status: status
                  }
                }
              };
              console.log(JSON.stringify(messageNotification));
              console.error(`📤 Sent progress notification: ${resultCount} result${resultCount !== 1 ? 's' : ''} (status: ${status})`);
            };
            
            const searchResult = await submit_and_poll_session(sanitizedRequest, onProgress);
            
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
      console.error('❌ Error processing request:', error.message);
      // Send error response if we have a request ID
      if (request && request.id !== undefined) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        };
        console.log(JSON.stringify(errorResponse));
      }
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();