declare module "node-fetch" {
  const fetch: typeof globalThis.fetch;
  export default fetch;
}

// Allow subpath imports from the MCP SDK without type complaints
declare module "@modelcontextprotocol/sdk/server/mcp" {
  export * from "@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
}
declare module "@modelcontextprotocol/sdk/server/stdio" {
  export * from "@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
}

