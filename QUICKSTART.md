# 🚀 Quick Start Guide - Deploy Locally in 5 Minutes

## Prerequisites Check

```bash
# Check Node.js (need v18+)
node --version

# Check npm
npm --version

# Check if ngrok is installed (if not, see NGROK_SETUP.md)
ngrok version
```

## Step 1: Prepare Environment (2 minutes)

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp

# Create .env file with your API keys
cat > .env << 'EOF'
NAVIFARE_API_KEY=your_navifare_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
PORT=2091
NODE_ENV=development
EOF

# Edit the .env file and add your actual API keys
nano .env  # or use your preferred editor
```

## Step 2: Build Everything (1 minute)

```bash
# Use the quick start script
./start-local.sh

# Or manually:
# npm run build
# cd web && npm run build && cd ..
# cp web/dist/component.js src/components/
# npm run serve
```

## Step 3: Start ngrok (1 minute)

**In a new terminal window:**

```bash
ngrok http 2091
```

**Copy the HTTPS URL** from the output (looks like `https://abc123.ngrok-free.app`)

## Step 4: Connect to ChatGPT (1 minute)

1. Open ChatGPT (Plus/Team required)
2. Go to **Settings** → **Beta Features** or **Apps**
3. Enable **MCP** (Model Context Protocol)
4. Add new MCP server:
   - **Name**: Navifare Flight Price Finder
   - **URL**: `https://YOUR-NGROK-URL.ngrok-free.app/mcp`
   - **Description**: Find better flight prices from screenshots

5. **Save** and **Enable**

## Step 5: Test! (30 seconds)

In ChatGPT, try:

```
I have a flight booking screenshot. Can you help me find better prices?
```

Then upload a flight booking screenshot!

---

## Troubleshooting

**Server won't start?**
```bash
# Check if port is in use
lsof -i :2091
# Kill process if needed
kill -9 <PID>
```

**ngrok not found?**
```bash
# Install via Homebrew (macOS)
brew install ngrok/ngrok/ngrok
```

**React widget not loading?**
```bash
# Rebuild everything
cd web && npm run build && cd ..
cp web/dist/component.js src/components/
npm run build
# Restart server (Ctrl+C, then npm run serve)
```

**ChatGPT can't connect?**
- ✅ Check HTTP server is running
- ✅ Check ngrok is running
- ✅ Use HTTPS URL (not HTTP)
- ✅ URL ends with `/mcp`
- ✅ Test: `curl https://YOUR-URL.ngrok-free.app/health`

---

## Monitoring

**View Requests:**
- ngrok web interface: http://127.0.0.1:4040
- Server logs: Check terminal with `npm run serve`

**Test Endpoints:**
```bash
# Health check
curl https://YOUR-URL.ngrok-free.app/health

# Should return: {"status":"healthy",...}
```

---

## Making Changes

1. **Stop server** (Ctrl+C)
2. **Make your changes**
3. **Rebuild**: `./start-local.sh`
4. **Refresh** ChatGPT connection

---

## Need Help?

- **Full Deployment Guide**: See `LOCAL_DEPLOYMENT.md`
- **ngrok Setup**: See `NGROK_SETUP.md`
- **React Widget**: See `REACT_WIDGET_GUIDE.md`
- **OpenAI Integration**: See `OPENAI_INTEGRATION.md`

---

**You're all set! 🎉**

Your MCP server is now running and accessible from ChatGPT. Start testing with real flight bookings!

