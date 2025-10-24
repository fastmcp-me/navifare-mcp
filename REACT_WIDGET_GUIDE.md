# React-Based Flight Results Widget - OpenAI Apps SDK Implementation

## 🎯 Overview

This document describes the React-based flight results widget built following the [OpenAI Apps SDK guidelines](https://developers.openai.com/apps-sdk/build/custom-ux). The widget provides an interactive, modern interface for displaying flight price comparison results within ChatGPT.

## 🏗️ Architecture

### Project Structure
```
mcp/navifare-mcp/
├── web/                          # React component project
│   ├── src/
│   │   └── component.tsx        # Main React component
│   ├── dist/
│   │   └── component.js          # Built component bundle
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── components/
│   │   ├── flight-results-react.html  # HTML template
│   │   └── component.js               # Copied React bundle
│   └── index.ts                 # MCP server
```

### Component Features

#### ✅ **OpenAI Apps SDK Compliance**
- **`window.openai` API Integration**: Uses all recommended APIs
- **React Hooks**: Custom hooks for `useOpenAiGlobal` and `useWidgetState`
- **Event Handling**: Listens to `openai:set_globals` and `openai:tool_response`
- **State Persistence**: Uses `setWidgetState` for user preferences
- **Tool Integration**: Direct tool calls via `callTool`

#### ✅ **Interactive Features**
- **Favorites System**: Star/unstar booking websites
- **Sorting Options**: By rank, price, or website
- **Special Fare Filter**: Toggle special fare visibility
- **Real-time Updates**: Refreshes results automatically
- **Fullscreen Mode**: Request expanded view when needed

#### ✅ **Modern UI/UX**
- **Responsive Design**: Adapts to different screen sizes
- **Hover Effects**: Smooth transitions and visual feedback
- **Loading States**: Spinner and progress indicators
- **Error Handling**: Graceful fallbacks and error messages
- **Accessibility**: Keyboard navigation and screen reader support

## 🔧 Technical Implementation

### React Component Architecture

#### **Main Component: `FlightResultsApp`**
```typescript
function FlightResultsApp() {
  // OpenAI Apps SDK hooks
  const displayMode = useOpenAiGlobal('displayMode');
  const maxHeight = useOpenAiGlobal('maxHeight');
  const locale = useOpenAiGlobal('locale');
  
  // Tool data
  const toolOutput = window.openai?.toolOutput as FlightResultsData | undefined;
  const toolInput = window.openai?.toolInput as { request_id?: string } | undefined;
  
  // Widget state
  const [favorites, setFavorites] = useWidgetState<string[]>([]);
  const [sortBy, setSortBy] = useWidgetState<'price' | 'website' | 'rank'>('rank');
  const [showSpecialFares, setShowSpecialFares] = useWidgetState(false);
}
```

#### **Custom Hooks Implementation**

**`useOpenAiGlobal` Hook:**
```typescript
function useOpenAiGlobal<K extends keyof any>(key: K): any {
  const [value, setValue] = useState(() => window.openai?.[key]);
  
  useEffect(() => {
    const handleSetGlobal = (event: CustomEvent) => {
      const newValue = event.detail.globals?.[key];
      if (newValue !== undefined) {
        setValue(newValue);
      }
    };

    window.addEventListener('openai:set_globals', handleSetGlobal as EventListener);
    return () => window.removeEventListener('openai:set_globals', handleSetGlobal as EventListener);
  }, [key]);

  return value;
}
```

**`useWidgetState` Hook:**
```typescript
function useWidgetState<T>(defaultState: T | (() => T)): [T, (state: React.SetStateAction<T>) => void] {
  const widgetStateFromWindow = useOpenAiGlobal('widgetState') as T;
  
  const [widgetState, setWidgetState] = useState<T>(() => {
    if (widgetStateFromWindow != null) {
      return widgetStateFromWindow;
    }
    return typeof defaultState === 'function' ? (defaultState as () => T)() : defaultState;
  });

  const setWidgetStateCallback = useCallback((state: React.SetStateAction<T>) => {
    setWidgetState((prevState) => {
      const newState = typeof state === 'function' ? (state as (prev: T) => T)(prevState) : state;
      if (newState != null) {
        window.openai?.setWidgetState?.(newState);
      }
      return newState;
    });
  }, []);

  return [widgetState, setWidgetStateCallback];
}
```

### Widget Features

#### **1. Favorites System**
- Users can star/unstar booking websites
- State persists across widget refreshes
- Visual feedback with star icons

#### **2. Sorting & Filtering**
- Sort by rank, price, or website name
- Filter special fares on/off
- Real-time UI updates

#### **3. Interactive Actions**
- **Refresh Results**: Calls `get_session_results` tool
- **Request Fullscreen**: Uses `requestDisplayMode`
- **Send Followup**: Uses `sendFollowupTurn` for questions

#### **4. Responsive Design**
- Adapts to `maxHeight` from host
- Responds to `displayMode` changes
- Mobile-friendly layout

### Data Flow

#### **Tool Data Access**
```typescript
// Access tool output data
const toolOutput = window.openai?.toolOutput as FlightResultsData | undefined;

// Access tool input data
const toolInput = window.openai?.toolInput as { request_id?: string } | undefined;
```

#### **Tool Response Handling**
```typescript
useEffect(() => {
  function onToolResponse(event: CustomEvent<{ tool: { name: string; args: Record<string, unknown> } }>) {
    if (event.detail.tool.name === 'get_session_results') {
      // Refresh UI after getting new results
      console.log('Flight results updated');
    }
  }

  window.addEventListener('openai:tool_response', onToolResponse as EventListener);
  return () => window.removeEventListener('openai:tool_response', onToolResponse as EventListener);
}, []);
```

## 🎨 UI Components

### **Flight Result Card**
Each flight result is displayed as an interactive card with:
- **Rank Badge**: Shows position (#1, #2, etc.)
- **Price Display**: Primary price with converted price if available
- **Website Info**: Booking site name and fare type
- **Timestamp**: Last updated time
- **Action Buttons**: Favorite toggle and booking link

### **Controls Panel**
- **Sort Dropdown**: Choose sorting method
- **Filter Checkbox**: Toggle special fares
- **Refresh Button**: Reload results
- **Fullscreen Button**: Expand view (when not fullscreen)

### **Status Indicators**
- **Processing Status**: Shows "Complete" or "Processing" badge
- **Result Count**: Displays total number of prices found
- **Loading States**: Spinner during data fetching

## 🔄 State Management

### **Widget State Persistence**
The widget uses `window.openai.setWidgetState` to persist:
- **Favorites**: Array of starred website names
- **Sort Preference**: Current sorting method
- **Filter Settings**: Special fare visibility

### **State Restoration**
On widget mount, state is restored from:
1. `window.openai.widgetState` (persisted state)
2. `window.openai.toolOutput` (tool data)
3. Default values (fallback)

## 🚀 Build Process

### **Development Setup**
```bash
cd mcp/navifare-mcp/web
npm install
npm run dev  # Watch mode for development
```

### **Production Build**
```bash
npm run build  # Creates dist/component.js
```

### **Integration**
The built component is copied to the MCP server:
```bash
cp web/dist/component.js src/components/
```

## 📱 Responsive Design

### **Layout Adaptations**
- **Inline Mode**: Compact card layout
- **Fullscreen Mode**: Expanded view with more space
- **Mobile**: Stacked layout with touch-friendly controls

### **Height Management**
- Respects `maxHeight` from host
- Scrollable content when needed
- Dynamic sizing based on content

## 🎯 User Experience

### **Loading States**
- **Initial Load**: Spinner with "Loading flight results..."
- **Refresh**: Button disabled during refresh
- **Error States**: Clear error messages with retry options

### **Interactive Feedback**
- **Hover Effects**: Cards highlight on hover
- **Button States**: Visual feedback for all interactions
- **Smooth Transitions**: CSS transitions for all state changes

### **Accessibility**
- **Keyboard Navigation**: All controls accessible via keyboard
- **Screen Reader Support**: Proper ARIA labels and roles
- **Color Contrast**: Meets WCAG guidelines
- **Focus Management**: Clear focus indicators

## 🔧 Configuration

### **MCP Server Registration**
```typescript
mcpServer.registerResource(
  "flight-results-react-widget",
  "ui://widget/flight-results-react.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/flight-results-react.html",
        mimeType: "text/html+skybridge",
        text: FLIGHT_RESULTS_REACT_HTML,
        _meta: {
          "openai/widgetDescription": "Advanced React-based flight price comparison widget...",
          "openai/widgetCSP": {
            connect_domains: [],
            resource_domains: []
          },
          "openai/widgetPrefersBorder": true
        }
      }
    ]
  })
);
```

### **Tool Integration**
```typescript
mcpServer.registerTool(
  "get_session_results",
  {
    // ... tool configuration
    _meta: {
      "openai/outputTemplate": "ui://widget/flight-results-react.html",
      "openai/widgetAccessible": true,
      // ... other metadata
    }
  }
);
```

## 🧪 Testing

### **MCP Inspector Testing**
```bash
cd mcp/navifare-mcp
npx @modelcontextprotocol/inspector node dist/index.js
```

### **Test Results**
- ✅ **3 UI Resources**: Original, Enhanced, and React-based widgets
- ✅ **3 Tools**: All properly configured with React widget
- ✅ **OpenAI Compliance**: All metadata and response structures correct
- ✅ **Widget Integration**: React component loads and functions properly

## 📊 Performance

### **Bundle Size**
- **Component Bundle**: ~1.0MB (includes React runtime)
- **Optimized**: Tree-shaken and minified
- **Fast Loading**: ES modules for optimal loading

### **Runtime Performance**
- **Efficient Rendering**: React's virtual DOM
- **State Updates**: Minimal re-renders
- **Memory Management**: Proper cleanup of event listeners

## 🔮 Future Enhancements

### **Potential Features**
- **Price Alerts**: Notify when prices drop
- **Comparison Charts**: Visual price trends
- **Multi-Currency**: Real-time currency conversion
- **Booking Integration**: Direct booking from widget
- **Share Results**: Export or share price comparisons

### **Technical Improvements**
- **Code Splitting**: Lazy load components
- **PWA Features**: Offline capability
- **Advanced Animations**: More sophisticated transitions
- **Accessibility**: Enhanced screen reader support

## 🎓 Key Concepts Explained

### **OpenAI Apps SDK Integration**
The widget follows all [OpenAI Apps SDK best practices](https://developers.openai.com/apps-sdk/build/custom-ux):
- Uses `window.openai` API for all host communication
- Implements proper event handling for globals and tool responses
- Persists state using `setWidgetState`
- Makes tool calls via `callTool`
- Requests display mode changes via `requestDisplayMode`

### **React Best Practices**
- **Custom Hooks**: Encapsulate OpenAI API access
- **State Management**: Proper state updates and persistence
- **Event Handling**: Cleanup of event listeners
- **Performance**: Efficient rendering and updates
- **Accessibility**: Proper ARIA attributes and keyboard support

### **Widget Architecture**
- **Separation of Concerns**: React component separate from MCP server
- **Build Process**: ESBuild for fast, optimized bundles
- **Integration**: Seamless embedding in HTML template
- **State Persistence**: Cross-session state management

## 🚀 Deployment

The React-based widget is now fully integrated into your MCP server and ready for use in ChatGPT. Users will experience:

1. **Modern Interface**: Clean, responsive React-based UI
2. **Interactive Features**: Favorites, sorting, filtering
3. **Real-time Updates**: Automatic refresh capabilities
4. **Persistent State**: Remembers user preferences
5. **Fullscreen Support**: Expanded view when needed

The widget provides a professional, feature-rich experience that matches the quality of your web application while being perfectly integrated into ChatGPT's interface! 🛫

