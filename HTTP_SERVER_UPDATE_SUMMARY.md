# 🚀 HTTP Server Update Summary

## Overview

The `http-server.js` file needs to be updated to match the functionality of `stdio-server.js` for deployment to Render. This document outlines what needs to be changed.

## Required Changes

### 1. Dependencies ✅ DONE
- Added `GoogleGenerativeAI` import
- Added `sharp` import  
- Added `getGeminiAI()` helper function

### 2. Tools Metadata
Update the `/mcp` GET endpoint to include:
- `extract_flight_from_image` - Extract flight details from images
- `format_flight_pricecheck_request` - Parse and format flight requests
- `flight_pricecheck` - Search for better prices
- Keep `get_session_results` for backward compatibility

### 3. Helper Functions Needed
Copy these functions from `stdio-server.js`:
- `parseFlightRequest(userRequest)` - Parse natural language requests
- `extractFlightDetailsFromImages(images)` - Extract flight data from images
- `optimizeImagesForGemini(images)` - Optimize images for API
- `sanitizeSubmitArgs(rawArgs)` - Already exists, but needs MCP/IMAGE_EXTRACTION support
- `transformToApiFormat(flightData)` - Transform to API format
- `isExtractedDataComplete(extractedData)` - Check completeness
- `transformExtractedToFlightData(extractedData)` - Transform extracted data
- `fixPastDates(data, currentYear, currentDateISO)` - Fix date issues
- `detectRoundTripPattern(outboundSegments, returnSegments)` - Detect round trips
- `convertAirlineNameToIataCode(airlineName)` - Convert airline names
- `extractAirlineCodeFromFlightNumber(flightNumber)` - Extract from flight number
- `convertAirlineNamesToIataCodes(data)` - Convert in extracted data

### 4. Tool Handlers
Add handlers in `tools/call` for:
- `extract_flight_from_image` - Call `extractFlightDetailsFromImages`
- `format_flight_pricecheck_request` - Call `parseFlightRequest`
- `flight_pricecheck` - Call `submit_and_poll_session` with sanitization

### 5. Update `sanitizeSubmitArgs`
Ensure it accepts `MCP` and `IMAGE_EXTRACTION` as valid sources (not just `MANUAL`).

## Quick Fix Approach

For immediate deployment, you can:

1. **Option A: Copy all helper functions** from `stdio-server.js` into `http-server.js` (large change, but complete)

2. **Option B: Keep both servers** - Use `stdio-server.js` for local development/testing, and update `http-server.js` incrementally

3. **Option C: Extract shared logic** - Create a shared utilities file that both servers import from

## Recommendation

For fastest deployment, copy all the helper functions from `stdio-server.js` into `http-server.js` before the route handlers. Then update the tools metadata and add the tool handlers.

The deployment guide in `RENDER_DEPLOYMENT_STEP_BY_STEP.md` will work once `http-server.js` is updated.




