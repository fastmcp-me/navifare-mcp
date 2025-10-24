# 🚀 Render Deployment Guide for Navifare MCP Server

This guide will help you deploy your Navifare MCP server to Render.com for production use with ChatGPT.

## 📋 Prerequisites

- A Render.com account (free tier available)
- Your API keys ready:
  - `NAVIFARE_API_KEY` - For flight price discovery
  - `GEMINI_API_KEY` - For image extraction from screenshots
- Your MCP server code in a Git repository (GitHub, GitLab, or Bitbucket)

## 🎯 Deployment Options

Render offers two deployment methods:
1. **Docker Deployment** (Recommended) - More reliable and consistent
2. **Direct Node.js Deployment** - Simpler but less predictable

We'll use the **Docker deployment** method for better reliability.

---

## 🐳 Method 1: Docker Deployment (Recommended)

### Step 1: Prepare Your Repository

Make sure your repository has these files:
- ✅ `Dockerfile` (already created)
- ✅ `render.yaml` (already created)
- ✅ `.dockerignore` (already created)
- ✅ `package.json` with updated scripts

### Step 2: Deploy on Render

1. **Go to Render Dashboard**
   - Visit [render.com](https://render.com)
   - Sign in to your account

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your Git repository

3. **Configure Service Settings**
   ```
   Name: navifare-mcp
   Environment: Docker
   Region: Choose closest to your users
   Branch: main (or your default branch)
   Dockerfile Path: ./Dockerfile
   ```

4. **Set Environment Variables**
   ```
   NODE_ENV=production
   PORT=10000
   NAVIFARE_API_KEY=your_navifare_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Advanced Settings**
   - **Auto-Deploy**: Yes (deploys on every push)
   - **Health Check Path**: `/health`
   - **Start Command**: (leave empty - uses Dockerfile CMD)

6. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete (5-10 minutes)

### Step 3: Get Your Deployment URL

After deployment, you'll get a URL like:
```
https://navifare-mcp-abc123.onrender.com
```

Your MCP endpoint will be:
```
https://navifare-mcp-abc123.onrender.com/mcp
```

---

## 📦 Method 2: Direct Node.js Deployment

If you prefer not to use Docker:

1. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your Git repository

2. **Configure Service Settings**
   ```
   Name: navifare-mcp
   Environment: Node
   Region: Choose closest to your users
   Branch: main
   Root Directory: ./mcp/navifare-mcp
   Build Command: npm ci && npm run build
   Start Command: npm run serve
   ```

3. **Set Environment Variables**
   ```
   NODE_ENV=production
   PORT=10000
   NAVIFARE_API_KEY=your_navifare_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

---

## 🔧 Configure ChatGPT Integration

### Step 1: Get Your MCP URL

Your MCP server URL will be:
```
https://your-service-name.onrender.com/mcp
```

### Step 2: Configure ChatGPT

1. **Open ChatGPT** (requires Plus or Team account)
2. **Go to Settings** → **Beta Features** or **Apps**
3. **Enable MCP** (Model Context Protocol)
4. **Add Your Server**:
   ```
   Name: Navifare Flight Price Finder
   URL: https://your-service-name.onrender.com/mcp
   Description: Find better flight prices from booking screenshots
   ```
5. **Save** and **Enable**

---

## 🧪 Test Your Deployment

### Step 1: Health Check

Test that your server is running:
```bash
curl https://your-service-name.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "navifare-mcp",
  "version": "0.1.0",
  "timestamp": "2025-01-27T..."
}
```

### Step 2: Test MCP Endpoint

Test the MCP metadata endpoint:
```bash
curl https://your-service-name.onrender.com/mcp
```

Should return your MCP server configuration with available tools.

### Step 3: Test with ChatGPT

In ChatGPT, try:
```
I have a flight booking screenshot. Can you help me find better prices?
```

Then upload a flight booking screenshot to test the full workflow.

---

## 🔍 Monitoring & Debugging

### Render Dashboard

1. **Service Logs**
   - Go to your service dashboard
   - Click "Logs" tab
   - Monitor real-time logs

2. **Metrics**
   - View CPU, memory, and request metrics
   - Monitor response times and error rates

### Health Monitoring

Your service includes a health check endpoint that Render monitors:
- **Health Check Path**: `/health`
- **Check Interval**: Every 30 seconds
- **Timeout**: 3 seconds

### Common Issues

1. **Build Failures**
   - Check build logs in Render dashboard
   - Ensure all dependencies are in `package.json`
   - Verify TypeScript compilation

2. **Runtime Errors**
   - Check service logs
   - Verify environment variables are set
   - Test locally first

3. **ChatGPT Connection Issues**
   - Verify your MCP URL is correct
   - Check that the service is running
   - Test the `/health` endpoint

---

## 🔄 Updates & Maintenance

### Automatic Deployments

With auto-deploy enabled:
1. Push changes to your repository
2. Render automatically rebuilds and redeploys
3. Monitor logs for any issues

### Manual Deployments

To manually trigger a deployment:
1. Go to your service dashboard
2. Click "Manual Deploy"
3. Choose the branch/commit to deploy

### Environment Variable Updates

To update environment variables:
1. Go to your service dashboard
2. Click "Environment" tab
3. Update variables
4. Click "Save Changes"
5. Service will restart automatically

---

## 💰 Render Pricing

### Free Tier
- ✅ 750 hours/month (enough for most testing)
- ✅ Automatic SSL certificates
- ✅ Custom domains
- ⚠️ Services sleep after 15 minutes of inactivity
- ⚠️ Cold starts take ~30 seconds

### Paid Plans
- **Starter**: $7/month - Always-on services
- **Standard**: $25/month - More resources, better performance

For production use with ChatGPT, consider upgrading to keep the service always-on.

---

## 🚨 Important Notes

### Free Tier Limitations

1. **Sleep Mode**: Services sleep after 15 minutes of inactivity
2. **Cold Starts**: First request after sleep takes ~30 seconds
3. **Resource Limits**: Limited CPU and memory

### Production Considerations

1. **Always-On**: Upgrade to paid plan for always-on service
2. **Monitoring**: Set up alerts for service health
3. **Backups**: Keep your code in version control
4. **Security**: Never commit API keys to your repository

---

## 🎉 Success Checklist

Before using with ChatGPT, verify:

- [ ] ✅ Service deployed successfully on Render
- [ ] ✅ Health endpoint returns 200 OK
- [ ] ✅ MCP endpoint returns valid metadata
- [ ] ✅ Environment variables configured
- [ ] ✅ Service logs show no errors
- [ ] ✅ ChatGPT can connect to your MCP server
- [ ] ✅ Test flight search works end-to-end

---

## 🆘 Troubleshooting

### Service Won't Start
```bash
# Check build logs in Render dashboard
# Common issues:
# - Missing dependencies
# - TypeScript compilation errors
# - Environment variables not set
```

### ChatGPT Can't Connect
1. Verify MCP URL is correct
2. Test health endpoint
3. Check service logs
4. Ensure service is not sleeping

### Build Failures
1. Check `package.json` dependencies
2. Verify TypeScript configuration
3. Check for syntax errors
4. Test build locally first

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)

---

## 🎯 Next Steps

Once deployed:

1. **Test thoroughly** with various flight scenarios
2. **Monitor performance** and response times
3. **Set up alerts** for service health
4. **Consider upgrading** to paid plan for production use
5. **Share your MCP server** with others who need flight price discovery

Your Navifare MCP server is now ready for production use with ChatGPT! 🚀✈️
