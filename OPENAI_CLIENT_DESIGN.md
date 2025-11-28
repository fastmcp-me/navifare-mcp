# OpenAI Apps SDK Client - Design Document

## Overview

This document outlines the strategy for building an OpenAI Apps SDK client that integrates with ChatGPT while leveraging the existing Navifare MCP server. The client will be a separate component that acts as a bridge between ChatGPT's widget runtime and our MCP tools, without modifying the core MCP server logic.

## Architecture Principles

1. **Separation of Concerns**: The OpenAI client lives in a separate directory (`openai-client/`) and does not modify MCP server code
2. **MCP as Backend**: The existing MCP server remains the single source of truth for flight search logic
3. **Thin Client Layer**: The OpenAI client is a lightweight adapter that:
   - Receives tool calls from ChatGPT
   - Forwards requests to the MCP server
   - Transforms MCP responses into OpenAI-compliant format
   - Serves UI widgets
4. **Stateless Design**: The client is stateless; all business logic and data live in the MCP server

## Folder Structure

```
mcp/
├── navifare-mcp/          # Existing MCP server (unchanged)
│   ├── src/
│   │   ├── index.ts      # MCP server with tools
│   │   ├── navifare.ts   # API integration
│   │   └── extractService.ts
│   └── dist/
│
└── openai-client/         # New OpenAI Apps SDK client
    ├── package.json
    ├── tsconfig.json
    ├── server/
    │   ├── index.ts       # OpenAI client server (HTTP/SSE)
    │   ├── mcp-adapter.ts # Bridge to MCP server
    │   └── widget-server.ts # Serves HTML templates
    ├── web/               # React widget bundle
    │   ├── package.json
    │   ├── src/
    │   │   ├── component.tsx    # Main widget component
    │   │   ├── hooks/
    │   │   │   ├── useOpenAiGlobal.ts
    │   │   │   └── useWidgetState.ts
    │   │   └── components/
    │   │       └── FlightResults.tsx
    │   └── dist/
    │       └── component.js     # Bundled output
    └── templates/
        └── flight-results.html   # HTML template wrapper
```

## Data Flow

```
User Prompt in ChatGPT
    ↓
ChatGPT Model
    ↓
MCP Tool Call (via OpenAI client)
    ↓
OpenAI Client Server
    ├── Receives tool call
    ├── Forwards to MCP server (stdio or HTTP)
    ├── Receives MCP response
    ├── Transforms to OpenAI format:
    │   ├── content[] (text summary for model)
    │   ├── structuredContent (data for widget)
    │   └── _meta (metadata, not shown to model)
    └── Returns response with UI template reference
    ↓
ChatGPT
    ├── Renders narration from content[]
    ├── Loads HTML template (text/html+skybridge)
    └── Injects structuredContent into window.openai.toolOutput
    ↓
Widget (React component in iframe)
    ├── Reads window.openai.toolOutput
    ├── Renders flight results UI
    ├── Manages UI state via window.openai.setWidgetState
    └── Can call tools via window.openai.callTool
```

## Component Design

### 1. OpenAI Client Server (`server/index.ts`)

**Purpose**: HTTP/SSE server that implements OpenAI Apps SDK MCP protocol

**Responsibilities**:
- Accept tool calls from ChatGPT
- Communicate with MCP server (via stdio or HTTP transport)
- Transform MCP responses to OpenAI format
- Register UI resources (HTML templates)
- Serve widget bundles

**Key Functions**:
- `handleToolCall(toolName, args)` → Forwards to MCP, transforms response
- `registerResources()` → Registers HTML templates with proper MIME types
- `transformMcpResponse(mcpResponse)` → Converts to OpenAI format

**Response Format**:
```typescript
{
  content: [
    {
      type: "text",
      text: "Human-readable summary for ChatGPT model"
    }
  ],
  structuredContent: {
    // Flight results data (visible to model)
    request_id: string,
    status: string,
    totalResults: number,
    results: Array<FlightResult>
  },
  _meta: {
    // Metadata (NOT visible to model)
    "openai/outputTemplate": "ui://widget/flight-results.html",
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "Searching for flights...",
    "openai/toolInvocation/invoked": "Found flight prices!",
    rawApiResponse: {...} // For debugging
  }
}
```

### 2. MCP Adapter (`server/mcp-adapter.ts`)

**Purpose**: Bridge between OpenAI client and MCP server

**Responsibilities**:
- Establish connection to MCP server (stdio or HTTP)
- Forward tool calls
- Handle MCP protocol details
- Error handling and retries

**Implementation Options**:
- **Option A**: Spawn MCP server as child process, communicate via stdio
- **Option B**: Connect to MCP server via HTTP (if MCP server exposes HTTP transport)
- **Option C**: Import MCP server functions directly (if same process)

**Recommendation**: Option A (stdio) for clean separation, or Option C if we want to run in same process for simplicity.

### 3. Widget Server (`server/widget-server.ts`)

**Purpose**: Serves HTML templates and widget bundles

**Responsibilities**:
- Serve HTML templates with `text/html+skybridge` MIME type
- Serve bundled JavaScript (`dist/component.js`)
- Inject initial data into templates
- Handle CSP headers

**Template Structure**:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Inline CSS for security */
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    // Inject toolOutput if available
    window.openai = window.openai || {};
    window.openai.toolOutput = ${JSON.stringify(structuredContent)};
  </script>
  <script type="module" src="/widget/component.js"></script>
</body>
</html>
```

### 4. React Widget (`web/src/component.tsx`)

**Purpose**: Interactive UI component that renders in ChatGPT

**Responsibilities**:
- Display flight results from `window.openai.toolOutput`
- Manage UI state (selected flights, filters, etc.)
- Call tools via `window.openai.callTool`
- Persist state via `window.openai.setWidgetState`

**Key Features**:
- **Data Display**: Show flight prices, booking links, fare types
- **Interactivity**: Allow filtering, sorting, favoriting
- **Tool Calls**: "Refresh results", "Get more details"
- **State Persistence**: Remember user selections

**Component Structure**:
```typescript
export function FlightResultsWidget() {
  // Read tool output
  const toolOutput = useOpenAiGlobal('toolOutput') as FlightResultsData;
  
  // Manage UI state
  const [widgetState, setWidgetState] = useWidgetState(() => ({
    selectedRank: null,
    sortBy: 'price',
    showOnlyFavorites: false
  }));
  
  // Handle refresh
  const handleRefresh = async () => {
    await window.openai.callTool('get_session_results', {
      request_id: toolOutput.request_id
    });
  };
  
  // Render UI
  return (
    <div>
      {/* Flight results display */}
    </div>
  );
}
```

### 5. Helper Hooks (`web/src/hooks/`)

**useOpenAiGlobal.ts**:
- Subscribe to `window.openai` properties
- Listen for `openai:set_globals` events
- Return reactive values

**useWidgetState.ts**:
- Wrap `window.openai.widgetState`
- Sync local React state with widget state
- Call `setWidgetState` on updates

## Tool Mapping Strategy

### Existing MCP Tools → OpenAI Tools

| MCP Tool | OpenAI Tool Name | Purpose |
|----------|------------------|---------|
| `search_flights` | `search_flights` | Search and poll for results |
| `submit_session` | `submit_session` | Create price discovery session |
| `get_session_results` | `get_session_results` | Get results for a session |

**Tool Descriptors**:
- Each tool needs OpenAI metadata:
  - `openai/outputTemplate`: Points to HTML template
  - `openai/widgetAccessible`: `true` (allows widget-initiated calls)
  - `openai/toolInvocation/invoking`: Status message while running
  - `openai/toolInvocation/invoked`: Status message when complete

## State Management Strategy

### Business Data (Authoritative)
- **Location**: MCP server / Navifare API
- **Flow**: User action → Widget calls tool → MCP updates → Returns new data → Widget re-renders
- **Format**: `structuredContent` in tool responses

### UI State (Ephemeral)
- **Location**: `window.openai.widgetState`
- **Purpose**: Visual behavior (selected items, expanded panels, filters)
- **Persistence**: Scoped to widget instance (message-level)
- **Update**: Call `window.openai.setWidgetState()` after UI changes

### Example State Flow:
1. User selects a flight → `setWidgetState({ selectedRank: 3 })`
2. User clicks "Refresh" → `callTool('get_session_results')`
3. New data arrives → Widget re-renders with new data + restored UI state
4. Selected flight (rank 3) remains highlighted

## Deployment Strategy

### Development
1. Run MCP server: `cd navifare-mcp && npm run dev`
2. Run OpenAI client: `cd openai-client && npm run dev`
3. Build widget: `cd openai-client/web && npm run build`
4. Test with MCP Inspector or ChatGPT

### Production
1. **Option A**: Separate services
   - MCP server: Deployed as standalone service
   - OpenAI client: Deployed as separate HTTP server
   - Client connects to MCP via HTTP or stdio

2. **Option B**: Monolithic (same process)
   - Single server that runs both MCP and OpenAI client
   - MCP functions imported directly
   - Simpler deployment, tighter coupling

**Recommendation**: Option A for better separation, but Option B acceptable if simplicity is priority.

## Integration Points

### 1. MCP Server Connection

**Approach**: The OpenAI client needs to call MCP tools. Options:

- **stdio transport**: Spawn MCP server as child process
  ```typescript
  const mcpProcess = spawn('node', ['../navifare-mcp/dist/index.js']);
  // Communicate via stdin/stdout
  ```

- **HTTP transport**: If MCP server exposes HTTP endpoint
  ```typescript
  const response = await fetch('http://mcp-server:port/tools/call', {
    method: 'POST',
    body: JSON.stringify({ name, arguments: args })
  });
  ```

- **Direct import**: Import MCP server functions
  ```typescript
  import { submit_session, get_session_results } from '../navifare-mcp/src/navifare';
  ```

### 2. Response Transformation

**MCP Response Format**:
```typescript
{
  content: [{ type: "text", text: "..." }],
  // ... other MCP fields
}
```

**OpenAI Response Format**:
```typescript
{
  content: [{ type: "text", text: "..." }],
  structuredContent: { /* flight data */ },
  _meta: {
    "openai/outputTemplate": "ui://widget/flight-results.html",
    // ... other metadata
  }
}
```

**Transformation Logic**:
- Extract flight data from MCP response
- Create `structuredContent` with flight results
- Add OpenAI metadata to `_meta`
- Keep `content` for model narration

### 3. Widget Data Injection

When serving the HTML template:
1. Read `structuredContent` from tool response
2. Inject into template as `window.openai.toolOutput`
3. Widget reads on mount and renders

## Security Considerations

1. **CSP Headers**: Widget templates must include strict CSP
   - No external resources
   - No inline event handlers (use addEventListener)
   - All assets inlined or served from same origin

2. **Data Sanitization**: 
   - Sanitize all data before injecting into HTML
   - Escape JSON properly
   - Validate tool arguments

3. **Authentication**:
   - OpenAI client may need to authenticate with MCP server
   - Consider API keys or OAuth for production

## Testing Strategy

### Unit Tests
- MCP adapter: Mock MCP server, test transformation logic
- Widget components: Test with mock `window.openai`
- Helper hooks: Test state synchronization

### Integration Tests
- End-to-end: ChatGPT → OpenAI client → MCP server → Response
- Widget rendering: Verify data injection and state persistence
- Tool calls from widget: Test `callTool` flow

### Manual Testing
- Use MCP Inspector to test tool calls
- Deploy to ChatGPT and test full flow
- Verify widget state persistence across refreshes

## Migration Path

1. **Phase 1**: Set up folder structure and basic server
   - Create `openai-client/` directory
   - Set up HTTP server with tool registration
   - Test MCP connection

2. **Phase 2**: Build widget
   - Create React component
   - Implement helper hooks
   - Bundle and test in isolation

3. **Phase 3**: Integration
   - Connect widget to server
   - Test full flow with ChatGPT
   - Add error handling and edge cases

4. **Phase 4**: Polish
   - Add loading states
   - Improve error messages
   - Optimize bundle size
   - Add analytics

## Key Decisions

1. **MCP Connection Method**: Recommend stdio for clean separation, but direct import acceptable for simplicity
2. **Widget Framework**: React (as specified in requirements)
3. **Bundler**: esbuild (fast, simple, good for single-file output)
4. **State Management**: Use `window.openai` APIs directly, no Redux/Zustand needed
5. **Deployment**: Separate services preferred, but monolithic acceptable

## Success Criteria

- ✅ ChatGPT can call flight search tools
- ✅ Widget renders flight results correctly
- ✅ Widget state persists across refreshes
- ✅ Widget can call tools (refresh, get details)
- ✅ No modifications to existing MCP server code
- ✅ Clean separation between MCP and OpenAI client
- ✅ Fast widget load time (<500ms)
- ✅ Works in ChatGPT desktop and mobile

## Open Questions

1. Should we support image extraction tool in widget? (Currently deactivated in MCP)
2. How to handle streaming responses? (MCP supports streaming)
3. Should widget support multiple flight searches simultaneously?
4. How to handle errors gracefully in widget UI?
5. Should we add analytics/tracking for widget usage?

## Next Steps

1. Review and approve this design document
2. Set up `openai-client/` folder structure
3. Implement MCP adapter and basic server
4. Build React widget component
5. Test integration with ChatGPT
6. Deploy and iterate


