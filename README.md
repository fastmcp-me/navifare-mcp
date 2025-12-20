# Navifare MCP Server

**Version**: 0.1.5

Navifare finds a better price for a specific flight the user already found. Users should provide flight details conversationally, which will be structured into the required format.

## Overview

This MCP server wraps the Navifare REST API as MCP tools for flight price comparison. It enables AI assistants like Claude to help users find better prices for flights they've already discovered.

## MCP Endpoint

- **Production**: `https://mcp.navifare.com/mcp`
- **Documentation**: `https://www.navifare.com/mcp` (Auto-updates from the MCP endpoint)
- **Learn more about MCP**: [Model Context Protocol](https://modelcontextprotocol.io)

## Tools

### `format_flight_pricecheck_request`

**Title**: Format Flight Request

Parse and format flight details from natural language text or transcribed image content. Extracts flight information (airlines, flight numbers, dates, airports, prices) and structures it for price comparison. Returns formatted flight data ready for flight_pricecheck, or requests missing information if incomplete.

**Annotations**:
- `readOnlyHint`: `true` - Tool only formats/parses data, no external calls
- `destructiveHint`: `false` - Tool does not modify or delete data

**Input Schema**:
- `user_request` (required): Flight details in natural language text. Include all available information: flight numbers, airlines, departure/arrival airports and times, dates, prices, passenger counts, and travel class.

**Example Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "format_flight_pricecheck_request",
    "arguments": {
      "user_request": "I found an Aeroitalia flight XZ2020 from FCO to MXP leaving tomorrow at 19.31 and returning with XZ2021 MXP to FCO next Friday at 10.11. 1 adult, economy, the best fare was 221 EUR"
    }
  }
}
```

### `flight_pricecheck`

**Title**: Flight Price Check

Search multiple booking sources to find better prices for a specific flight the user has already found. Compares prices across different booking platforms to find cheaper alternatives for the exact same flight details.

**Annotations**:
- `readOnlyHint`: `false` - Tool performs searches and may trigger external API calls
- `destructiveHint`: `false` - Tool does not modify or delete data

**Input Schema**:
- `trip` (required): Flight trip details including segments, passengers, and travel class
  - `legs` (required): Array of flight legs (one for outbound, one for return in round trips)
  - `travelClass` (required): ECONOMY, PREMIUM_ECONOMY, BUSINESS, or FIRST
  - `adults` (required): Number of adult passengers (minimum: 1)
  - `children` (required): Number of child passengers (minimum: 0)
  - `infantsInSeat` (required): Number of infants requiring a seat (minimum: 0)
  - `infantsOnLap` (required): Number of infants on lap (minimum: 0)
- `source` (required): Source identifier for the query (e.g., "Claude", "MCP", "ChatGPT")
- `price` (required): Reference price found by the user (e.g., "84.00", "200.50")
- `currency` (required): Three-letter ISO currency code (e.g., "EUR", "USD", "GBP")
- `location` (required): Two-letter ISO country code for user location (e.g., "ES", "IT", "US"). If unsure, default to "ZZ" 

**Example Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "flight_pricecheck",
    "arguments": {
      "trip": {
        "legs": [
          {
            "segments": [
              {
                "airline": "XZ",
                "flightNumber": "2020",
                "departureAirport": "MXP",
                "arrivalAirport": "FCO",
                "departureDate": "2025-12-16",
                "departureTime": "07:10",
                "arrivalTime": "08:25",
                "plusDays": 0
              }
            ]
          }
        ],
        "travelClass": "ECONOMY",
        "adults": 1,
        "children": 0,
        "infantsInSeat": 0,
        "infantsOnLap": 0
      },
      "source": "MCP",
      "price": "84",
      "currency": "EUR",
      "location": "IT"
    }
  }
}
```

## Current Limitations

- **Round-trip flights only**: One-way trips are not yet supported. Requests with a single leg will return an error immediately.
- **Same origin/destination**: Open-jaw trips (returning to a different airport) are not yet supported. The return flight must depart from the outbound destination and arrive at the outbound origin.

## Revenue Share

**Revenue share available for qualified partners!**

Earn commission on flight bookings made through your integration. Revenue share available for qualified partners.

## Compliance

This server complies with Anthropic's MCP Directory Policy. See [docs/COMPLIANCE.md](./docs/COMPLIANCE.md) for details.

**Privacy Policy and Terms of Service**: https://navifare.com/terms  
**Contact**: contact@navifare.com  
**Privacy Inquiries**: privacy@navifare.com

## Environment Variables

The only environment variable you typically need to document for this MCP server is:

- `GEMINI_API_KEY` (required): Google Gemini API key for natural language parsing (used when your integration relies on Gemini for text/image understanding).

## Examples

See [docs/USAGE_EXAMPLES.md](./docs/USAGE_EXAMPLES.md) for complete usage examples with detailed workflows.

## Documentation

Most documentation is in the `docs/` directory (and a few files like this `README.md` and `REPOSITORY_STRUCTURE.md` live at the repo root):

### Getting Started
- [docs/QUICKSTART.md](docs/QUICKSTART.md) - 5-minute quick start guide
- [docs/LOCAL_DEPLOYMENT.md](docs/LOCAL_DEPLOYMENT.md) - Comprehensive local deployment guide
- [docs/RENDER_DEPLOYMENT_GUIDE.md](docs/RENDER_DEPLOYMENT_GUIDE.md) - Production deployment guide

### Reference
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md) - Anthropic MCP Directory compliance details
- [docs/USAGE_EXAMPLES.md](docs/USAGE_EXAMPLES.md) - Complete usage examples
- [docs/CLAUDE_SUBMISSION_CHECKLIST.md](docs/CLAUDE_SUBMISSION_CHECKLIST.md) - Claude submission checklist
- [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) - Repository organization

### Additional Guides
- [docs/NGROK_SETUP.md](docs/NGROK_SETUP.md) - ngrok setup for local testing
- [docs/IMAGE_INPUT_GUIDE.md](docs/IMAGE_INPUT_GUIDE.md) - Image handling guide

## Testing

Test files are located in the `test/` directory. See [test/README.md](test/README.md) for details about available tests.

### Running Tests

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Run specific test
node test/test-mcp.js
```

## Scripts

Helper scripts are in the `scripts/` directory:

- `scripts/start-local.sh` - Start local development server
- `scripts/deploy-to-render.sh` - Prepare for Render deployment
- `scripts/start-servers.sh` - Start multiple servers
- `scripts/stop-servers.sh` - Stop running servers

## Repository Structure

```
navifare-mcp/
├── src/              # TypeScript source code
├── dist/             # Compiled JavaScript (generated)
├── docs/             # Documentation
├── test/             # Test files
├── scripts/          # Helper scripts
└── [config files]    # package.json, Dockerfile, etc.
```

See [REPOSITORY_STRUCTURE.md](./REPOSITORY_STRUCTURE.md) for detailed structure.

## Support

- **General Inquiries**: contact@navifare.com
- **Privacy Inquiries**: privacy@navifare.com
- **GitHub Issues**: https://github.com/navifare/navifare-mcp

## Reference

- [MCP Documentation](https://modelcontextprotocol.io)
- [From REST API to MCP Server](https://www.stainless.com/mcp/from-rest-api-to-mcp-server)
