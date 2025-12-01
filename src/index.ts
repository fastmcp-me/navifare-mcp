// @ts-ignore
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
// @ts-ignore  
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { submit_session, get_session_results, submit_and_poll_session } from "./navifare.js";

const mcpServer = new McpServer({ name: "navifare-mcp", version: "0.1.5" });

mcpServer.registerTool(
  "search_flights",
  {
    description: "Search for flight prices across multiple booking sources. Ask the user for ALL required flight details: airline code (2-letter), flight number, departure/arrival airports (3-letter IATA codes), departure/arrival times (HH:MM format), dates (YYYY-MM-DD), cabin class (ECONOMY/BUSINESS/FIRST), number of passengers (adults/children/infants), reference price they saw, and currency. Then submit the search and automatically poll for results.",
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
      location: z.string().optional().describe("User's country code (2-letter ISO, e.g., 'ZZ', 'CH', 'US')"),
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
    },
  },
  async (input: any) => {
    return await submit_session(input as unknown as any);
  }
);

mcpServer.registerTool(
  "get_session_results",
  {
    description: "Get results for a Navifare session",
    inputSchema: { request_id: z.string() },
  },
  async ({ request_id }: { request_id: string }) => {
    return await get_session_results(request_id);
  }
);

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


