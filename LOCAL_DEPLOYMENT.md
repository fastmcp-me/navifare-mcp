# Local Deployment Guide for ChatGPT Testing

This guide walks you through deploying your Navifare MCP server locally for testing with ChatGPT, following the [OpenAI Apps SDK deployment guidelines](https://developers.openai.com/apps-sdk/deploy).

## 🎯 Overview

To test your MCP server with ChatGPT, you need to:
1. Run an HTTP server wrapper that exposes your MCP server
2. Create a secure tunnel using ngrok
3. Connect ChatGPT to your tunneled endpoint

## 📋 Prerequisites

### 1. Install ngrok

**macOS (using Homebrew):**
```bash
brew install ngrok/ngrok/ngrok
```

**Or download directly:**
1. Visit [ngrok.com/download](https://ngrok.com/download)
2. Download for your platform
3. Unzip and add to your PATH

**Verify installation:**
```bash
ngrok version
```

### 2. Sign up for ngrok (Optional but recommended)

1. Create a free account at [ngrok.com](https://ngrok.com)
2. Get your auth token from the dashboard
3. Authenticate ngrok:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

This gives you:
- Longer session times
- Custom subdomains (paid plans)
- Better monitoring

### 3. Set Environment Variables

Create a `.env` file in the MCP directory:

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
cat > .env << EOF
# Navifare API Configuration
NAVIFARE_API_KEY=your_navifare_api_key_here

# Gemini API Configuration (for image extraction)
GEMINI_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=2091
NODE_ENV=development
EOF
```

## 🚀 Deployment Steps

### Step 1: Build the Project

Build both the MCP server and React component:

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp

# Build MCP server
npm run build

# Build React component
cd web
npm run build
cd ..

# Copy React component to components directory
cp web/dist/component.js src/components/
```

### Step 2: Start the HTTP Server

In one terminal window:

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
npm run serve
```

You should see:
```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  🚀 Navifare MCP HTTP Server Running                          ║
║                                                                ║
║  Local:     http://localhost:2091                              ║
║  MCP:       http://localhost:2091/mcp                          ║
║  Health:    http://localhost:2091/health                       ║
║                                                                ║
║  Ready for ChatGPT integration via ngrok!                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

### Step 3: Start ngrok Tunnel

In a **second terminal window**:

```bash
ngrok http 2091
```

You'll see output like:
```
ngrok                                                                           

Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abcd-1234-5678.ngrok-free.app -> http://localhost:2091

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Important**: Copy the HTTPS forwarding URL (e.g., `https://abcd-1234-5678.ngrok-free.app`)

### Step 4: Test the Endpoints

In a **third terminal window**, verify the server is accessible:

```bash
# Test health endpoint
curl https://YOUR-NGROK-URL.ngrok-free.app/health

# Should return:
# {"status":"healthy","service":"navifare-mcp","version":"0.1.0","timestamp":"..."}
```

### Step 5: Connect to ChatGPT

1. Open ChatGPT (requires ChatGPT Plus or Team)
2. Go to **Settings** → **Apps SDK** (or similar)
3. Add a new MCP connection:
   - **Name**: Navifare Flight Price Finder
   - **URL**: `https://YOUR-NGROK-URL.ngrok-free.app/mcp`
   - **Description**: Find better flight prices from booking screenshots

4. Save and enable the connection

### Step 6: Test in ChatGPT

Try these prompts:

**Test 1: Image Upload**
```
I have a flight booking screenshot. Can you help me find better prices?
[Upload your flight booking screenshot]
```

**Test 2: Manual Entry**
```
Search for flights from ZRH to JFK on 2025-03-15, returning on 2025-03-22, 
for 2 adults in economy class.
```

**Test 3: View Results**
```
Show me the flight price results for request ID: [request_id from previous search]
```

## 🔍 Monitoring & Debugging

### View ngrok Traffic

1. Open the ngrok web interface: http://127.0.0.1:4040
2. See all HTTP requests and responses in real-time
3. Replay requests for debugging

### Server Logs

Watch the HTTP server terminal for:
- Incoming MCP requests
- Tool invocations
- Errors and warnings

### MCP Inspector (Alternative Testing)

For local testing without ChatGPT:

```bash
cd /Users/simonenavifare/navifare/frontend/front-end/mcp/navifare-mcp
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a browser-based testing interface at http://localhost:6274

## 🛠️ Troubleshooting

### Issue: "ngrok not found"

**Solution:**
```bash
# Install via Homebrew
brew install ngrok/ngrok/ngrok

# Or download from ngrok.com and add to PATH
```

### Issue: "Port 2091 already in use"

**Solution:**
```bash
# Find process using port 2091
lsof -i :2091

# Kill the process
kill -9 <PID>

# Or change the port in .env
echo "PORT=3000" >> .env
npm run serve
ngrok http 3000
```

### Issue: ChatGPT can't connect

**Checklist:**
1. ✅ HTTP server is running (`npm run serve`)
2. ✅ ngrok tunnel is active
3. ✅ Using HTTPS URL (not HTTP)
4. ✅ URL ends with `/mcp`
5. ✅ Health endpoint returns 200 OK

### Issue: "Request timeout" in ChatGPT

**Possible causes:**
- MCP server crashed (check terminal logs)
- ngrok session expired (restart ngrok)
- Network connectivity issues

**Solution:**
1. Check HTTP server logs
2. Verify ngrok is still running
3. Test health endpoint with curl
4. Restart both servers if needed

### Issue: React widget not loading

**Solution:**
```bash
# Rebuild the React component
cd web
npm run build
cd ..

# Copy to components directory
cp web/dist/component.js src/components/

# Rebuild MCP server
npm run build

# Restart HTTP server
# (Ctrl+C to stop, then npm run serve)
```

### Issue: Environment variables not loaded

**Solution:**
```bash
# Install dotenv if not already installed
npm install dotenv

# Or manually export variables
export NAVIFARE_API_KEY=your_key_here
export GEMINI_API_KEY=your_key_here

# Then start the server
npm run serve
```

## 📝 Development Workflow

### Making Changes

When you modify your code:

1. **Stop the HTTP server** (Ctrl+C in terminal)
2. **Rebuild the project**:
   ```bash
   npm run build
   # If React component changed:
   cd web && npm run build && cd .. && cp web/dist/component.js src/components/
   ```
3. **Restart the HTTP server**:
   ```bash
   npm run serve
   ```
4. **Refresh in ChatGPT**: Disconnect and reconnect the MCP connection

### Quick Rebuild Command

```bash
npm run deploy:local
```

This runs `build` and `serve` in sequence.

## 🚢 Production Deployment Options

Once you're ready to deploy for real users, consider these platforms:

### Option 1: Fly.io (Recommended)

```bash
# Install flyctl
brew install flyctl

# Login to Fly.io
flyctl auth login

# Deploy
flyctl launch
```

**Benefits:**
- Easy deployment
- Automatic HTTPS
- Scale to zero
- Global CDN

### Option 2: Render

1. Connect your GitHub repo
2. Create a new Web Service
3. Set build command: `npm run build`
4. Set start command: `npm run serve`
5. Add environment variables

**Benefits:**
- GitHub integration
- Automatic deploys
- Free tier available
- Simple configuration

### Option 3: Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up
```

**Benefits:**
- Instant deployments
- Database support
- Team collaboration
- Beautiful dashboard

### Option 4: Google Cloud Run

```bash
# Create Dockerfile
# Build and deploy
gcloud run deploy navifare-mcp --source .
```

**Benefits:**
- Scale to zero
- Pay per request
- Enterprise-grade
- Global availability

## 🔐 Security Considerations

### For Local Testing
- ✅ Use ngrok for secure HTTPS tunnel
- ✅ Don't commit `.env` file to git
- ✅ Rotate API keys regularly
- ✅ Monitor ngrok web interface for suspicious traffic

### For Production
- ✅ Use environment variables for secrets
- ✅ Enable rate limiting
- ✅ Add authentication/authorization
- ✅ Monitor logs and metrics
- ✅ Use HTTPS only
- ✅ Implement request validation
- ✅ Set up error tracking (Sentry, etc.)

## 📊 Performance Tips

### Optimize Response Times
- Cache frequently requested data
- Implement connection pooling
- Use HTTP/2 when possible
- Minimize external API calls

### Monitor Performance
- Track tool invocation times
- Log request/response sizes
- Monitor memory usage
- Set up alerting for errors

## 🎓 Key Concepts Explained

### **HTTP Server Wrapper**
Your MCP server uses STDIO (standard input/output) for communication. ChatGPT requires HTTP endpoints, so the wrapper:
- Accepts HTTP POST requests at `/mcp`
- Spawns an MCP server process for each request
- Pipes data between HTTP and STDIO
- Handles streaming responses

### **ngrok Tunneling**
ngrok creates a secure tunnel from the internet to your local machine:
- Provides a public HTTPS URL
- Routes traffic to `localhost:2091`
- Includes a web interface for monitoring
- Free tier suitable for development/testing

### **ChatGPT Integration**
When you connect your MCP server to ChatGPT:
- ChatGPT discovers your tools via the `/mcp` endpoint
- Tools appear in ChatGPT's function calling interface
- React widgets render in the conversation
- State persists across interactions

### **Widget Loading**
Your React component loads in an iframe within ChatGPT:
- HTML template served from your MCP server
- React bundle imported as ES module
- `window.openai` API provides host communication
- CSP (Content Security Policy) ensures security

## ✅ Testing Checklist

Before connecting to ChatGPT, verify:

- [ ] HTTP server starts successfully
- [ ] ngrok tunnel is established
- [ ] Health endpoint returns 200 OK
- [ ] Environment variables are set
- [ ] React component is built and copied
- [ ] MCP server is built (TypeScript compiled)
- [ ] No errors in server logs
- [ ] ngrok URL is HTTPS (not HTTP)
- [ ] Firewall allows outbound connections
- [ ] All API keys are valid

## 🎉 Success Indicators

You'll know it's working when:

1. ✅ ChatGPT recognizes your MCP tools
2. ✅ Image upload triggers `extract_image` tool
3. ✅ Flight search creates a session
4. ✅ React widget displays with results
5. ✅ Favorites and sorting work in the widget
6. ✅ Booking links open correctly
7. ✅ No errors in any terminal windows

## 📚 Additional Resources

- [OpenAI Apps SDK Documentation](https://developers.openai.com/apps-sdk)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [ngrok Documentation](https://ngrok.com/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

**Next Steps:**
1. Complete the setup steps above
2. Test with sample flight bookings
3. Iterate on the UI/UX based on testing
4. Deploy to production when ready

Your Navifare MCP server is now ready for local testing with ChatGPT! 🚀

