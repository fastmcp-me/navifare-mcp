#!/usr/bin/env node

/**
 * Script to convert logo_squared.png to SVG format for MCP Directory submission
 * 
 * Note: This creates an SVG that embeds the PNG as base64.
 * For best results, use the original vector source file if available.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the logo file (adjust if needed)
// Logo is in the front-end root's src/assets directory
const logoPath = join(__dirname, '../../../src/assets/logo_squared.png');
const outputPath = join(__dirname, '../../logo_squared.svg');

try {
  // Read the PNG file
  console.log('Reading logo file:', logoPath);
  const imageBuffer = readFileSync(logoPath);
  const base64Data = imageBuffer.toString('base64');
  
  // Create SVG with embedded PNG
  // Using 512x512 as a standard square size
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/png;base64,${base64Data}" 
         width="512" height="512" 
         preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  
  // Write SVG file
  writeFileSync(outputPath, svgContent, 'utf8');
  
  console.log('✅ SVG created successfully!');
  console.log('📁 Output file:', outputPath);
  console.log('\n📋 Next steps:');
  console.log('1. Open the SVG file and verify it looks correct');
  console.log('2. Copy the SVG content to submit in the form');
  console.log('3. Verify favicon URL: https://www.google.com/s2/favicons?domain=navifare.com&sz=64');
  console.log('\n⚠️  Note: This SVG embeds a PNG. For best quality, use original vector source if available.');
  
} catch (error) {
  console.error('❌ Error creating SVG:', error.message);
  process.exit(1);
}

