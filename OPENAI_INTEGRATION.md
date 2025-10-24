# Navifare MCP Server - OpenAI Apps SDK Integration

This MCP server implements the [OpenAI Apps SDK specifications](https://developers.openai.com/apps-sdk/build/mcp-server) to provide flight price discovery tools with interactive UI components for ChatGPT.

## Overview

The Navifare MCP server wraps the Navifare REST API as MCP tools and provides rich, interactive UI components that render directly in ChatGPT when using the OpenAI Apps SDK.

## Features

### OpenAI Apps SDK Compliance

✅ **UI Resources with Widgets** - Registered HTML templates with proper MIME type (`text/html+skybridge`)  
✅ **Component Metadata** - CSP policies, widget descriptions, and border preferences  
✅ **Tool Metadata** - Output templates, status strings, and widget accessibility flags  
✅ **Structured Responses** - Returns `content`, `structuredContent`, and `_meta` fields  
✅ **Locale Support** - Negotiates and respects user locale preferences  
✅ **Interactive Components** - Flight results display with prices, booking links, and comparisons

### Tools

#### 1. `submit_session`
Creates a flight price discovery session to search multiple booking websites.

**Parameters:**
- `trip` - Flight itinerary with legs and segments
  - `legs[]` - Array of trip legs (1 for one-way, 2 for round-trip)
    - `segments[]` - Flight segments per leg
      - `airline` - Two-letter airline code (e.g., 'UA', 'AA')
      - `flightNumber` - Flight number without airline prefix
      - `departureAirport` - IATA airport code (e.g., 'JFK')
      - `arrivalAirport` - IATA airport code (e.g., 'LAX')
      - `departureDate` - Date in YYYY-MM-DD format
      - `departureTime` - Time in HH:MM or HH:MM:SS format
      - `arrivalTime` - Time in HH:MM or HH:MM:SS format
      - `plusDays` - Days to add to arrival date (0 or 1)
  - `travelClass` - 'economy', 'premium_economy', 'business', or 'first'
  - `adults` - Number of adult passengers (12+)
  - `children` - Number of children (2-11)
  - `infantsInSeat` - Number of infants with seat
  - `infantsOnLap` - Number of infants on lap
- `source` - Request source/referrer
- `price` - Reference price to compare
- `currency` - Three-letter currency code (e.g., 'USD')
- `location` - (Optional) User location for regional pricing

**Returns:**
- `request_id` - Session ID to retrieve results
- `status` - Session status
- `message` - Status message

#### 2. `get_session_results`
Retrieves pricing results with an interactive UI component showing all available prices.

**Parameters:**
- `request_id` - Session ID from `submit_session`

**Returns:**
- Interactive UI widget displaying:
  - Price comparison from multiple booking sites
  - Fare types (Standard vs Special Fare)
  - Direct booking links
  - Last update timestamps
  - Converted prices (if applicable)

**OpenAI Metadata:**
- `outputTemplate`: `ui://widget/flight-results.html`
- `widgetAccessible`: `true` (allows component-initiated tool calls)
- Status strings for better UX during invocation

## UI Components

### Flight Results Widget (`ui://widget/flight-results.html`)

An interactive, responsive component that displays flight prices in a beautiful card layout:

**Features:**
- Sortable price list with ranking
- Visual distinction between standard and special fares
- Hover effects for better interactivity
- Direct "View on [Website]" booking buttons
- Status badges (Complete/Processing)
- Responsive design that works on all screen sizes
- Clean, modern UI following best practices

**Data Hydration:**
The widget receives data via `window.openai.toolOutput` containing:
```javascript
{
  request_id: string,
  status: string,
  totalResults: number,
  results: [
    {
      rank: number,
      price: string,
      convertedPrice: string | null,
      website: string,
      bookingUrl: string,
      fareType: string,
      timestamp: string
    }
  ]
}
```

**Security:**
- CSP policy configured for restricted domains
- No inline event handlers
- No external resource loading
- Border preference enabled for card-style layout

## Installation & Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Install Dependencies
```bash
cd mcp/navifare-mcp
npm install
```

### Build
```bash
npm run build
```

### Development
```bash
npm run dev
```

### Test OpenAI Compliance
```bash
node test-openai-spec.js
```

This runs a comprehensive test suite verifying:
- Server initialization with locale support
- UI resource registration
- Widget metadata (CSP, descriptions)
- Tool metadata (output templates, status strings)
- Response structure compliance
- Locale negotiation

## Environment Variables

```bash
NAVIFARE_API_BASE_URL="https://api.navifare.com/api/v1/price-discovery/flights"
```

## Connecting to ChatGPT

### Using the MCP Inspector (Development)
```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector node dist/index.js
```

### Claude Desktop Configuration
Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "navifare": {
      "command": "node",
      "args": ["/path/to/navifare-mcp/dist/index.js"]
    }
  }
}
```

### OpenAI ChatGPT Configuration
Follow the [OpenAI Apps SDK deployment guide](https://developers.openai.com/apps-sdk/deploy/deploy-your-app) to:
1. Deploy your MCP server
2. Register it with OpenAI
3. Connect from ChatGPT

## Technical Implementation Details

### Locale Negotiation
The server implements RFC 4647 locale negotiation:
1. Client sends preferred locale in `_meta["openai/locale"]`
2. Server negotiates closest match
3. Server echoes resolved locale in response
4. All strings, dates, and numbers formatted accordingly

### Response Structure
All tool responses follow the OpenAI-compliant structure:

```typescript
{
  content: [
    {
      type: "text",
      text: "Human-readable summary for the model"
    }
  ],
  structuredContent: {
    // Data to hydrate the UI component
    // This is visible to the model
  },
  _meta: {
    // Additional data NOT shown to the model
    // e.g., raw API responses, debug info
  }
}
```

### Widget Architecture
1. **Resource Registration** - Template HTML registered with `mimeType: "text/html+skybridge"`
2. **Tool Declaration** - Tools reference template via `_meta["openai/outputTemplate"]`
3. **Data Injection** - ChatGPT injects `structuredContent` into `window.openai.toolOutput`
4. **Component Rendering** - JavaScript reads the data and renders the UI
5. **Isolation** - Component runs in sandboxed iframe with CSP restrictions

### CSP Configuration
The widget defines strict Content Security Policy:
```typescript
{
  connect_domains: [],        // No external API calls
  resource_domains: []         // No external resources
}
```

All assets are inlined in the HTML for maximum security.

## Testing

### Unit Tests
```bash
node test-openai-spec.js
```

Expected output:
- ✅ Server initialization with locale support
- ✅ UI resource registration  
- ✅ Widget metadata (CSP, descriptions)
- ✅ Tool metadata (output templates, status strings)
- ✅ Response structure compliance
- ✅ Locale negotiation for multiple locales

### Manual Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Then test:
1. Initialize with locale
2. List resources - verify `ui://widget/flight-results.html`
3. Read resource - verify HTML content and metadata
4. List tools - verify metadata fields
5. Call tools - verify response structure

## API Reference

### Server Configuration
```typescript
new McpServer({ 
  name: "navifare-mcp", 
  version: "0.1.0" 
})
```

### Resource Registration
```typescript
mcpServer.registerResource(
  "flight-results-widget",
  "ui://widget/flight-results.html",
  {},
  async () => ({ contents: [...] })
)
```

### Tool Registration
```typescript
mcpServer.registerTool(
  "tool-name",
  {
    title: "Human Title",
    description: "Tool description",
    inputSchema: { /* Zod schema */ },
    _meta: {
      "openai/outputTemplate": "ui://widget/...",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Loading...",
      "openai/toolInvocation/invoked": "Complete",
      "openai/locale": "en-US"
    }
  },
  async (input, extra) => { /* handler */ }
)
```

## Troubleshooting

### Common Issues

**Issue:** "Cannot find module '@modelcontextprotocol/sdk'"
**Solution:** Run `npm install` in the mcp/navifare-mcp directory

**Issue:** Widget not rendering
**Solution:** Verify the HTML resource is registered with `mimeType: "text/html+skybridge"`

**Issue:** Tool metadata not appearing
**Solution:** Check that `_meta` fields use the correct `openai/*` namespace

**Issue:** Locale not working
**Solution:** Ensure you're echoing the resolved locale in tool responses

**Issue:** CSP errors in console
**Solution:** Verify all resources are inlined, no external domains in CSP config

## Best Practices

1. **Always echo locale** - Include `_meta["openai/locale"]` in tool responses
2. **Inline all assets** - Don't load external CSS/JS in widgets
3. **Descriptive metadata** - Use clear, user-friendly status strings
4. **Structured data** - Keep `structuredContent` focused on UI needs
5. **Debug data in _meta** - Put raw API responses in `_meta`, not `structuredContent`
6. **Test compliance** - Run the test suite before deploying
7. **Version templates** - Use unique URIs when making breaking changes to widgets

## References

- [OpenAI Apps SDK Documentation](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [RFC 4647 - Locale Matching](https://www.rfc-editor.org/rfc/rfc4647)

## License

MIT

## Support

For issues or questions:
- API issues: Contact Navifare support
- MCP server issues: Create an issue in this repository
- OpenAI integration: See OpenAI Apps SDK documentation


