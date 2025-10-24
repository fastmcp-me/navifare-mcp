#!/bin/bash

# Script to start both MCP servers with proper cleanup
echo "🧹 Cleaning up existing processes..."

# Kill any existing processes on the ports we need
pkill -f "node.*http-server.js" 2>/dev/null || true
pkill -f "mcp-inspector" 2>/dev/null || true

# Wait a moment for processes to fully terminate
sleep 2

# Kill any processes still using our ports
lsof -ti:2091 | xargs kill -9 2>/dev/null || true
lsof -ti:6274 | xargs kill -9 2>/dev/null || true
lsof -ti:6277 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting HTTP Server..."
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
npm run serve &
HTTP_PID=$!

# Wait for HTTP server to start
sleep 3

echo "🚀 Starting MCP Inspector..."
DANGEROUSLY_OMIT_AUTH=true MCP_TIMEOUT=90000 npx @modelcontextprotocol/inspector node stdio-server.js &
INSPECTOR_PID=$!

# Wait for MCP Inspector to start
sleep 5

echo "✅ Both servers started!"
echo "📊 HTTP Server PID: $HTTP_PID"
echo "📊 MCP Inspector PID: $INSPECTOR_PID"
echo "🌐 HTTP Server: http://localhost:2091"
echo "🌐 MCP Inspector: http://localhost:6274"

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up processes..."
    kill $HTTP_PID 2>/dev/null || true
    kill $INSPECTOR_PID 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Keep the script running
wait
