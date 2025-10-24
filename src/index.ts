// @ts-ignore
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
// @ts-ignore  
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { submit_session, submit_and_poll_session } from "./navifare.js";

const mcpServer = new McpServer({ name: "navifare-mcp", version: "0.1.0" });

mcpServer.registerTool(
  "flight_pricecheck",
  {
    description: "Find a better price for a specific flight the user has already found. This tool searches multiple booking sources to compare prices and find cheaper alternatives for the exact same flight details. The user must provide the specific flight they found including airline, flight numbers, airports, dates, times, and the price they saw.",
    inputSchema: {
      trip: z.object({
        legs: z.array(
          z.object({
            segments: z.array(
              z.object({
                airline: z.string().describe("2-letter airline code (e.g., 'AZ' for Alitalia)"),
                flightNumber: z.string().describe("Flight number (e.g., '2133')"),
                departureAirport: z.string().describe("3-letter IATA code (e.g., 'LIN')"),
                arrivalAirport: z.string().describe("3-letter IATA code (e.g., 'FCO')"),
                departureDate: z.string().describe("YYYY-MM-DD format"),
                departureTime: z.string().describe("HH:MM format (e.g., '13:00'). ASK the user if not provided."),
                arrivalTime: z.string().describe("HH:MM format (e.g., '14:10'). ASK the user if not provided."),
                plusDays: z.number().describe("0 if arrival is same day, 1 if next day, etc."),
              })
            ),
          })
        ),
        travelClass: z.string().describe("ECONOMY, BUSINESS, or FIRST"),
        adults: z.number(),
        children: z.number(),
        infantsInSeat: z.number(),
        infantsOnLap: z.number(),
      }),
      source: z.string().describe("Set to 'ChatGPT'"),
      price: z.string().describe("Reference price the user saw (numeric, e.g., '99')"),
      currency: z.string().describe("3-letter currency code (e.g., 'EUR', 'USD', 'CHF')"),
      location: z.string().optional().describe("User's country (optional, e.g., 'Italy', 'IT', 'Milan, Italy')"),
    },
  },
  async (input: any) => {
    return await submit_and_poll_session(input as unknown as any);
  }
);

mcpServer.registerTool(
  "submit_session",
  {
    description: "Create a price discovery session in Navifare",
    inputSchema: {
      trip: z.object({
        legs: z.array(
          z.object({
            segments: z.array(
              z.object({
                airline: z.string(),
                flightNumber: z.string(),
                departureAirport: z.string(),
                arrivalAirport: z.string(),
                departureDate: z.string(),
                departureTime: z.string(), // Can be "HH:MM" or "HH:MM:SS"
                arrivalTime: z.string(),   // Can be "HH:MM" or "HH:MM:SS"
                plusDays: z.number(),
              })
            ),
          })
        ),
        travelClass: z.string(),
        adults: z.number(),
        children: z.number(),
        infantsInSeat: z.number(),
        infantsOnLap: z.number(),
      }),
      source: z.string(),
      price: z.string(),
      currency: z.string(),
      location: z.string().optional(),
    },
  },
  async (input: any) => {
    return await submit_session(input as unknown as any);
  }
);


// New user-friendly tool that handles natural language input
mcpServer.registerTool(
  "format_flight_pricecheck_request",
  {
    description: "Parse flight details from natural language to prepare for price comparison. Use this when the user mentions a specific flight they found and wants to check for better prices. I'll ask follow-up questions to collect all required flight details.",
    inputSchema: {
      user_request: z.string().describe("Describe the specific flight you found and want to check for better prices (e.g., 'I found LX 1612 from MXP to FCO on Nov 4th at 6:40 PM for 150 EUR')"),
      conversation_context: z.string().optional().describe("Previous conversation context if this is a follow-up question")
    },
  },
  async (input) => {
    const { user_request, conversation_context } = input;
    
    // Parse the user's natural language request
    const parsedRequest = await parseFlightRequest(user_request, conversation_context);
    
    if (parsedRequest.needsMoreInfo) {
      return {
        message: parsedRequest.message,
        needsMoreInfo: true,
        missingFields: parsedRequest.missingFields
      };
    }
    
    // If we have all the information, transform it to the exact API format
    const apiRequest = transformToApiFormat(parsedRequest.flightData);
    
    // Call the existing search_flights tool with the properly formatted data
    return await submit_and_poll_session(apiRequest);
  }
);

// Helper function to parse natural language flight requests
async function parseFlightRequest(userRequest: string, context?: string): Promise<any> {
  // This is a simplified version - in production, you'd use an LLM service
  const flightData: any = {
    departure: null,
    arrival: null,
    departureDate: null,
    returnDate: null,
    departureTime: null,
    arrivalTime: null,
    returnDepartureTime: null,
    returnArrivalTime: null,
    airline: null,
    flightNumber: null,
    returnAirline: null,
    returnFlightNumber: null,
    travelClass: 'ECONOMY',
    adults: 1,
    children: 0,
    infantsInSeat: 0,
    infantsOnLap: 0,
    source: 'ChatGPT',
    price: '0.00',
    currency: 'EUR',
    location: 'IT'
  };
  
  const missingFields: string[] = [];
  
  // Basic parsing logic (in production, use an LLM for better parsing)
  const text = userRequest.toLowerCase();
  
  // Extract airports
  if (text.includes('milan') || text.includes('mxp')) {
    flightData.departure = 'MXP';
  }
  if (text.includes('rome') || text.includes('fco')) {
    flightData.arrival = 'FCO';
  }
  
  // Extract dates
  const dateRegex = /(\d{4}-\d{2}-\d{2})/g;
  const dates = userRequest.match(dateRegex);
  if (dates && dates.length >= 1) {
    flightData.departureDate = dates[0];
  }
  if (dates && dates.length >= 2) {
    flightData.returnDate = dates[1];
  }
  
  // Extract times
  const timeRegex = /(\d{1,2}:\d{2})/g;
  const times = userRequest.match(timeRegex);
  if (times && times.length >= 1) {
    flightData.departureTime = times[0] + ':00';
  }
  if (times && times.length >= 2) {
    flightData.arrivalTime = times[1] + ':00';
  }
  if (times && times.length >= 3) {
    flightData.returnDepartureTime = times[2] + ':00';
  }
  if (times && times.length >= 4) {
    flightData.returnArrivalTime = times[3] + ':00';
  }
  
  // Extract airline and flight number
  const airlineMatch = userRequest.match(/([A-Z]{2})\s*(\d{3,4})/);
  if (airlineMatch) {
    flightData.airline = airlineMatch[1];
    flightData.flightNumber = airlineMatch[2];
  }
  
  // Check for missing required fields
  if (!flightData.departure) missingFields.push('departure airport');
  if (!flightData.arrival) missingFields.push('arrival airport');
  if (!flightData.departureDate) missingFields.push('departure date');
  if (!flightData.returnDate) missingFields.push('return date');
  if (!flightData.departureTime) missingFields.push('departure time');
  if (!flightData.arrivalTime) missingFields.push('arrival time');
  if (!flightData.returnDepartureTime) missingFields.push('return departure time');
  if (!flightData.returnArrivalTime) missingFields.push('return arrival time');
  if (!flightData.airline) missingFields.push('airline code');
  if (!flightData.flightNumber) missingFields.push('flight number');
  
  if (missingFields.length > 0) {
    return {
      needsMoreInfo: true,
      message: `I need more information to search for your flight. Please provide: ${missingFields.join(', ')}.`,
      missingFields,
      flightData
    };
  }
  
  return {
    needsMoreInfo: false,
    flightData
  };
}

// Helper function to transform parsed data to the exact API format
function transformToApiFormat(flightData: any) {
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

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  // Don't log to stdout in MCP servers - it breaks JSON-RPC protocol
  // console.log("Navifare MCP server running on stdio");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("MCP server failed:", err);
  process.exit(1);
});


