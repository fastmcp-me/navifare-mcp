# MCP Directory Logo Submission Guide

This guide helps you complete the logo submission form for the Anthropic MCP Directory.

## Required Information

### 1. Server Logo (SVG Format)

**Requirement**: Square logo (1:1 aspect ratio) in SVG format

**Current Status**: You have `logo_squared.png` but need an SVG version.

**Options**:

#### Option A: Convert PNG to SVG (Quick Solution)
If you need a quick solution, you can create an SVG that embeds your PNG as base64:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,[YOUR_BASE64_PNG_DATA]" width="512" height="512"/>
</svg>
```

However, **this is not ideal** as it's not a true vector format.

#### Option B: Create Vector SVG (Recommended)
For best results, you should:
1. Use the original vector source file (if available in Illustrator, Figma, etc.)
2. Export as SVG with 1:1 aspect ratio
3. Ensure it's optimized and clean

#### Option C: Use Online Converter
You can use tools like:
- [CloudConvert](https://cloudconvert.com/png-to-svg)
- [PNG to SVG Converter](https://convertio.co/png-svg/)

**Note**: Auto-tracing may not produce perfect results. Original vector source is best.

### 2. Server Logo URL (Favicon Verification)

**Your Domain**: `navifare.com`

**Favicon URL to Verify**: 
```
https://www.google.com/s2/favicons?domain=navifare.com&sz=64
```

**Steps to Verify**:
1. Open the URL above in your browser
2. Check that it displays the correct Navifare logo/favicon
3. If it's incorrect, update the favicon on your website
4. Wait a few hours for Google's cache to update
5. Verify again before submitting

**Current Favicon Location**: Your site should have a favicon at:
- `https://navifare.com/favicon.ico` or
- `https://www.navifare.com/favicon.ico`

## Submission Checklist

- [ ] Create or obtain SVG version of logo (1:1 aspect ratio)
- [ ] Verify favicon URL displays correctly: `https://www.google.com/s2/favicons?domain=navifare.com&sz=64`
- [ ] If favicon is incorrect, update it on your website
- [ ] Wait for Google cache to update (may take a few hours)
- [ ] Re-verify favicon URL
- [ ] Fill out the submission form with:
  - SVG logo (paste the SVG code or provide URL)
  - Confirmed favicon URL
  - Check the verification checkbox

## Quick Reference

**MCP Endpoint**: `https://mcp.navifare.com/mcp`  
**Domain**: `navifare.com`  
**Favicon Check URL**: `https://www.google.com/s2/favicons?domain=navifare.com&sz=64`

