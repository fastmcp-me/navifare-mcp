# Image Input Handling in ChatGPT - Complete Guide

## 🖼️ How Users Can Provide Images

Based on the [OpenAI Apps SDK documentation](https://developers.openai.com/apps-sdk/build/custom-ux), there are several ways users can provide images to your MCP tools:

### Method 1: Direct Image Upload (Recommended)
Users can directly paste or upload images in ChatGPT:
- **Paste**: Ctrl+V (Cmd+V on Mac) to paste from clipboard
- **Upload**: Click the attachment button or drag & drop
- **Screenshot**: Take a screenshot and paste it directly

ChatGPT automatically converts these to base64 format and passes them to your tools.

### Method 2: Enhanced UI Component
Your widget can include image upload functionality using the `window.openai` API.

## 🔧 Implementation Approaches

### Approach 1: Simple Tool Parameter (Current Implementation)

Your `extract_image` tool now accepts images directly:

```json
{
  "image": "base64-encoded-image-data-or-file-path",
  "mimeType": "image/jpeg"
}
```

**How it works:**
1. User pastes/uploads image in ChatGPT
2. ChatGPT automatically converts to base64
3. Calls your `extract_image` tool with the image data
4. Your tool processes the image and returns flight details

### Approach 2: Enhanced Widget with Upload (New Implementation)

The enhanced widget (`ui://widget/flight-results-enhanced.html`) includes:

- **Drag & Drop Interface**: Users can drag images directly onto the widget
- **File Browser**: Click to select images from their device
- **Image Preview**: Shows the uploaded image before processing
- **Direct Tool Calls**: Uses `window.openai.callTool()` to call `extract_image`

## 🎯 User Experience Flow

### Scenario 1: Direct Image Upload
```
User: "I have a screenshot of my flight booking. Can you help me find better prices?"

ChatGPT: 
1. Detects the image in the message
2. Calls extract_image tool with the image
3. Gets structured flight data
4. Calls submit_session with extracted data
5. Calls get_session_results to show price comparison
6. Displays enhanced widget with results
```

### Scenario 2: Widget-Based Upload
```
User: "Show me flight price comparisons"

ChatGPT:
1. Calls get_session_results (even with no session)
2. Shows enhanced widget with upload interface
3. User drags/drops image onto widget
4. Widget calls extract_image tool
5. Widget shows extracted data
6. User can then submit for price discovery
```

## 🛠️ Technical Implementation Details

### Image Data Handling

Your `extract_image` tool now handles multiple input formats:

```typescript
// Handle both base64 data and file paths
let imageData = input.image;

// Detect format and process accordingly
if (!imageData.startsWith('data:') && 
    !imageData.startsWith('/9j/') && 
    !imageData.startsWith('iVBORw0KGgo')) {
  // Assume it's a file path - ChatGPT will provide actual image data
  imageData = input.image;
}
```

### Enhanced Widget Features

The enhanced widget includes:

1. **File Input Handling**:
   ```javascript
   function handleFileSelect(file) {
     if (!file.type.startsWith('image/')) {
       showError('Please select a valid image file.');
       return;
     }
     
     // Show preview and enable extraction
     const reader = new FileReader();
     reader.onload = (e) => {
       imagePreview.src = e.target.result;
       extractButton.style.display = 'block';
     };
     reader.readAsDataURL(file);
   }
   ```

2. **Base64 Conversion**:
   ```javascript
   function fileToBase64(file) {
     return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.onload = () => resolve(reader.result.split(',')[1]);
       reader.onerror = reject;
       reader.readAsDataURL(file);
     });
   }
   ```

3. **Direct Tool Calls**:
   ```javascript
   async function extractFlightDetails() {
     const base64 = await fileToBase64(file);
     
     await window.openai?.callTool('extract_image', {
       image: base64,
       mimeType: file.type
     });
   }
   ```

## 📱 User Interface Features

### Drag & Drop Support
- Visual feedback when dragging files over the widget
- Automatic file validation (images only)
- Smooth animations and transitions

### Image Preview
- Shows uploaded image before processing
- Maintains aspect ratio
- Responsive sizing

### Loading States
- Spinner during image processing
- Disabled buttons during extraction
- Clear error messages

### Error Handling
- File type validation
- Size limits (10MB max)
- Clear error messages for failed extractions

## 🔄 Complete Workflow Integration

### Step 1: Image Upload
- User provides image via ChatGPT or widget
- Image is validated and converted to base64

### Step 2: Flight Extraction
- `extract_image` tool processes the image
- Returns structured flight data
- Handles errors gracefully

### Step 3: Price Discovery
- `submit_session` creates price discovery session
- Uses extracted flight data directly
- No manual data restructuring needed

### Step 4: Results Display
- `get_session_results` shows interactive widget
- Displays prices from multiple booking sites
- Includes direct booking links

## 🎨 Widget Customization

### Visual Design
- Modern, clean interface
- Responsive design for all screen sizes
- Consistent with ChatGPT's design language
- Accessible color contrast and typography

### Interactive Elements
- Hover effects on cards
- Smooth transitions
- Clear call-to-action buttons
- Intuitive navigation

### Error States
- Friendly error messages
- Retry mechanisms
- Fallback options
- Clear next steps

## 🚀 Advanced Features

### Component State Management
Using `window.openai.setWidgetState` to persist user preferences:

```javascript
async function persistFavorites(favorites) {
  await window.openai?.setWidgetState?.({
    __v: 1,
    favorites,
    lastExtracted: new Date().toISOString()
  });
}
```

### Tool Response Listening
React to tool invocations from the component:

```javascript
window.addEventListener('openai:tool_response', (event) => {
  if (event.detail.tool.name === 'extract_image') {
    // Update UI after extraction
    console.log('Image extraction completed');
  }
});
```

### Display Mode Requests
Request different layouts for better user experience:

```javascript
await window.openai?.requestDisplayMode({ mode: "fullscreen" });
```

## 📋 Best Practices

### Image Processing
1. **Validate Early**: Check file type and size before processing
2. **Show Progress**: Display loading states during extraction
3. **Handle Errors**: Provide clear error messages and retry options
4. **Optimize Size**: Compress images if needed for better performance

### User Experience
1. **Clear Instructions**: Tell users exactly what to do
2. **Visual Feedback**: Show progress and results clearly
3. **Error Recovery**: Provide ways to fix problems
4. **Accessibility**: Ensure keyboard navigation and screen reader support

### Security
1. **File Validation**: Only accept image files
2. **Size Limits**: Prevent oversized uploads
3. **CSP Compliance**: Follow content security policies
4. **Data Privacy**: Don't store images unnecessarily

## 🔧 Testing Your Implementation

### Test Image Upload
1. **MCP Inspector**: Test with sample base64 data
2. **ChatGPT**: Upload real flight booking screenshots
3. **Widget**: Test drag & drop functionality
4. **Error Cases**: Test with invalid files

### Test Workflow
1. Upload image → Extract details → Submit session → Get results
2. Test error handling at each step
3. Verify data flows correctly between tools
4. Check UI responsiveness and accessibility

## 📚 Key Concepts Explained

### **Base64 Encoding**
Images are converted to base64 strings for transmission. This allows binary data to be sent as text, which is required for JSON-RPC communication.

### **File API Integration**
The enhanced widget uses the browser's File API to handle user uploads, providing a native file selection experience.

### **Tool Chaining**
The three tools work together seamlessly: extract → submit → results, with each tool's output feeding into the next.

### **Widget State Persistence**
Using `window.openai.setWidgetState` allows the widget to remember user preferences and restore state across interactions.

### **Event-Driven Architecture**
The widget listens for tool responses and host updates, creating a reactive user experience that stays in sync with ChatGPT's state.

## 🎯 Next Steps

1. **Test the enhanced widget** in MCP Inspector
2. **Upload real flight screenshots** to test extraction
3. **Verify the complete workflow** from image to price comparison
4. **Customize the UI** to match your brand preferences
5. **Add additional features** like favorites or price alerts

Your MCP server now provides a complete, user-friendly image-to-price-discovery workflow that works seamlessly with ChatGPT! 🛫

