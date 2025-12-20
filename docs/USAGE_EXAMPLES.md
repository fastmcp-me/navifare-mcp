# Navifare MCP Server – Usage Examples

## Overview

The current Navifare MCP server exposes **two primary tools**:

1. **`format_flight_pricecheck_request`** – Parse and normalize flight details from natural language text.
2. **`flight_pricecheck`** – Search multiple booking sources for better prices for a specific flight.

If you want to work with **screenshots or images**, the recommended pattern is:

1. Send the image to your own LLM with vision (Claude, Gemini, etc.).
2. Ask the LLM to produce a clear text description of the flight details (airline, flight number, airports, dates, times, price, passengers, cabin).
3. Pass that **text** into the `format_flight_pricecheck_request` tool as `user_request`.
4. Use the formatted output from that tool to call `flight_pricecheck`.

This document only describes the **current** workflow using these two tools.

### Current Limitations

- **Round-trip flights only**: One-way trips are not yet supported. Requests with a single leg will return an error immediately.
- **Same origin/destination**: Open-jaw trips (returning to a different airport) are not yet supported. The return flight must depart from the outbound destination and arrive at the outbound origin.

---

## 1. Pure Text Workflow (Recommended)

### Step 1: Collect flight details from the user

You (or the LLM using this MCP server) should ask the user for:

- Airline and flight number  
- Departure and arrival airports (IATA codes)  
- Departure date and time  
- Return details (if round‑trip)  
- Cabin class  
- Number of passengers  
- Price they saw and currency  

Example user message:

> I found flight XZ 2020 from MXP to FCO on December 16, 2025, departing at 07:10 and arriving at 08:25.  
> Return XZ 2021 from FCO to MXP on December 25, 2025, at 09:45 arriving 11:00.  
> 1 adult, economy, price is 84 EUR.

---

### Step 2: Call `format_flight_pricecheck_request`

Tool: `format_flight_pricecheck_request`

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

**Typical response shape (simplified):**

```json
{
  "content": [
    {
      "type": "text",
      "text": "Flight request parsed successfully. You can now call flight_pricecheck."
    }
  ],
  "formattedRequest": {
    "trip": {
      "legs": [
        {
          "segments": [
            {
              "airline": "XZ",
              "flightNumber": "2020",
              "departureAirport": "FCO",
              "arrivalAirport": "MXP",
              "departureDate": "2025-12-16",
              "departureTime": "19:31",
              "arrivalTime": "20:45",
              "plusDays": 0
            }
          ]
        },
        {
          "segments": [
            {
              "airline": "XZ",
              "flightNumber": "2021",
              "departureAirport": "MXP",
              "arrivalAirport": "FCO",
              "departureDate": "2025-12-22",
              "departureTime": "10:11",
              "arrivalTime": "11:25",
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
    "source": "Claude",
    "price": "221",
    "currency": "EUR",
    "location": "IT"
  }
}
```

If information is missing, the tool can indicate which fields are missing so the LLM can ask follow‑up questions.

---

### Step 3: Call `flight_pricecheck`

Use the `formattedRequest` as input to `flight_pricecheck`.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
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
                "departureAirport": "FCO",
                "arrivalAirport": "MXP",
                "departureDate": "2025-12-16",
                "departureTime": "19:31",
                "arrivalTime": "20:45",
                "plusDays": 0
              }
            ]
          },
          {
            "segments": [
              {
                "airline": "XZ",
                "flightNumber": "2021",
                "departureAirport": "MXP",
                "arrivalAirport": "FCO",
                "departureDate": "2025-12-22",
                "departureTime": "10:11",
                "arrivalTime": "11:25",
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
      "source": "user",
      "price": "221",
      "currency": "EUR",
      "location": "IT"
    }
  }
}
```

**Typical response shape (simplified):**

```json
{
  "content": [
    {
      "type": "text",
      "text": "I found 5 offers for your flight. The best is 178 EUR on ExampleTravel."
    }
  ],
  "searchResult": {
    "request_id": "req_abc123",
    "status": "COMPLETED",
    "totalResults": 5,
    "results": [
      {
        "rank": 1,
        "price": "178.00 EUR",
        "website": "ExampleTravel",
        "bookingUrl": "https://example.com/booking/...",
        "fareType": "Standard Fare"
      }
    ]
  }
}
```

The LLM can then summarize these results or present them in a UI.

---

## 2. Using Images with an External LLM

This MCP server does **not** include an image extraction tool.  
Instead, you should use your own LLM with vision (or a separate service) to extract text from images, then feed that text into `format_flight_pricecheck_request`.

### Recommended Pattern

1. **User uploads screenshot** to your application or to an LLM that supports images (Claude, Gemini, etc.).
2. **Ask the LLM** to produce a structured textual summary, e.g.:

> Please read this flight booking screenshot and describe:
> - Airline and flight number  
> - Departure and arrival airports (IATA codes)  
> - Departure and arrival dates and times  
> - Number of passengers and cabin class  
> - Total price and currency  

3. **Take the LLM’s text output** and pass it as `user_request` to `format_flight_pricecheck_request`.
4. **Use the formatted output** to call `flight_pricecheck` as shown above.

This keeps image handling in your control and lets the Navifare MCP server focus purely on:

- Parsing and validating flight details
>- Calling Navifare’s price discovery API

---

## 3. Testing in MCP Inspector

### Running MCP Inspector

```bash
npx @modelcontextprotocol/inspector https://mcp.navifare.com/mcp
```

Then:

- Call `tools/list` to see `format_flight_pricecheck_request` and `flight_pricecheck`.
- Use the JSON examples above to call each tool.


---

## 4. Environment Setup

### Recommended Environment Variables

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

This is used if you rely on Gemini for any text/image parsing in your own integration or in helper scripts.  
The MCP tools themselves focus on **textual flight details** and Navifare’s price discovery.

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Set it as `GEMINI_API_KEY` in your environment

---

## 5. Troubleshooting

**“Gemini API key not configured”**
- Set `GEMINI_API_KEY` environment variable (if your integration uses Gemini).

**“Invalid arguments for tool flight_pricecheck”**
- Ensure all required fields are present (`trip.legs`, `travelClass`, `adults`, `children`, `infantsInSeat`, `infantsOnLap`, `source`, `price`, `currency`).
- Use the exact structure returned by `format_flight_pricecheck_request` or `tools/list` schemas.

**"Tool format_flight_pricecheck_request says more info needed"**
- Ask the user follow‑up questions for the missing fields.
- Re‑call the tool with the enriched `user_request`.

**"One-way trips are not yet supported"**
- Provide a round-trip itinerary with both outbound and return flights (2 legs).

**"Open-jaw trips are not yet supported"**
- Ensure the return flight departs from the outbound destination and arrives at the outbound origin.
- Example: If outbound is JFK → CDG, return must be CDG → JFK.

---

## 6. Support

For issues or questions:

- **API Issues**: Contact Navifare support  
- **MCP Server**: Create an issue in this repository  
- **Gemini API**: Check Google AI Studio documentation


