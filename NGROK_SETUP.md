# ngrok Setup Guide

## What is ngrok?

ngrok is a tunneling tool that creates a secure connection from the public internet to your local development server. It's perfect for testing webhooks, APIs, and in this case, connecting your local MCP server to ChatGPT.

## Installation

### macOS

**Option 1: Homebrew (Recommended)**
```bash
brew install ngrok/ngrok/ngrok
```

**Option 2: Download**
1. Visit [https://ngrok.com/download](https://ngrok.com/download)
2. Download the macOS version
3. Unzip the file
4. Move to /usr/local/bin:
   ```bash
   sudo mv ngrok /usr/local/bin/ngrok
   ```

### Linux

**Option 1: apt (Debian/Ubuntu)**
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && \
  echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | \
  sudo tee /etc/apt/sources.list.d/ngrok.list && \
  sudo apt update && sudo apt install ngrok
```

**Option 2: Download**
```bash
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
```

### Windows

**Option 1: Chocolatey**
```powershell
choco install ngrok
```

**Option 2: Download**
1. Visit [https://ngrok.com/download](https://ngrok.com/download)
2. Download the Windows version
3. Unzip and add to PATH

## Verify Installation

```bash
ngrok version
```

You should see output like:
```
ngrok version 3.x.x
```

## Sign Up (Optional but Recommended)

### Why Sign Up?

**Free Account Benefits:**
- Longer session times (8 hours vs 2 hours)
- More connections per minute
- Reserved subdomains (on paid plans)
- Web interface with request inspection
- Better monitoring and analytics

### Steps:

1. **Create Account**: Visit [https://dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup)

2. **Get Auth Token**: After signing up, go to [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)

3. **Authenticate ngrok**:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
   ```

## Basic Usage

### Start a Tunnel

```bash
# Tunnel to port 2091 (our MCP server)
ngrok http 2091
```

### Output Explanation

```
ngrok                                                                           

Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok-free.app -> http://localhost:2091

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Key Information:**
- **Session Status**: Should be "online"
- **Web Interface**: http://127.0.0.1:4040 for monitoring
- **Forwarding**: Your public HTTPS URL → `https://abc123.ngrok-free.app`

## Using the Web Interface

1. **Open**: http://127.0.0.1:4040 in your browser
2. **Features**:
   - See all HTTP requests in real-time
   - Inspect request/response headers and bodies
   - Replay requests
   - Monitor bandwidth and performance

## Advanced Usage

### Custom Subdomain (Paid Plans)

```bash
ngrok http --subdomain=navifare 2091
# Creates: https://navifare.ngrok.app
```

### Configuration File

Create `~/.ngrok2/ngrok.yml`:

```yaml
version: "2"
authtoken: YOUR_AUTH_TOKEN

tunnels:
  navifare-mcp:
    proto: http
    addr: 2091
    inspect: true
    bind_tls: true
```

Start with:
```bash
ngrok start navifare-mcp
```

### Multiple Tunnels

```bash
# Terminal 1: MCP server
ngrok http 2091

# Terminal 2: Another service
ngrok http 3000
```

## Common Issues

### Issue: "command not found: ngrok"

**Solution:**
```bash
# Verify PATH
echo $PATH

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="/usr/local/bin:$PATH"

# Reload shell
source ~/.zshrc  # or source ~/.bashrc
```

### Issue: "Account limit exceeded"

**Solution:**
- Upgrade to a paid plan
- Or use a different email to create a new free account
- Or wait for the rate limit to reset

### Issue: "Tunnel not found"

**Solution:**
- Make sure your local server is running first
- Verify the port number is correct
- Check firewall settings

### Issue: "Failed to complete tunnel connection"

**Solution:**
- Check internet connectivity
- Try a different region: `ngrok http --region=eu 2091`
- Restart ngrok

### Issue: Session expires too quickly

**Solution:**
- Sign up for a free account (8 hour sessions)
- Or keep restarting ngrok when needed
- Or upgrade to a paid plan (unlimited)

## Tips & Best Practices

### 1. Keep ngrok Running

- Don't close the terminal window with ngrok
- If it stops, your ChatGPT connection will break
- Consider using `tmux` or `screen` for persistent sessions

### 2. Monitor Traffic

- Always check the web interface (http://127.0.0.1:4040)
- Look for errors or suspicious requests
- Use it to debug issues

### 3. Security

- Don't share your ngrok URL publicly
- Rotate URLs frequently (each restart gives new URL)
- Add authentication to your MCP server for production

### 4. Development Workflow

```bash
# Terminal 1: Start local server
cd /path/to/mcp/navifare-mcp
npm run serve

# Terminal 2: Start ngrok
ngrok http 2091

# Terminal 3: Development work
# Make changes, rebuild, restart server
```

### 5. Copy URL Quickly

```bash
# macOS
ngrok http 2091 | grep "Forwarding" | awk '{print $5}' | pbcopy

# Linux
ngrok http 2091 | grep "Forwarding" | awk '{print $5}' | xclip -selection clipboard
```

## Alternatives to ngrok

If ngrok doesn't work for you, try:

1. **localtunnel**
   ```bash
   npm install -g localtunnel
   lt --port 2091
   ```

2. **Cloudflare Tunnel**
   ```bash
   cloudflared tunnel --url http://localhost:2091
   ```

3. **serveo.net**
   ```bash
   ssh -R 80:localhost:2091 serveo.net
   ```

4. **Tailscale** (for private access)
   ```bash
   # Install Tailscale, then:
   tailscale funnel 2091
   ```

## Production Alternatives

For production deployments, use proper hosting instead of tunneling:

- **Fly.io**: `flyctl launch`
- **Render**: Connect GitHub repo
- **Railway**: `railway up`
- **Google Cloud Run**: `gcloud run deploy`
- **AWS Lambda**: Use API Gateway
- **Heroku**: `git push heroku main`

## Pricing

### ngrok Plans

- **Free**: 
  - 1 online ngrok process
  - 40 connections/minute
  - Random URLs

- **Personal ($10/month)**:
  - 3 online ngrok processes
  - 120 connections/minute
  - Custom subdomains
  - Reserved domains

- **Pro ($39/month)**:
  - More processes and connections
  - IP whitelisting
  - Advanced analytics

## Resources

- **Official Site**: [https://ngrok.com](https://ngrok.com)
- **Documentation**: [https://ngrok.com/docs](https://ngrok.com/docs)
- **Dashboard**: [https://dashboard.ngrok.com](https://dashboard.ngrok.com)
- **Status Page**: [https://status.ngrok.com](https://status.ngrok.com)

## Quick Reference

```bash
# Start tunnel
ngrok http 2091

# Start with custom region
ngrok http --region=eu 2091

# Start with subdomain (paid)
ngrok http --subdomain=myapp 2091

# View version
ngrok version

# View help
ngrok help

# Update ngrok
brew upgrade ngrok  # macOS
```

---

**Ready to Connect?**

1. ✅ ngrok installed and authenticated
2. ✅ Local server running (`npm run serve`)
3. ✅ ngrok tunnel started (`ngrok http 2091`)
4. ✅ HTTPS URL copied
5. ✅ Ready to configure in ChatGPT!

Go to ChatGPT → Settings → Apps SDK → Add your MCP server URL! 🚀

