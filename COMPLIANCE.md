# Anthropic MCP Directory Compliance

This document outlines Navifare MCP Server's compliance with Anthropic's MCP Directory Policy.

## ✅ Compliance Status

### Safety and Security
- ✅ **Usage Policy Compliance**: Server does not facilitate violations of Anthropic's Usage Policy
- ✅ **Privacy Protection**: Only collects flight data necessary for price comparison
- ✅ **No Guardrail Evasion**: Does not attempt to bypass Claude's safety features
- ✅ **IP Rights**: Does not infringe on intellectual property rights
- ✅ **Data Collection**: Only collects flight details necessary for functionality

### Compatibility
- ✅ **Tool Descriptions**: Clear, unambiguous descriptions for all tools
- ✅ **Functionality Match**: Tool descriptions accurately match actual functionality
- ✅ **No Conflicts**: Does not interfere with other MCP servers
- ✅ **No Cross-Server Calls**: Does not intentionally call other servers

### Functionality
- ✅ **Performance**: Reliable performance with fast response times
- ✅ **Error Handling**: Graceful error handling with helpful feedback
- ✅ **Token Efficiency**: Frugal token usage appropriate for task complexity
- ✅ **Tool Annotations**: All tools include `title`, `readOnlyHint`, and `destructiveHint`
- ✅ **Dependencies**: Uses current versions of all dependencies

### Developer Requirements
- ✅ **Privacy Policy**: Available at https://navifare.com/terms
- ✅ **Contact Information**: 
  - Email: contact@navifare.com
  - Privacy: privacy@navifare.com
- ✅ **Documentation**: Comprehensive documentation in README.md and usage guides
- ✅ **Examples**: Three+ working examples in USAGE_EXAMPLES.md
- ✅ **API Ownership**: Connects to owned Navifare API endpoint
- ✅ **Maintenance**: Active maintenance and issue resolution

### Unsupported Use Cases
- ✅ **No Financial Transactions**: Does not transfer money or execute financial transactions
- ✅ **No Media Generation**: Does not generate images, video, or audio
- ✅ **No Cross-Service Automation**: Limited to flight price comparison only

## Tool Annotations

### `flight_pricecheck`
- **readOnlyHint**: `false` - Tool performs searches and may trigger external API calls
- **destructiveHint**: `false` - Tool does not modify or delete data

### `format_flight_pricecheck_request`
- **readOnlyHint**: `true` - Tool only formats/parses data, no external calls
- **destructiveHint**: `false` - Tool does not modify or delete data

## Privacy Policy

Our privacy policy is available at: https://navifare.com/terms

The policy covers:
- Data collection practices
- Data usage and retention
- User rights
- Third-party services
- Contact information for privacy inquiries

## Contact Information

**General Inquiries**: contact@navifare.com  
**Privacy Inquiries**: privacy@navifare.com  
**Support**: Available via GitHub Issues at https://github.com/navifare/navifare-mcp

## Testing Account

For Anthropic review, please contact us at contact@navifare.com to obtain a testing account with sample data.

## Examples

See `USAGE_EXAMPLES.md` for three+ working examples demonstrating core functionality:
1. Complete workflow with image extraction
2. Manual input example
3. Price comparison results display

## Remote Server Support

Currently, the server is configured for stdio transport. For remote HTTP support (required for Claude web), the server includes `http-server.js` which can be deployed. Remote servers would need:
- Streamable HTTP transport support (currently SSE, needs upgrade)
- OAuth 2.0 authentication if user data is collected (not currently required)

## Compliance Monitoring

This document is reviewed quarterly and updated as necessary to ensure ongoing compliance with Anthropic's MCP Directory Policy.

Last Updated: November 6, 2025




