#!/usr/bin/env node

/**
 * MCP Server Wrapper for MCP Inspector
 * This wrapper handles command line arguments that the MCP Inspector might pass
 */

// Ignore any command line arguments that the MCP server doesn't understand
process.argv = process.argv.filter(arg => !arg.includes('--port'));

// Import and run the actual MCP server
import('./dist/index.js').catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
