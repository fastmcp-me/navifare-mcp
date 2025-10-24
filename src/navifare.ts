import fetch from "node-fetch";

// MCP server runs server-side (Node.js), so no CORS restrictions - call backend directly
const API_BASE_URL = process.env.NAVIFARE_API_BASE_URL || "https://api.navifare.com/api/v1/price-discovery/flights";

export async function submit_session(input: any) {
  const res = await fetch(`${API_BASE_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Navifare API error: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
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

export async function submit_and_poll_session(input: any) {
  console.error('🚀 Submitting session...');
  
  // Submit the session
  const submitResponse = await submit_session(input);
  const request_id = submitResponse.request_id;
  
  if (!request_id) {
    throw new Error('No request_id returned from submit_session');
  }
  
  console.error(`✅ Session created with ID: ${request_id}`);
  console.error('⏳ Initial poll for results...');
  
  // Poll for results - wait longer to get more comprehensive results
  // The widget will auto-refresh to get more results as they come in
  const maxAttempts = 10; // More attempts to get better results
  const pollInterval = 6000; // 6 seconds between polls
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.error(`  🔄 Poll attempt ${attempt}/${maxAttempts}...`);
    
    await sleep(pollInterval);
    
    try {
      const results = await get_session_results(request_id);
      
      // Return as soon as we have ANY results, or if completed
      if (results.status === 'COMPLETED') {
        const currentCount = results.totalResults || results.results?.length || 0;
        console.error(`  ✅ Search completed with ${currentCount} result${currentCount !== 1 ? 's' : ''}.`);
        return results;
      }
      
      // If we have results but status is still IN_PROGRESS, wait a bit longer for more
      if (results.results && results.results.length > 0) {
        const currentCount = results.totalResults || results.results?.length || 0;
        // If we have results, the status should be considered successful regardless of what the API says
        const effectiveStatus = results.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
        console.error(`  ✅ Found ${currentCount} result${currentCount !== 1 ? 's' : ''} (status: ${effectiveStatus}). Continuing to poll for more...`);
        
        // If this is our last attempt and we have results, return them
        if (attempt === maxAttempts) {
          console.error(`  ⏱️  Final attempt reached. Returning ${currentCount} result${currentCount !== 1 ? 's' : ''} (widget will auto-refresh for more).`);
          return results;
        }
      } else {
        // Log progress but keep polling only if we have no results
        console.error(`  ⏳ Status: ${results.status || 'IN_PROGRESS'} (no results yet)...`);
      }
    } catch (error) {
      console.error(`  ⚠️  Poll attempt ${attempt} failed: ${error.message}`);
    }
  }
  
  // Return what we have (even if empty) - widget will auto-refresh
  console.error('⏱️  Initial polling complete. Returning current status (widget will auto-refresh)...');
  return await get_session_results(request_id);
}


