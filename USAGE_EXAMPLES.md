# Navifare MCP Server - Complete Usage Examples

## Overview

The Navifare MCP server now includes three powerful tools that work together to provide a complete flight price discovery workflow:

1. **`extract_image`** - Extract flight details from booking screenshots
2. **`submit_session`** - Create price discovery sessions (simplified JSON format)
3. **`get_session_results`** - Retrieve results with interactive UI

## Complete Workflow Example

### Step 1: Extract Flight Details from Image

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully extracted flight details from image.\n\nFlight Summary:\n- 1 flight segment(s)\n- economy class\n- 1 adult(s), 0 child(ren)\n- Reference price: 847 USD\n\nUse the submit_session tool with this extracted data to search for better prices."
    }
  ],
  "structuredContent": {
    "legs": [
      {
        "segments": [
          {
            "airline": "United Airlines",
            "flightNumber": "1612",
            "departureAirport": "ZUR",
            "arrivalAirport": "JFK",
            "departureDate": "2025-12-15",
            "departureTime": "14:30",
            "arrivalTime": "17:45",
            "plusDays": 0
          }
        ]
      }
    ],
    "travelClass": "economy",
    "adults": 1,
    "children": 0,
    "infantsInSeat": 0,
    "infantsOnLap": 0,
    "source": "image-extraction",
    "price": "847",
    "currency": "USD",
    "location": "Unknown"
  }
}
```

### Step 2: Submit Price Discovery Session

Use the extracted data directly (no need to restructure):

```json
{
  "legs": [
    {
      "segments": [
        {
          "airline": "United Airlines",
          "flightNumber": "1612",
          "departureAirport": "ZUR",
          "arrivalAirport": "JFK",
          "departureDate": "2025-12-15",
          "departureTime": "14:30",
          "arrivalTime": "17:45",
          "plusDays": 0
        }
      ]
    }
  ],
  "travelClass": "economy",
  "adults": 1,
  "children": 0,
  "infantsInSeat": 0,
  "infantsOnLap": 0,
  "source": "image-extraction",
  "price": "847",
  "currency": "USD",
  "location": "Unknown"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully created price discovery session.\nSession ID: session-123-456\nStatus: processing\n\nUse the get_session_results tool with this request_id to retrieve pricing results."
    }
  ],
  "structuredContent": {
    "request_id": "session-123-456",
    "status": "processing",
    "message": "Session created successfully"
  }
}
```

### Step 3: Get Results with Interactive UI

```json
{
  "request_id": "session-123-456"
}
```

**Response:** Returns interactive widget showing price comparisons from multiple booking sites.

## Manual Input Example

You can also use `submit_session` directly without image extraction:

```json
{
  "legs": [
    {
      "segments": [
        {
          "airline": "UA",
          "flightNumber": "1612",
          "departureAirport": "ZUR",
          "arrivalAirport": "JFK",
          "departureDate": "2025-12-15",
          "departureTime": "14:30",
          "arrivalTime": "17:45",
          "plusDays": 0
        }
      ]
    }
  ],
  "travelClass": "economy",
  "adults": 1,
  "children": 0,
  "infantsInSeat": 0,
  "infantsOnLap": 0,
  "source": "manual-input",
  "price": "800",
  "currency": "USD",
  "location": "United States"
}
```

## Key Improvements

### 1. Simplified Data Structure
- **Before:** Nested `trip` object with separate `source`, `price`, `currency`, `location`
- **After:** Flat structure with all fields at the top level
- **Benefit:** Easier to work with, especially when extracting from images

### 2. Image Extraction Integration
- **New Tool:** `extract_image` uses the same AI vision as your frontend
- **Seamless Flow:** Extract → Submit → Get Results
- **Smart Conversion:** Automatically converts extracted data to submit format

### 3. Enhanced Error Handling
- **Validation:** Proper Zod schemas with descriptive error messages
- **Graceful Failures:** Clear error messages for invalid inputs
- **Debugging:** Detailed error information in `_meta` fields

## Testing in MCP Inspector

### Test Files Available:
- `test-extract-image.json` - Sample image extraction input
- `test-submit-session.json` - Sample session submission input  
- `test-get-results.json` - Sample results retrieval input

### Running Tests:
```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
npx @modelcontextprotocol/inspector node dist/index.js
```

Then test each tool with the provided JSON inputs.

## Environment Setup

### Required Environment Variables:
```bash
# For image extraction functionality
GEMINI_API_KEY=your_gemini_api_key_here

# Optional - defaults to production
NAVIFARE_API_BASE_URL=https://api.navifare.com/api/v1/price-discovery/flights
```

### Getting Gemini API Key:
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Set it as `GEMINI_API_KEY` environment variable

## OpenAI Apps SDK Features

All tools include full OpenAI compliance:

### Tool Metadata:
- ✅ Status strings during invocation
- ✅ Locale negotiation support
- ✅ Descriptive input schemas
- ✅ Proper error handling

### Response Structure:
- ✅ `content` - Text for the AI model
- ✅ `structuredContent` - Data for UI components
- ✅ `_meta` - Hidden metadata for debugging

### UI Components:
- ✅ Interactive flight results widget
- ✅ CSP security policies
- ✅ Responsive design
- ✅ Direct booking links

## Usage in ChatGPT

### Example Conversation:
**User:** "I have a screenshot of my flight booking. Can you help me find better prices?"

**ChatGPT:** 
1. Calls `extract_image` with the screenshot
2. Gets structured flight data
3. Calls `submit_session` with extracted data
4. Calls `get_session_results` to show interactive price comparison
5. Displays beautiful widget with all available prices and booking links

### Benefits:
- **One-Click Workflow:** Upload image → Get price comparison
- **Interactive Results:** Click directly to book on any site
- **Comprehensive Data:** All flight details extracted automatically
- **Real-Time Pricing:** Live data from multiple booking sites

## Troubleshooting

### Common Issues:

**"Gemini API key not configured"**
- Set `GEMINI_API_KEY` environment variable
- Get key from Google AI Studio

**"Invalid arguments for tool submit_session"**
- Ensure `adults` is at least 1
- Check all required fields are present
- Use the correct JSON structure (flat, not nested)

**"Failed to extract flight details"**
- Ensure image contains clear flight booking information
- Check image is not corrupted
- Try with a different screenshot

**Widget not displaying**
- Verify `get_session_results` returns valid data
- Check browser console for errors
- Ensure session ID is correct

## Next Steps

### Potential Enhancements:
1. **Batch Processing:** Extract multiple images at once
2. **Price Alerts:** Set up notifications for price changes
3. **Historical Data:** Track price trends over time
4. **Multi-Currency:** Support for all major currencies
5. **Airline Integration:** Direct booking through airline APIs

### Integration Ideas:
1. **Slack Bot:** Share flight screenshots in Slack
2. **Email Integration:** Send price comparisons via email
3. **Calendar Integration:** Add flight details to calendar
4. **Travel Planning:** Multi-city trip support

## Support

For issues or questions:
- **API Issues:** Contact Navifare support
- **MCP Server:** Create issue in this repository
- **OpenAI Integration:** See OpenAI Apps SDK documentation
- **Gemini API:** Check Google AI Studio documentation

