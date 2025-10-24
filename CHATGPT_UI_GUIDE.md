# ChatGPT UI Widget Integration Guide

## Overview

The Navifare MCP server now includes a beautiful, interactive React widget that displays flight price comparison results directly in ChatGPT.

## What's New

### Visual Flight Results Widget

When you search for flights in ChatGPT, instead of seeing plain JSON text, you'll now see:

- **Interactive cards** for each flight offer
- **Price comparison** with converted currencies
- **Direct booking links** to each travel site
- **Sorting & filtering** options (by price, website, or rank)
- **Favorite providers** - star your preferred booking sites
- **Special fare indicators** - easily spot special deals
- **Real-time updates** - refresh button to get latest prices

### Features

1. **Responsive Design**
   - Works in fullscreen and inline modes
   - Mobile-friendly bottom carousel
   - Desktop sidebar with detailed results

2. **Interactive Controls**
   - Sort by: Rank, Price, or Website
   - Toggle special fares on/off
   - Favorite/unfavorite booking sites
   - Refresh results button
   - Fullscreen expansion

3. **Rich Data Display**
   - Large, prominent pricing
   - Fare type badges (Special vs. Standard)
   - Booking website logos/names
   - Last updated timestamps
   - Converted currency prices

4. **User Actions**
   - Direct "View on [Website]" buttons
   - "Ask About Results" to get AI explanations
   - Click-through to booking sites

## How It Works

### Architecture

```
ChatGPT User Request
    ↓
MCP Server (search_flights tool)
    ↓
Navifare API (polls for results)
    ↓
Returns structured data
    ↓
React Widget renders beautiful UI
    ↓
User sees interactive flight cards
```

### Technical Implementation

1. **MCP Resources**: Registered `ui://widget/flight-results.html` resource
2. **Skybridge HTML**: Loads React component via `<script type="module">`
3. **Structured Content**: Tool returns data in `structuredContent` field
4. **OpenAI Globals**: Widget uses `window.openai.*` APIs for state and actions

### Key Files

- `/web/src/component.tsx` - React widget component
- `/web/dist/component.js` - Bundled widget (1MB)
- `/http-server.js` - MCP server with UI resource endpoints
- `/widget/*` - Static file serving for widget assets

## Setup Instructions

### 1. Build the Widget (Already Done)

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp/web
npm run build
```

### 2. Start the MCP Server

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
npm run serve
```

Server runs on `http://localhost:2091`

### 3. Expose via ngrok

```bash
ngrok http 2091
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)

### 4. Connect to ChatGPT

1. Open ChatGPT Settings → Integrations
2. Click "Add Integration"
3. Paste: `https://abc123.ngrok-free.dev/mcp`
4. Authorize the integration

### 5. Test the Widget

Try asking ChatGPT:

> "Search for flights from Milan to Rome on October 18, returning October 25. Flight AZ2133 departing at 13:00, arriving 14:10. Return flight AZ2080 at 16:00, arriving 17:10. Economy class, 1 adult. Reference price is 99 CHF."

You should see:
1. ChatGPT calls the `search_flights` tool
2. Shows "Searching across booking sites..." status
3. After 5-60 seconds, renders the **beautiful widget** with:
   - Flight cards ranked by price
   - Direct links to Kiwi, Farera, Google Flights, etc.
   - Interactive sorting and filtering
   - "View on [Website]" buttons

## API Reference

### MCP Endpoints

#### `GET /mcp`
Returns server metadata with tools and `_meta` fields:
```json
{
  "name": "search_flights",
  "_meta": {
    "openai/outputTemplate": "ui://widget/flight-results.html",
    "openai/toolInvocation/invoking": "Searching across booking sites...",
    "openai/toolInvocation/invoked": "Found flight prices!"
  }
}
```

#### `POST /mcp` (method: `resources/list`)
Returns available UI widgets:
```json
{
  "resources": [{
    "uri": "ui://widget/flight-results.html",
    "name": "Flight Results Widget",
    "mimeType": "text/html+skybridge"
  }]
}
```

#### `POST /mcp` (method: `resources/read`)
Returns the widget HTML with script tag to load React component.

#### `POST /mcp` (method: `tools/call`, name: `search_flights`)
Returns results with `structuredContent`:
```json
{
  "content": [{ "type": "text", "text": "Found 3 flight prices..." }],
  "structuredContent": {
    "request_id": "abc123",
    "status": "COMPLETED",
    "totalResults": 3,
    "results": [...]
  }
}
```

### Widget Data Format

The widget expects `toolOutput` in this format:

```typescript
interface FlightResultsData {
  request_id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  totalResults: number;
  results: FlightResult[];
}

interface FlightResult {
  rank: number;
  price: string;              // e.g., "122.31 EUR"
  convertedPrice?: string;    // e.g., "113.84 CHF"
  website: string;            // e.g., "Farera"
  bookingUrl?: string;
  fareType: "Standard Fare" | "Special Fare";
  timestamp?: string;
}
```

## Troubleshooting

### Widget not showing?

1. **Check server logs**: Widget loading errors appear in terminal
2. **Verify resources**: `curl -X POST http://localhost:2091/mcp -d '{"method":"resources/list","id":1}'`
3. **Check widget file**: Visit `http://localhost:2091/widget/component.js` in browser
4. **Inspect network**: Open browser DevTools → Network tab when ChatGPT renders

### Widget shows but no data?

1. **Check `structuredContent`**: Make sure tool response includes it
2. **Verify data format**: Must match `FlightResultsData` interface
3. **Console errors**: Open ChatGPT page, check browser console for React errors

### ngrok connection issues?

1. **Restart ngrok**: Old tunnels expire after 2 hours
2. **Update ChatGPT**: After ngrok restart, update the MCP URL in ChatGPT settings
3. **CORS headers**: Server already has `cors({ origin: '*' })` enabled

## Next Steps

### Customization Ideas

1. **Add flight details**: Display route, airline logos, layover info
2. **Chart view**: Show price trends over time
3. **Map view**: Visualize routes on a map
4. **Alerts**: Set up price drop notifications
5. **Comparison**: Side-by-side comparison of selected offers

### Performance Optimization

1. **Code splitting**: Split React bundle by route
2. **Image optimization**: Lazy-load airline logos
3. **Caching**: Cache widget assets with CDN
4. **Minification**: Further compress the 1MB bundle

## Resources

- [OpenAI Apps SDK Examples](https://developers.openai.com/apps-sdk/build/examples)
- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [Skybridge HTML Format](https://developers.openai.com/apps-sdk/build/build-a-custom-ux)

---

**Status**: ✅ Fully implemented and ready to test!

**Last Updated**: October 13, 2025




