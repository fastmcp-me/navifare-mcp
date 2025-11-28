# Streamable HTTP Upgrade Guide

## Current State

Your `http-server.js` currently uses standard HTTP POST with JSON responses. This works but doesn't support streaming for long-running operations.

## What Streamable HTTP Requires

Streamable HTTP is an MCP transport that supports:
1. **JSON responses** for quick operations (already implemented ✅)
2. **SSE streams** (`text/event-stream`) for long-running tasks with progress updates
3. **Session management** via `Mcp-Session-Id` header
4. **Stateless operation** when possible

## Required Changes

### 1. Detect Streaming Requests

Add header detection to determine if client wants streaming:

```javascript
app.post('/mcp', async (req, res) => {
  const wantsStreaming = req.headers['accept']?.includes('text/event-stream') || 
                         req.query.stream === 'true';
  
  if (wantsStreaming && method === 'tools/call' && name === 'flight_pricecheck') {
    // Use SSE streaming
  } else {
    // Use standard JSON response
  }
});
```

### 2. Implement SSE Streaming for Long Operations

For `flight_pricecheck`, stream progress updates:

```javascript
if (wantsStreaming) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Stream progress updates
  const onProgress = (progressResults) => {
    const event = {
      type: 'progress',
      data: progressResults
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  
  try {
    const searchResult = await submit_and_poll_session(sanitizedRequest, onProgress);
    
    // Send final result
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      data: {
        message: formattedMessage.trim(),
        searchResult: searchResult,
        status: searchResult.status || 'COMPLETED'
      }
    })}\n\n`);
    
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
} else {
  // Standard JSON response (current implementation)
  res.json(response);
}
```

### 3. Add Session Management

Support `Mcp-Session-Id` header for session tracking:

```javascript
const sessionId = req.headers['mcp-session-id'] || 
                  `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Use sessionId for tracking if needed
res.setHeader('Mcp-Session-Id', sessionId);
```

### 4. Update server.json

If deploying as remote HTTP server, update transport type:

```json
{
  "transport": {
    "type": "http",
    "endpoint": "https://your-server.com/mcp",
    "streamable": true
  }
}
```

## Benefits

- ✅ **Better UX**: Clients receive real-time progress updates
- ✅ **Compliance**: Meets Anthropic's Streamable HTTP requirement
- ✅ **Scalability**: Stateless operation reduces server load
- ✅ **Flexibility**: Supports both quick and long-running operations

## Implementation Priority

**For stdio transport (current)**: No changes needed - stdio already supports streaming ✅

**For remote HTTP**: 
- If you want Claude web support, implement SSE streaming
- If only using stdio, you can skip this upgrade

## Testing

Test streaming with:
```bash
curl -N -H "Accept: text/event-stream" \
     -H "Content-Type: application/json" \
     -X POST https://your-server.com/mcp \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"flight_pricecheck","arguments":{...}}}'
```

The `-N` flag keeps the connection open to receive SSE events.




