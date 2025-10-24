import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || 'dummy-key-for-development'
);

// Convert the frontend extract function to work in Node.js environment
export async function extractFlightDetails(imageBase64: string, mimeType: string = "image/jpeg"): Promise<any> {
  try {
    console.log('🔑 API Key configured:', !!process.env.GEMINI_API_KEY);
    
    // Check if we have a real API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in your environment variables.');
    }
    
    // Validate base64 data
    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Invalid image data. Please provide a valid base64-encoded image.');
    }
    
    // Get current year/date dynamically
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const prompt = `
Analyze this flight booking screenshot and extract comprehensive flight details. Return ONLY a valid JSON object with the following exact structure:

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
      "airline": "AIRLINE_NAME",
      "flightNumber": "NUMERIC_ONLY",
      "departure": "DEPARTURE_AIRPORT_CODE",
      "arrival": "ARRIVAL_AIRPORT_CODE", 
      "departureTime": "HH:MM",
      "arrivalTime": "HH:MM",
      "date": "YYYY-MM-DD",
      "flightDuration": "HH:MM"
    }
  ],
  "returnSegments": [
    // Same structure as outboundSegments, only if round trip
  ],
  "totalPrice": NUMBER,
  "currency": "CURRENCY_CODE"
}

CRITICAL: PRICE AND CURRENCY EXTRACTION IS ESSENTIAL!
Look very carefully for pricing information:
- Total prices in any format: €299, $450, £320, ¥50000, 299.99, etc.
- Currency symbols: €, $, £, ¥, CHF, CAD, etc.
- Currency codes: EUR, USD, GBP, JPY, CHF, CAD, AUD, etc.
- Price labels: "Total", "Price", "Cost", "Amount", "Fare", etc.
- Any numerical values that could be prices
- Tax inclusive/exclusive prices
- Per person vs total prices
- If there are multiple prices, extract the cheapest one you find

IMPORTANT EXTRACTION RULES:
1. Trip Type: **ALWAYS SET TO "round_trip"** - One-way trips are not supported. If you detect a one-way booking, still set tripType to "round_trip" but note this in the response.
2. Cabin Class: Look for class indicators like "Economy", "Business", "Premium", "First"
3. Passengers: Extract number of adults, children, infants (default to 1 adult if unclear)
4. **SEGMENT CLASSIFICATION**: 
   - For ROUND TRIPS: All flights from origin city to destination city go in "outboundSegments" (including connecting flights)
   - For ROUND TRIPS: All flights from destination city back to origin city go in "returnSegments" (including connecting flights)
   - For ONE-WAY TRIPS DETECTED: All flights go in "outboundSegments", "returnSegments" should be empty array, but set tripType to "round_trip" and add a note
   - **MULTI-SEGMENT FLIGHTS**: If there are connecting flights, each flight leg is a separate segment in the same direction
5. Times: Use 24-hour format (HH:MM)
6. Airports: Use 3-letter IATA codes only
7. **AIRLINE: Use the full airline name as it appears (e.g., "British Airways", "ITA Airways", "Lufthansa", "Air France")**
8. **FLIGHT NUMBER: MUST extract ONLY the numeric part (e.g., "553" from "BA 553" or "BA553")**
9. **FLIGHT DURATION: Extract flight duration in HH:MM format (e.g., "22:30" for 22 hours 30 minutes)**
10. **CURRENCY: MUST extract three letters ISO currency code (EUR, USD, GBP, etc.) - look for symbols or text**
11. **PRICE: MUST extract numerical price value - remove currency symbols**

**CRITICAL: DO NOT MAKE UP OR GUESS INFORMATION!**
If you cannot clearly identify specific flight information from the image:
- Set airline to null (not abbreviations like "LX")
- Set flightNumber to null (not made-up numbers like "1613") 
- Set departure/arrival to null (not codes like "MXP", "ZRH")
- Set times to null (not times like "10:40", "11:40")
- **DATES: If a date is clearly visible but the year is missing, compare month/day to today (${currentDate}). If month/day is later than today, use ${currentYear}; if earlier than today, use ${currentYear + 1}. If a date shows a past year, replace it with ${currentYear}. If no date is visible or unclear, set to null. Dates must never be in the past.**
- Set currency to null (if no currency visible)
- Set totalPrice to null (if no price visible)
- IF IT'S CLEAR THAT THE USER DIDN'T PASTE A FLIGHT, RETURN ALL FIELDS TO NULL.

AIRLINE NAME EXTRACTION:
- Extract the full airline name as it appears in the image
- Look for airline logos, text, or branding
- Examples: "British Airways", "Lufthansa", "Air France", "ITA Airways", "Swiss International Air Lines"
- Do NOT use abbreviations like "BA", "LH", "AF", "AZ", "LX"
`;

    console.log('📷 Processing image with Gemini...');
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    console.log('📥 Received response from Gemini API');
    
    // Try to parse the JSON response
    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      console.log('🧹 Cleaned response text');
      
      // Check if the response contains flight-related content
      if (!cleanedText.includes('tripType') && !cleanedText.includes('outboundSegments')) {
        // The AI might have returned an error message or non-flight content
        if (cleanedText.toLowerCase().includes('sorry') || 
            cleanedText.toLowerCase().includes('cannot') || 
            cleanedText.toLowerCase().includes('unable') ||
            cleanedText.toLowerCase().includes('no flight') ||
            cleanedText.toLowerCase().includes('not found')) {
          throw new Error('The AI could not find flight information in this image. Please make sure the image contains a clear flight booking screenshot with airline details, flight numbers, dates, and pricing information.');
        }
        
        // Check if it's empty or very short
        if (cleanedText.length < 50) {
          throw new Error('The image appears to be empty or contains no readable flight information. Please upload a clear screenshot of your flight booking.');
        }
        
        throw new Error('The AI could not extract flight details from this image. Please ensure the image contains a clear flight booking confirmation with all necessary details visible.');
      }
      
      const extractedData = JSON.parse(cleanedText);
      console.log('✅ Successfully parsed JSON response');
      
      // Post-process to handle one-way trips
      const isOneWayDetected = extractedData.returnSegments === null || 
                             extractedData.returnSegments === undefined || 
                             (Array.isArray(extractedData.returnSegments) && extractedData.returnSegments.length === 0);
      
      if (isOneWayDetected) {
        console.log('⚠️ One-way trip detected - forcing round trip structure');
        // Force round trip structure
        extractedData.tripType = 'round_trip';
        extractedData.returnSegments = [];
        
        // Add a note about the one-way detection
        extractedData.oneWayDetected = true;
        extractedData.oneWayMessage = 'One-way trip detected. Return flights are required but not found in the booking. Please add return flight details manually.';
      }
      
      // Add metadata
      extractedData.extractionMetadata = {
        timestamp: new Date().toISOString(),
        model: 'gemini-1.5-flash',
        confidence: 'high',
        oneWayDetected: isOneWayDetected
      };
      
      // Convert the result to the format expected by submit_session
      return convertToSubmitSessionFormat(extractedData);
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response:', parseError);
      throw new Error('Failed to parse flight details from image. The AI could not extract valid flight information.');
    }
  } catch (error) {
    console.error('❌ Error extracting flight details:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to extract flight details: ${error.message}`);
    }
    throw new Error('Failed to extract flight details from image. Please ensure the image contains clear flight booking information.');
  }
}

// Convert FlightDetails to the format expected by submit_session
function convertToSubmitSessionFormat(flightDetails: any): any {
  const segments: any[] = [];
  
  // Process outbound segments
  if (flightDetails.outboundSegments && Array.isArray(flightDetails.outboundSegments)) {
    flightDetails.outboundSegments.forEach((segment: any) => {
      segments.push({
        airline: segment.airline || '',
        flightNumber: segment.flightNumber || '',
        departureAirport: segment.departure || '',
        arrivalAirport: segment.arrival || '',
        departureDate: segment.date || '',
        departureTime: segment.departureTime || '',
        arrivalTime: segment.arrivalTime || '',
        plusDays: calculatePlusDays(segment.departureTime, segment.arrivalTime)
      });
    });
  }
  
  // Process return segments
  if (flightDetails.returnSegments && Array.isArray(flightDetails.returnSegments)) {
    flightDetails.returnSegments.forEach((segment: any) => {
      segments.push({
        airline: segment.airline || '',
        flightNumber: segment.flightNumber || '',
        departureAirport: segment.departure || '',
        arrivalAirport: segment.arrival || '',
        departureDate: segment.date || '',
        departureTime: segment.departureTime || '',
        arrivalTime: segment.arrivalTime || '',
        plusDays: calculatePlusDays(segment.departureTime, segment.arrivalTime)
      });
    });
  }
  
  return {
    legs: [{
      segments: segments
    }],
    travelClass: flightDetails.cabinClass || 'economy',
    adults: flightDetails.passengers?.adults || 1,
    children: flightDetails.passengers?.children || 0,
    infantsInSeat: 0, // Default to 0, could be enhanced
    infantsOnLap: flightDetails.passengers?.infants || 0,
    source: 'image-extraction',
    price: flightDetails.totalPrice || '',
    currency: flightDetails.currency || 'USD',
    location: 'Unknown' // Could be enhanced with location detection
  };
}

// Calculate plusDays based on departure and arrival times
function calculatePlusDays(departureTime: string, arrivalTime: string): number {
  if (!departureTime || !arrivalTime) return 0;
  
  try {
    const [depHour, depMin] = departureTime.split(':').map(Number);
    const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
    
    const depMinutes = depHour * 60 + depMin;
    const arrMinutes = arrHour * 60 + arrMin;
    
    // If arrival time is earlier than departure time, it's next day
    if (arrMinutes < depMinutes) {
      return 1;
    }
    
    return 0;
  } catch {
    return 0;
  }
}
