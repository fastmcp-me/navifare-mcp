#!/bin/bash

# Quick Start Script for Local Deployment
# This script builds and starts the HTTP server for ChatGPT testing

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║  🚀 Navifare MCP - Quick Start for Local Deployment           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "   Please run this script from the mcp/navifare-mcp directory"
    exit 1
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo ""
    echo "Creating a template .env file..."
    cat > .env << 'EOF'
# Navifare API Configuration
NAVIFARE_API_KEY=your_navifare_api_key_here

# Gemini API Configuration (for image extraction)
GEMINI_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=2091
NODE_ENV=development
EOF
    echo "✅ Created .env file"
    echo "⚠️  Please edit .env and add your API keys!"
    echo ""
    read -p "Press Enter to continue after editing .env, or Ctrl+C to exit..."
fi

# Step 1: Build MCP server
echo "📦 Step 1/4: Building MCP server..."
npm run build
echo "✅ MCP server built successfully"
echo ""

# Step 2: Build React component
echo "📦 Step 2/4: Building React component..."
if [ -d "web" ]; then
    cd web
    npm run build
    cd ..
    echo "✅ React component built successfully"
else
    echo "⚠️  Warning: web directory not found, skipping React build"
fi
echo ""

# Step 3: Copy React component
echo "📦 Step 3/4: Copying React component..."
if [ -f "web/dist/component.js" ]; then
    cp web/dist/component.js src/components/
    echo "✅ React component copied to components directory"
else
    echo "⚠️  Warning: React component not found, skipping copy"
fi
echo ""

# Step 4: Start HTTP server
echo "🚀 Step 4/4: Starting HTTP server..."
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║  ✅ Build complete! Starting server...                         ║"
echo "║                                                                ║"
echo "║  Next steps:                                                  ║"
echo "║  1. Open a new terminal                                       ║"
echo "║  2. Run: ngrok http 2091                                      ║"
echo "║  3. Copy the ngrok HTTPS URL                                  ║"
echo "║  4. Add /mcp to the end: https://xxx.ngrok.app/mcp           ║"
echo "║  5. Configure in ChatGPT settings                             ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Start the server
npm run serve

