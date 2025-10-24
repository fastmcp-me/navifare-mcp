#!/bin/bash

# Script to stop all MCP servers
echo "🧹 Stopping all MCP servers..."

# Kill any existing processes on the ports we need
pkill -f "node.*http-server.js" 2>/dev/null || true
pkill -f "mcp-inspector" 2>/dev/null || true

# Wait a moment for processes to fully terminate
sleep 2

# Force kill any processes still using our ports
lsof -ti:2091 | xargs kill -9 2>/dev/null || true
lsof -ti:6274 | xargs kill -9 2>/dev/null || true
lsof -ti:6277 | xargs kill -9 2>/dev/null || true

echo "✅ All servers stopped!"
