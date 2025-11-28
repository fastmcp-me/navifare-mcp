# Prompt Duplication Analysis: stdio-server.js vs http-server.js

## Why We Have Two Servers

### **stdio-server.js** - STDIO Protocol Server
- **Purpose**: For MCP Inspector (local development/testing)
- **Protocol**: STDIO (Standard Input/Output) - reads from stdin, writes to stdout/stderr
- **Usage**: `npx @modelcontextprotocol/inspector node stdio-server.js`
- **Logging**: Uses `console.error()` because MCP Inspector reads stderr
- **Port**: N/A (uses STDIO pipes)

### **http-server.js** - HTTP Protocol Server  
- **Purpose**: For production deployment (ChatGPT, Claude, other MCP clients via HTTP)
- **Protocol**: HTTP REST API - accepts POST requests at `/mcp`
- **Usage**: Deployed to Render/Cloud platforms, accessible via HTTPS
- **Logging**: Uses `console.log()` (standard HTTP logging)
- **Port**: 2091 (or configured via PORT env var)

## Prompt Duplication

### Current State
Both servers contain **identical prompts**:
1. **`parseFlightRequest` prompt** (lines ~48-81 in stdio, ~51-84 in http)
2. **`extractFlightDetailsFromImages` prompt** (lines ~715-820 in stdio, ~494-603 in http)

### Differences Found

#### 1. Logging
- **stdio-server.js**: `console.error()` (MCP Inspector reads stderr)
- **http-server.js**: `console.log()` (standard HTTP logging)

#### 2. Error Handling Structure
- **stdio-server.js**: More verbose error logging with stack traces
- **http-server.js**: Simpler error messages for HTTP responses

#### 3. Payload Format (Minor)
- **stdio-server.js**: Uses array format `[prompt, ...imageParts]`
- **http-server.js**: Uses object format `{ contents: [{ parts: [prompt, ...imageParts] }] }`
  - Actually, both use the same Gemini API format, just different code structure

#### 4. Round Trip Splitting Logic
- **stdio-server.js**: Uses same logic as geminiService.ts (lines 900-916)
- **http-server.js**: Has slightly different implementation (lines 666-692) but same intent

## The Problem

**DRY Violation**: We're maintaining the same prompts in two places, which means:
- When updating prompts, we must update both files
- Risk of them diverging over time
- More code to maintain
- Harder to ensure consistency

## Solutions

### Option 1: Extract Prompts to Shared File (Recommended)
Create a `prompts.js` file that exports the prompts:

```javascript
// prompts.js
export const PARSE_FLIGHT_REQUEST_PROMPT = (userRequest, currentYear, currentDate) => `...`;
export const EXTRACT_FLIGHT_DETAILS_PROMPT = (currentDate, currentYear) => `...`;
```

**Pros:**
- Single source of truth
- Easy to update
- Both servers import same prompts
- Follows DRY principle

**Cons:**
- Need to refactor both files
- Prompts need to be parameterized

### Option 2: Shared Utilities Module
Create `shared-utils.js` that exports all shared functions:
- Prompts
- Helper functions (parseFlightRequest, extractFlightDetailsFromImages)
- Post-processing functions (fixPastDates, detectRoundTripPattern, etc.)

**Pros:**
- Maximum code reuse
- Single source for all shared logic
- Easier to maintain

**Cons:**
- Larger refactor
- Need to handle differences (logging, error handling)

### Option 3: Keep As-Is
Accept the duplication for now, with clear comments referencing each other.

**Pros:**
- No refactoring needed
- Files remain independent

**Cons:**
- Continues DRY violation
- Risk of divergence

## Recommendation

**Use Option 1** - Extract prompts to a shared file. This is the smallest change that addresses the immediate duplication problem. We can refactor helper functions later if needed.

## Action Items

1. Create `prompts.js` with exported prompt functions
2. Update `stdio-server.js` to import prompts
3. Update `http-server.js` to import prompts
4. Add a comment in both files referencing `prompts.js` as the source of truth




