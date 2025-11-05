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
async function parseFlightRequest(userRequest, context) {
  try {
            console.error('🔍 Starting Gemini request...');
            console.error('📝 User request:', userRequest);
            console.error('🔑 API key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 'Not set');
            console.error('🔑 API key starts with:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'Not set');

            const model = getGeminiAI().getGenerativeModel({ model: "gemini-2.5-flash" });
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

// Helper function to optimize images for Gemini API
async function optimizeImagesForGemini(images) {
  const optimizedImages = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const data = img.data.replace(/^data:image\/[^;]+;base64,/, '');

    try {
      const decoded = Buffer.from(data, 'base64');

      console.error(`🖼️ Processing image ${i}: ${decoded.length} bytes`);

      // More aggressive optimization strategy
      let optimizedBuffer;

      if (decoded.length > 500 * 1024) { // Over 500KB - heavy compression
        console.error(`📉 Heavy compression for image ${i}`);
        optimizedBuffer = await sharp(decoded)
          .resize(800, 600, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 60, progressive: true })
          .toBuffer();
      } else if (decoded.length > 200 * 1024) { // Over 200KB - moderate compression
        console.error(`📊 Moderate compression for image ${i}`);
        optimizedBuffer = await sharp(decoded)
          .resize(1000, 750, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 75, progressive: true })
          .toBuffer();
      } else {
        // Small enough, just ensure it's JPEG format
        console.error(`✅ No compression needed for image ${i}`);
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
      const compressionRatio = data.length > 0 ? ((data.length - optimizedBase64.length) / data.length * 100) : 0;

      // Additional check: if even after optimization the base64 is still too large, compress more
      if (optimizedBase64.length > 5 * 1024 * 1024) { // 5MB base64 limit per image
        console.error(`🚨 Image ${i} still too large after optimization, applying emergency compression...`);

        // Apply more aggressive compression
        const emergencyBuffer = await sharp(decoded)
          .resize(600, 450, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 40, progressive: true })
          .toBuffer();

        const finalBase64 = emergencyBuffer.toString('base64');
        optimizedImages.push({
          data: finalBase64,
          mimeType: 'image/jpeg'
        });

        console.error(`✅ Image ${i} emergency optimized: ${finalBase64.length} chars (${emergencyBuffer.length} bytes)`);
      } else {
        optimizedImages.push({
          data: optimizedBase64,
          mimeType: 'image/jpeg'
        });

        console.error(`✅ Image ${i} optimized: ${optimizedBase64.length} chars (${optimizedBuffer.length} bytes) - ${compressionRatio.toFixed(1)}% smaller`);
      }

    } catch (error) {
      console.error(`❌ Failed to optimize image ${i}:`, error.message);
      // If optimization fails, try with original
      optimizedImages.push({
        data: data,
        mimeType: img.mimeType
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
  const imageParts = optimizedImages.map(img => {
    // Clean the base64 data - remove data URI prefix if present
    let cleanedData = img.data;
    if (cleanedData.startsWith('data:image/')) {
      // Extract the base64 part after the comma
      cleanedData = cleanedData.split(',')[1];
    }
    
    // Remove any whitespace
    cleanedData = cleanedData.replace(/\s/g, '');
    
    // Validate base64
    try {
      // Try to decode to verify it's valid base64
      Buffer.from(cleanedData, 'base64');
    } catch (e) {
      console.error('❌ Invalid base64 data:', e.message);
      throw new Error(`Invalid base64 image data: ${e.message}`);
    }
    
    console.error('✅ Validated base64 data, length:', cleanedData.length);
    
    return {
      inlineData: {
        data: cleanedData,
        mimeType: img.mimeType
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

  const prompt = `Analyze this flight booking image and extract key details as JSON:

{
  "tripType": "one_way" | "round_trip",
  "cabinClass": "economy" | "premium_economy" | "business" | "first",
  "passengers": {"adults": NUMBER, "children": NUMBER, "infants": NUMBER},
  "outboundSegments": [{"airline": "CODE", "flightNumber": "123", "departure": "DEP", "arrival": "ARR", "departureTime": "HH:MM", "arrivalTime": "HH:MM", "date": "YYYY-MM-DD"}],
  "returnSegments": [],
  "totalPrice": NUMBER | null,
  "currency": "CODE" | null
}

Rules: Use null for missing values. Return only JSON.`;

  try {
    console.error('🤖 Preparing Gemini API request...');
    console.error('📊 Optimized image data summary:', {
      count: optimizedImages.length,
      mimeTypes: optimizedImages.map(img => img.mimeType),
      totalDataLength: optimizedImages.reduce((sum, img) => sum + (img.data?.length || 0), 0),
      originalTotalSize: totalImageSize,
      optimizedTotalSize: optimizedTotalSize,
      compressionRatio: totalImageSize > 0 ? Math.round((1 - optimizedTotalSize / totalImageSize) * 100) : 0
    });

    // Log the prompt being sent
    console.error('📝 Prompt being sent to Gemini:');
    console.error('📝 Prompt length:', prompt.length);
    console.error('📝 Prompt preview:', prompt.substring(0, 200) + '...');

    // Log image parts being sent
    console.error('🖼️ Image parts being sent:', imageParts.length);
    imageParts.forEach((part, i) => {
      console.error(`🖼️ Image part ${i}:`, {
        hasInlineData: !!part.inlineData,
        mimeType: part.inlineData?.mimeType,
        dataLength: part.inlineData?.data?.length || 0
      });
    });

    console.error('🚀 About to call model.generateContent()...');

    // Add timeout to Gemini API call (10 seconds to fail faster)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 10 seconds')), 10000)
    );

    const startTime = Date.now();
    console.error('⏰ Gemini API call starting at:', new Date().toISOString());

    const result = await Promise.race([
      model.generateContent([prompt, ...imageParts]),
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
      
      const parsed = JSON.parse(cleanedText);
      console.error('✅ Successfully parsed JSON');
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
      console.error('🖼️ This was an image processing error');
      return {
        error: 'The image could not be processed by Gemini. Please ensure the image is in a supported format (JPG, PNG, or WebP) and is not corrupted.',
        details: error.message
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
              name: 'extract_flight_from_image',
              description: 'Extract flight details from one or more booking screenshots/images and automatically search for better prices. Upload images of flight bookings, itineraries, or confirmation emails. The tool will extract flight information and immediately perform price comparison across multiple booking sites.',
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
            console.error('📋 Full arguments received:', JSON.stringify(args, null, 2));

            const images = args.images;
            console.error('📊 Tool arguments:', {
              hasImages: !!images,
              imageCount: images?.length || 0,
              imageTypes: images?.map(img => img.mimeType) || [],
              imageSizes: images?.map(img => img.data?.length || 0) || []
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
                  console.error(`❌ Image ${i} missing required fields`);
                  continue;
                }
                
                // Check if it looks like base64 data (at least 100 chars)
                const data = img.data.replace(/^data:image\/[^;]+;base64,/, '').replace(/\s/g, '');
                if (data.length < 100) {
                  console.error(`❌ Image ${i} data too short or invalid (${data.length} chars)`);
                  continue;
                }
                
                // Check if it's valid base64
                try {
                  const decoded = Buffer.from(data, 'base64');

                  // Check file size (Gemini has limits, roughly 20MB per image)
                  if (decoded.length > 20 * 1024 * 1024) {
                    console.error(`❌ Image ${i} too large (${decoded.length} bytes, max 20MB)`);
                    continue;
                  }

                  // Check base64 string size (MCP protocol might have limits)
                  if (data.length > 50 * 1024 * 1024) { // 50MB base64 string
                    console.error(`❌ Image ${i} base64 too large (${data.length} chars, max 50M chars)`);
                    continue;
                  }

                  hasValidImage = true;
                  console.error(`✅ Image ${i} validated (${data.length} chars, ${decoded.length} bytes)`);
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
                  // Transform extracted data to the format expected by flight_pricecheck
                  const transformedData = transformExtractedToFlightData(extractedData);
                  console.error('✅ Flight details extracted successfully!');

                  // Automatically proceed with price comparison
                  console.error('🔄 Automatically calling flight_pricecheck with extracted data...');

                  // Set source to IMAGE_EXTRACTION as requested
                  const searchData = {
                    ...transformedData,
                    source: 'IMAGE_EXTRACTION'
                  };

                  console.error('📤 Price comparison payload:', JSON.stringify(searchData, null, 2));

                  try {
                    // Transform to API format and call the actual API
                    const apiRequest = transformToApiFormat(searchData);
                    const searchResult = await submit_and_poll_session(apiRequest);

                    result = {
                      message: 'Flight details extracted and price comparison completed successfully!',
                      extractedData: extractedData,
                      transformedData: transformedData,
                      searchResult: searchResult,
                      searchData: searchData
                    };
                  } catch (apiError) {
                    console.error('❌ Price comparison failed:', apiError);
                    // Still return the extracted data even if price comparison fails
                    result = {
                      message: 'Flight details extracted successfully! Price comparison failed but data is available.',
                      extractedData: extractedData,
                      transformedData: transformedData,
                      searchData: searchData,
                      priceError: apiError.message
                    };
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