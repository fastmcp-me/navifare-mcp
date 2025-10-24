#!/bin/bash

# 🚀 Render Deployment Script for Navifare MCP Server
# This script helps prepare your MCP server for Render deployment

set -e

echo "🚀 Preparing Navifare MCP Server for Render deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the navifare-mcp directory."
    exit 1
fi

# Check if required files exist
echo "📋 Checking required files..."
required_files=("Dockerfile" "render.yaml" ".dockerignore" "http-server.js")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Error: $file not found. Please ensure all deployment files are created."
        exit 1
    fi
    echo "✅ $file found"
done

# Check if environment variables are documented
echo "🔑 Checking environment variables..."
if [ ! -f ".env.example" ]; then
    echo "⚠️  Warning: .env.example not found. Creating one..."
    cat > .env.example << EOF
# Navifare MCP Server Environment Variables
# Copy this file to .env and fill in your actual values

# Required: Your Navifare API key for flight price discovery
NAVIFARE_API_KEY=your_navifare_api_key_here

# Required: Your Google Gemini API key for image extraction
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Server port (defaults to 10000 on Render)
PORT=10000

# Optional: Node environment (defaults to production)
NODE_ENV=production
EOF
    echo "✅ Created .env.example"
else
    echo "✅ .env.example found"
fi

# Build the application
echo "🔨 Building application..."
npm ci
npm run build

# Build the React widget
echo "🎨 Building React widget..."
cd web
npm ci
npm run build
cd ..

# Copy the built widget to the correct location
echo "📦 Copying widget files..."
cp web/dist/component.js src/components/

echo "✅ Build complete!"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found."
    echo "📝 Please create a .env file with your API keys:"
    echo "   cp .env.example .env"
    echo "   # Then edit .env with your actual API keys"
    echo ""
fi

echo ""
echo "🎉 Your MCP server is ready for Render deployment!"
echo ""
echo "📋 Next steps:"
echo "1. Push your code to GitHub/GitLab/Bitbucket"
echo "2. Go to https://render.com"
echo "3. Create a new Web Service"
echo "4. Connect your repository"
echo "5. Use Docker deployment method"
echo "6. Set these environment variables:"
echo "   - NAVIFARE_API_KEY=your_actual_api_key"
echo "   - GEMINI_API_KEY=your_actual_api_key"
echo "   - NODE_ENV=production"
echo "   - PORT=10000"
echo ""
echo "📖 For detailed instructions, see RENDER_DEPLOYMENT_GUIDE.md"
echo ""
echo "🔗 Your MCP endpoint will be: https://your-service-name.onrender.com/mcp"
echo ""
echo "Happy deploying! 🚀"
