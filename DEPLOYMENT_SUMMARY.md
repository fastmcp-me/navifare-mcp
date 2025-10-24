# 🎉 Local Deployment Setup - COMPLETE!

## ✅ What We Built

Your Navifare MCP server is now ready for local testing with ChatGPT! Here's everything that's set up:

### 1. **HTTP Server Wrapper** (`http-server.js`)
- ✅ Exposes MCP server at `http://localhost:2091/mcp`
- ✅ Health check endpoint at `/health`
- ✅ Streaming support for real-time responses
- ✅ CORS enabled for ChatGPT
- ✅ Proper error handling

### 2. **React-Based Widget**
- ✅ Modern, interactive UI for flight results
- ✅ Favorites system with star ratings
- ✅ Sorting (by rank, price, website)
- ✅ Special fare filtering
- ✅ Fullscreen support
- ✅ State persistence across sessions

### 3. **Three MCP Tools**
- ✅ `extract_image` - Extract flight details from screenshots
- ✅ `submit_session` - Create price discovery sessions
- ✅ `get_session_results` - Display interactive results

### 4. **Complete Documentation**
- ✅ `QUICKSTART.md` - 5-minute quick start guide
- ✅ `LOCAL_DEPLOYMENT.md` - Comprehensive deployment guide
- ✅ `NGROK_SETUP.md` - Complete ngrok installation & usage
- ✅ `REACT_WIDGET_GUIDE.md` - React component documentation
- ✅ `IMAGE_INPUT_GUIDE.md` - Image handling guide

### 5. **Helper Scripts**
- ✅ `start-local.sh` - One-command build and start
- ✅ `npm run serve` - Start HTTP server
- ✅ `npm run deploy:local` - Build and serve

---

## 🚀 How to Use It

### **Terminal 1: Start Your MCP Server**

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp

# Quick start (recommended)
./start-local.sh

# OR manually
npm run serve
```

You'll see:
```
╔════════════════════════════════════════════════════════════════╗
║  🚀 Navifare MCP HTTP Server Running                          ║
║  Local:     http://localhost:2091                              ║
║  MCP:       http://localhost:2091/mcp                          ║
╚════════════════════════════════════════════════════════════════╝
```

**⚠️ Keep this terminal window open!** The server needs to stay running.

---

### **Terminal 2: Start ngrok**

**First, install ngrok if you haven't:**
```bash
# macOS
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

**Then start the tunnel:**
```bash
ngrok http 2091
```

You'll see:
```
Forwarding    https://abc123.ngrok-free.app -> http://localhost:2091
```

**Copy that HTTPS URL!** (e.g., `https://abc123.ngrok-free.app`)

**⚠️ Keep this terminal window open too!** The tunnel needs to stay active.

---

### **Browser: Connect to ChatGPT**

1. **Open ChatGPT** (requires Plus or Team account)

2. **Go to Settings** → **Beta Features** or **Apps**

3. **Enable MCP** (Model Context Protocol)

4. **Add Your Server**:
   - **Name**: `Navifare Flight Price Finder`
   - **URL**: `https://abc123.ngrok-free.app/mcp` ← Add `/mcp` to your ngrok URL
   - **Description**: `Find better flight prices from booking screenshots`

5. **Save** and **Enable**

---

## 🧪 Test It!

### **Test 1: Image Upload**
In ChatGPT, say:
```
I have a flight booking screenshot. Can you help me find better prices?
```
Then **upload a screenshot** of a flight booking (from any airline or travel site).

ChatGPT will:
1. ✅ Extract flight details using `extract_image`
2. ✅ Submit a price discovery session
3. ✅ Show you an interactive widget with results

### **Test 2: Manual Entry**
```
Search for flights from ZRH to JFK on March 15, 2025, 
returning March 22, 2025, for 2 adults in economy.
```

### **Test 3: Check Results**
```
Show me the results for request ID: [paste request_id]
```

---

## 🔍 Monitor & Debug

### **View Requests in Real-Time**

1. **ngrok Web Interface**: http://127.0.0.1:4040
   - See every HTTP request
   - Inspect headers and bodies
   - Replay requests for debugging

2. **Server Logs**: Watch Terminal 1
   - See MCP requests
   - Tool invocations
   - Errors and warnings

### **Test Health Endpoint**

```bash
curl https://YOUR-NGROK-URL.ngrok-free.app/health

# Should return:
# {"status":"healthy","service":"navifare-mcp","version":"0.1.0",...}
```

---

## 🔄 Making Changes

When you update your code:

1. **Stop the server** in Terminal 1 (Ctrl+C)

2. **Rebuild**:
   ```bash
   ./start-local.sh
   ```

3. **In ChatGPT**: Disconnect and reconnect the MCP server

**Note:** ngrok can stay running - no need to restart it!

---

## ⚠️ Important Notes

### **Both Terminals Must Stay Open**
- Terminal 1: HTTP server (`npm run serve`)
- Terminal 2: ngrok tunnel (`ngrok http 2091`)

If you close either one, ChatGPT will lose connection.

### **ngrok URL Changes**
Every time you restart ngrok, you get a **new URL**. You'll need to:
1. Copy the new URL
2. Update it in ChatGPT settings

**Tip:** Get a free ngrok account for longer-lasting URLs (8 hours instead of 2).

### **API Keys Required**
Make sure your `.env` file has:
- `NAVIFARE_API_KEY` - For price discovery
- `GEMINI_API_KEY` - For image extraction

---

## 🎯 Success Checklist

Before testing with ChatGPT, verify:

- [ ] ✅ HTTP server is running (Terminal 1)
- [ ] ✅ ngrok tunnel is active (Terminal 2)
- [ ] ✅ Health endpoint returns 200 OK
- [ ] ✅ `.env` file has API keys
- [ ] ✅ React component is built
- [ ] ✅ ngrok URL is HTTPS (not HTTP)
- [ ] ✅ URL in ChatGPT ends with `/mcp`
- [ ] ✅ MCP server enabled in ChatGPT

---

## 📚 Documentation Reference

- **Quick Start**: `QUICKSTART.md`
- **Full Deployment**: `LOCAL_DEPLOYMENT.md`
- **ngrok Setup**: `NGROK_SETUP.md`
- **React Widget**: `REACT_WIDGET_GUIDE.md`
- **Image Handling**: `IMAGE_INPUT_GUIDE.md`
- **OpenAI Integration**: `OPENAI_INTEGRATION.md`

---

## 🆘 Troubleshooting

### Server won't start?
```bash
# Check if port is in use
lsof -i :2091

# Kill the process
kill -9 <PID>
```

### ngrok not working?
```bash
# Install via Homebrew
brew install ngrok/ngrok/ngrok

# Authenticate (optional but recommended)
ngrok config add-authtoken YOUR_TOKEN
```

### ChatGPT can't connect?
1. ✅ Verify both terminals are running
2. ✅ Test health: `curl https://YOUR-URL.ngrok-free.app/health`
3. ✅ Check URL ends with `/mcp`
4. ✅ Use HTTPS (not HTTP)

### Widget not loading?
```bash
# Rebuild React component
cd web && npm run build && cd ..
cp web/dist/component.js src/components/

# Rebuild and restart server
npm run build
npm run serve
```

---

## 🎉 You're Ready!

**Your MCP server is fully set up and ready for testing!**

Just follow these 3 steps whenever you want to use it:

1. **Terminal 1**: `./start-local.sh` (or `npm run serve`)
2. **Terminal 2**: `ngrok http 2091`
3. **ChatGPT**: Connect to your ngrok URL + `/mcp`

Then start uploading flight screenshots and finding better prices! ✈️💰

---

**Questions?** Check the documentation files or the detailed guides mentioned above.

**Ready for Production?** See `LOCAL_DEPLOYMENT.md` for deployment options (Fly.io, Render, Railway, etc.).

