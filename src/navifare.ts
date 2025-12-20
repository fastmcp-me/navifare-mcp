import fetch from "node-fetch";

// MCP server runs server-side (Node.js), so no CORS restrictions - call backend directly
const API_BASE_URL = process.env.NAVIFARE_API_BASE_URL || "https://api.navifare.com/api/v1/price-discovery/flights";

/**
 * Validates that the trip is a supported type (round-trip with same origin/destination).
 * Throws an error for one-way trips or open-jaw trips.
 */
function validateTripType(input: any): void {
  const legs = input?.trip?.legs;

  if (!legs || !Array.isArray(legs)) {
    throw new Error('Invalid trip: missing legs array');
  }

  // Check for one-way trips (only 1 leg)
  if (legs.length === 1) {
    throw new Error(
      'One-way trips are not yet supported. Please provide a round-trip itinerary with both outbound and return flights.'
    );
  }

  // Check for open-jaw trips (return destination doesn't match outbound origin)
  if (legs.length >= 2) {
    const outboundLeg = legs[0];
    const returnLeg = legs[legs.length - 1];

    // Get first segment of outbound and last segment of return
    const outboundSegments = outboundLeg?.segments;
    const returnSegments = returnLeg?.segments;

    if (outboundSegments?.length > 0 && returnSegments?.length > 0) {
      const outboundOrigin = outboundSegments[0]?.departureAirport;
      const outboundDestination = outboundSegments[outboundSegments.length - 1]?.arrivalAirport;
      const returnOrigin = returnSegments[0]?.departureAirport;
      const returnDestination = returnSegments[returnSegments.length - 1]?.arrivalAirport;

      // For a valid round-trip: return should go from outbound destination back to outbound origin
      if (returnOrigin !== outboundDestination || returnDestination !== outboundOrigin) {
        throw new Error(
          `Open-jaw trips are not yet supported. The return flight must depart from ${outboundDestination} and arrive at ${outboundOrigin}. ` +
          `Got: ${returnOrigin} to ${returnDestination}.`
        );
      }
    }
  }
}

export async function submit_session(input: any) {
  // Validate trip type before making API call
  validateTripType(input);

  console.error('📤 Sending request to Navifare API:', JSON.stringify(input, null, 2));
  console.error('📤 API URL:', `${API_BASE_URL}/session`);
  const res = await fetch(`${API_BASE_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  console.error(`📥 Response status: ${res.status} ${res.statusText}`);
  console.error(`📥 Response headers:`, Object.fromEntries(res.headers.entries()));
  
  if (!res.ok) {
    let errorText = '';
    let errorJson = null;
    try {
      errorText = await res.text();
      console.error(`📥 Raw error response body length: ${errorText.length} characters`);
      console.error(`📥 Raw error response body:`, errorText || '(empty)');
      
      // Try to parse as JSON for better error messages
      if (errorText && errorText.trim()) {
        try {
          errorJson = JSON.parse(errorText);
          console.error(`❌ Navifare API error response (${res.status}) [JSON]:`, JSON.stringify(errorJson, null, 2));
          
          // If it's an error object, extract the message
          if (errorJson.is_error || errorJson.type === 'http_error') {
            const errorMsg = errorJson.message || `API error ${res.status}`;
            errorText = `Navifare API error ${res.status}: ${errorMsg}`;
          } else {
          errorText = JSON.stringify(errorJson, null, 2);
          }
        } catch {
          // Not JSON, use as-is
          console.error(`❌ Navifare API error response (${res.status}) [Text]:`, errorText);
        }
      } else {
        console.error(`❌ Navifare API error response (${res.status}): (empty response body)`);
        errorText = `Navifare API error ${res.status}: (empty response body)`;
      }
    } catch (error) {
      console.error(`❌ Failed to read error response body:`, error);
      errorText = `Unable to read error response: ${error}`;
    }
    
    const errorMessage = `Navifare API error: ${res.status} ${res.statusText}${errorText ? ` - ${errorText}` : ' (no error details)'}`;
    console.error(`❌ Throwing error: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  // Parse response
  let responseData;
  try {
    const responseText = await res.text();
    console.error(`📥 Response body (${responseText.length} chars):`, responseText.substring(0, 500));
    
    if (!responseText || !responseText.trim()) {
      throw new Error(`Navifare API returned empty response body (status ${res.status})`);
    }
    
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Navifare API returned invalid JSON (status ${res.status}): ${responseText.substring(0, 200)}`);
    }
  } catch (error: any) {
    // If we couldn't parse, it's already an error
    if (error.message.includes('Navifare API')) {
      throw error;
    }
    throw new Error(`Failed to read Navifare API response: ${error.message}`);
  }
  
  // Check if the response body itself is an error object (even with 200 status)
  if (responseData && typeof responseData === 'object') {
    if (responseData.is_error || responseData.type === 'http_error') {
      const errorMsg = responseData.message || `API error ${res.status}`;
      const errorCode = responseData.code || res.status;
      console.error(`❌ Navifare API returned error object in response body:`, JSON.stringify(responseData, null, 2));
      throw new Error(`Navifare API error ${errorCode}: ${errorMsg}`);
    }
  }
  
  return responseData;
}

export async function get_session_results(request_id: string) {
  const res = await fetch(`${API_BASE_URL}/session/${request_id}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Navifare API error: ${res.status} ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  
  // Format the results for better readability
  if (data.results && Array.isArray(data.results)) {
    const formattedResults = data.results.map((result: any, index: number) => ({
      rank: index + 1,
      price: `${result.price} ${result.currency}`,
      convertedPrice: result.convertedPrice ? `${result.convertedPrice} ${result.convertedCurrency}` : null,
      website: result.source || result.website_name,
      bookingUrl: result.booking_URL || result.booking_url,
      fareType: result.private_fare === 'true' ? 'Special Fare' : 'Standard Fare',
      timestamp: result.timestamp
    }));
    
    return {
      request_id: data.request_id,
      status: data.status,
      totalResults: data.results.length,
      results: formattedResults,
      rawData: data // Include raw data for debugging
    };
  }
  
  return data;
}

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function submit_and_poll_session(input: any, onProgress?: (results: any) => void) {
  // Use console.error so logs are visible in MCP Inspector (which reads stderr)
  console.error('🚀 Submitting session...');
  
  try {
    // Submit the session
    const submitResponse = await submit_session(input);
    const request_id = submitResponse.request_id;
    
    if (!request_id) {
      throw new Error('No request_id returned from submit_session');
    }
    
    console.error(`✅ Session created with ID: ${request_id}`);
    console.error('⏳ Starting polling for results (will poll for up to 90 seconds)...');

    // Poll for results: 90 seconds total, checking every 10 seconds
    const totalTimeout = 90000; // 90 seconds in milliseconds
    const pollInterval = 10000; // 10 seconds between polls
    
    const startTime = Date.now();
    let lastResults: any = null;
    let attempt = 0;
    let lastResultCount = 0;
    
    // Keep polling until COMPLETED or timeout
    while (true) {
      attempt++;
      const elapsedTime = Date.now() - startTime;
      
      // Check timeout BEFORE polling to avoid unnecessary API calls
      if (elapsedTime >= totalTimeout) {
        console.error(`  ⏱️  Reached 90-second timeout (${Math.round(elapsedTime / 1000)}s elapsed). Stopping polling.`);
        break;
      }
      
      console.error(`  🔄 Poll attempt ${attempt} (${Math.round(elapsedTime / 1000)}s elapsed, ${Math.round((totalTimeout - elapsedTime) / 1000)}s remaining)...`);
      
      try {
        const results = await get_session_results(request_id);
        lastResults = results;
        
        const currentCount = results.totalResults || results.results?.length || 0;
        console.error(`  📊 Poll ${attempt} response: status=${results.status}, totalResults=${currentCount}`);
        
        // Send progress update if we have new results OR if status changed to COMPLETED
        const hasNewResults = currentCount > lastResultCount;
        const isCompleted = results.status === 'COMPLETED';
        
        if ((hasNewResults || isCompleted) && onProgress && currentCount > 0) {
          console.error(`  📤 Streaming ${currentCount} result${currentCount !== 1 ? 's' : ''}${hasNewResults ? ` (${currentCount - lastResultCount} new)` : ''}...`);
          onProgress(results);
          lastResultCount = currentCount;
        }
        
        // Return immediately if status is COMPLETED
        if (isCompleted) {
          console.error(`  ✅ Search completed with ${currentCount} result${currentCount !== 1 ? 's' : ''}.`);
          return results;
        }
        
        // Log current status and continue polling if still IN_PROGRESS
        if (currentCount > 0) {
          console.error(`  ⏳ Status: ${results.status}, found ${currentCount} result${currentCount !== 1 ? 's' : ''}. Will continue polling...`);
        } else {
          console.error(`  ⏳ Status: ${results.status || 'IN_PROGRESS'} (no results yet). Will continue polling...`);
        }
        
      } catch (error: any) {
        console.error(`  ⚠️  Poll attempt ${attempt} failed: ${error.message}`);
        console.error(`  ⚠️  Error stack: ${error.stack}`);
        // Continue polling even if one attempt fails
      }
      
      // Check timeout again after the poll
      const elapsed = Date.now() - startTime;
      if (elapsed >= totalTimeout) {
        console.error(`  ⏱️  Reached 90-second timeout. Stopping polling.`);
        break;
      }
      
      // Calculate how long to wait (don't wait longer than remaining time)
      const remainingTime = totalTimeout - elapsed;
      const waitTime = Math.min(pollInterval, remainingTime);
      
      if (waitTime > 0) {
        console.error(`  ⏸️  Waiting ${Math.round(waitTime / 1000)}s before next poll...`);
        await sleep(waitTime);
      } else {
        console.error(`  ⏱️  No time remaining, stopping polling.`);
        break;
      }
    }
    
    // Return final results after polling completes or timeout reached
    console.error(`⏱️  Polling complete after ${attempt} attempt(s). Returning final status...`);
    if (lastResults) {
      const finalCount = lastResults.totalResults || lastResults.results?.length || 0;
      console.error(`  📤 Returning last known results: status=${lastResults.status}, totalResults=${finalCount}`);
      // Send final progress update if we have results and haven't sent them yet
      if (finalCount > lastResultCount && onProgress) {
        onProgress(lastResults);
      }
      return lastResults;
    }
    // Fallback: get fresh results if we don't have any
    console.error(`  📤 Fetching final results from API...`);
    const finalResults = await get_session_results(request_id);
    const finalCount = finalResults.totalResults || finalResults.results?.length || 0;
    console.error(`  📤 Final results: status=${finalResults.status}, totalResults=${finalCount}`);
    // Send final progress update if we have results
    if (finalCount > 0 && onProgress) {
      onProgress(finalResults);
    }
    return finalResults;
  } catch (error: any) {
    console.error(`❌ Fatal error in submit_and_poll_session: ${error.message}`);
    console.error(`❌ Error stack: ${error.stack}`);
    throw error;
  }
}


