import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

// Types for flight results
interface FlightResult {
  rank: number;
  price: string;
  convertedPrice?: string;
  website: string;
  bookingUrl?: string;
  fareType: string;
  timestamp?: string;
}

interface FlightResultsData {
  request_id: string;
  status: string;
  totalResults: number;
  results: FlightResult[];
  tripSummary?: {
    route: string;
    date: string;
    passengers: string;
    class: string;
  };
}

interface WidgetState {
  favorites: string[];
  sortBy: 'price' | 'website' | 'rank';
  showOnlyFavorites: boolean;
}

// OpenAI Apps SDK Types (exact specification)
declare global {
  interface Window {
    openai: API & OpenAiGlobals;
  }
  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}

type UnknownObject = Record<string, unknown>;

type OpenAiGlobals<
  ToolInput extends UnknownObject = UnknownObject,
  ToolOutput extends UnknownObject = UnknownObject,
  ToolResponseMetadata extends UnknownObject = UnknownObject,
  WidgetState extends UnknownObject = UnknownObject
> = {
  theme: Theme;
  userAgent: UserAgent;
  locale: string;

  // layout
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;

  // state
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
};

type API<WidgetState extends UnknownObject = UnknownObject> = {
  /** Calls a tool on your MCP. Returns the full response. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResponse>;
  
  /** Triggers a followup turn in the ChatGPT conversation */
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  
  /** Opens an external link, redirects web page or mobile app */
  openExternal(payload: { href: string }): void;
  
  /** For transitioning an app from inline to fullscreen or pip */
  requestDisplayMode: (args: { mode: DisplayMode }) => Promise<{
    /**
    * The granted display mode. The host may reject the request.
    * For mobile, PiP is always coerced to fullscreen.
    */
    mode: DisplayMode;
  }>;

  setWidgetState: (state: WidgetState) => Promise<void>;
};

// Dispatched when any global changes in the host page
export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";
export class SetGlobalsEvent extends CustomEvent<{
  globals: Partial<OpenAiGlobals>;
}> {
  readonly type = SET_GLOBALS_EVENT_TYPE;
}

export type CallToolResponse = {
  content: Array<{ type: string; text?: string; html?: string }>;
  isError?: boolean;
};

export type DisplayMode = "pip" | "inline" | "fullscreen";

export type Theme = "light" | "dark";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

// OpenAI Apps SDK helper hooks (exact specification)
function useOpenAiGlobal<K extends keyof OpenAiGlobals>(key: K): OpenAiGlobals[K] {
  return useSyncExternalStore(
    (onChange) => {
      const handleSetGlobal = (event: SetGlobalsEvent) => {
        const value = event.detail.globals[key];
        if (value !== undefined) {
          onChange();
        }
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, { passive: true });
      return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
    },
    () => window.openai[key]
  );
}

function useWidgetState<T extends WidgetState>(
  defaultState: T | (() => T)
): [T, (state: React.SetStateAction<T>) => void] {
  const widgetStateFromWindow = useOpenAiGlobal('widgetState') as T;
  
  const [widgetState, setWidgetState] = useState<T>(() => {
    if (widgetStateFromWindow != null) {
      return widgetStateFromWindow;
    }
    return typeof defaultState === 'function' ? (defaultState as () => T)() : defaultState;
  });

  useEffect(() => {
    if (widgetStateFromWindow != null) {
      setWidgetState(widgetStateFromWindow);
    }
  }, [widgetStateFromWindow]);

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

// Main Flight Results Component (Pizzaz-style)
function FlightResultsApp() {
  const displayMode = useOpenAiGlobal('displayMode');
  const maxHeight = useOpenAiGlobal('maxHeight');
  const theme = useOpenAiGlobal('theme');
  
  const toolOutput = useOpenAiGlobal('toolOutput') as FlightResultsData | undefined;
  
  // Widget state for favorites and filters (like Pizzaz)
  const [widgetState, setWidgetState] = useWidgetState<WidgetState>(() => ({
    favorites: [],
    sortBy: 'price',
    showOnlyFavorites: false
  }));

  const refreshResults = useCallback(async () => {
    if (toolOutput?.request_id) {
      await window.openai?.callTool('get_session_results', { 
        request_id: toolOutput.request_id 
      });
    }
  }, [toolOutput?.request_id]);
  
  // Auto-refresh when status is IN_PROGRESS
  useEffect(() => {
    if (toolOutput?.status === 'IN_PROGRESS') {
      const timer = setTimeout(refreshResults, 5000);
      return () => clearTimeout(timer);
    }
  }, [toolOutput?.status, toolOutput?.totalResults, refreshResults]);

  const requestFullscreen = useCallback(async () => {
    await window.openai?.requestDisplayMode?.({ mode: 'fullscreen' });
  }, []);

  const sendFollowup = useCallback(async (message: string) => {
    await window.openai?.sendFollowUpMessage?.({ prompt: message });
  }, []);

  // Toggle favorite (like Pizzaz)
  const toggleFavorite = useCallback((resultId: string) => {
    setWidgetState(prev => ({
      ...prev,
      favorites: prev.favorites.includes(resultId)
        ? prev.favorites.filter(id => id !== resultId)
        : [...prev.favorites, resultId]
    }));
  }, [setWidgetState]);

  // Sort results
  const sortedResults = useCallback(() => {
    if (!toolOutput?.results) return [];
    
    let filtered = toolOutput.results;
    
    if (widgetState.showOnlyFavorites) {
      filtered = filtered.filter(result => 
        widgetState.favorites.includes(`${result.website}-${result.rank}`)
      );
    }
    
    return [...filtered].sort((a, b) => {
      switch (widgetState.sortBy) {
        case 'price':
          const priceA = parseFloat(a.price.replace(/[^\d.]/g, ''));
          const priceB = parseFloat(b.price.replace(/[^\d.]/g, ''));
          return priceA - priceB;
        case 'website':
          return a.website.localeCompare(b.website);
        case 'rank':
        default:
          return a.rank - b.rank;
      }
    });
  }, [toolOutput?.results, widgetState]);

  // OpenAI design system colors
  const colors = {
    text: theme === 'dark' ? '#FFFFFF' : '#0D0D0D',
    textSecondary: theme === 'dark' ? '#A3A3A3' : '#676767',
    border: theme === 'dark' ? '#363636' : '#ECECEC',
    background: theme === 'dark' ? '#1A1A1A' : '#FFFFFF',
    cardBackground: theme === 'dark' ? '#2A2A2A' : '#FFFFFF',
    accent: '#10A37F',
    accentHover: '#0D8A6A',
    surface: theme === 'dark' ? '#262626' : '#F9F9F9'
  };

  if (!toolOutput) {
    return null;
  }

  const { results, status, totalResults, tripSummary } = toolOutput;
  
  if (!results || results.length === 0) {
    return (
      <div style={{ 
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: colors.textSecondary,
        fontSize: '14px',
        backgroundColor: colors.background,
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '500' }}>
          🔍 Searching for flight prices...
        </div>
        {status === 'IN_PROGRESS' && (
          <div style={{ fontSize: '13px', opacity: 0.8 }}>
            Checking booking sites across the web
          </div>
        )}
      </div>
    );
  }

  const processedResults = sortedResults();

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      color: colors.text,
      backgroundColor: colors.background,
      maxHeight: maxHeight ? `${maxHeight}px` : 'none',
      overflow: 'auto'
    }}>
      {/* Header with trip summary and controls */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surface
      }}>
        {tripSummary && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{
              fontSize: '15px',
              fontWeight: '600',
              color: colors.text,
              marginBottom: '4px'
            }}>
              {tripSummary.route}
            </div>
            <div style={{
              fontSize: '13px',
              color: colors.textSecondary
            }}>
              {tripSummary.date} · {tripSummary.passengers} · {tripSummary.class}
            </div>
          </div>
        )}
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{
            fontSize: '15px',
            fontWeight: '600',
            color: colors.text
          }}>
            {processedResults.length} {processedResults.length === 1 ? 'result' : 'results'}
            {status === 'IN_PROGRESS' && (
              <span style={{
                marginLeft: '8px',
                fontSize: '13px',
                fontWeight: '400',
                color: colors.textSecondary
              }}>
                (updating...)
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Filter toggle */}
            <button
              onClick={() => setWidgetState(prev => ({ ...prev, showOnlyFavorites: !prev.showOnlyFavorites }))}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                backgroundColor: widgetState.showOnlyFavorites ? colors.accent : colors.cardBackground,
                color: widgetState.showOnlyFavorites ? 'white' : colors.text,
                cursor: 'pointer'
              }}
            >
              ❤️ {widgetState.favorites.length}
            </button>
            
            {/* Fullscreen button */}
            {displayMode !== 'fullscreen' && (
              <button
                onClick={requestFullscreen}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  backgroundColor: colors.cardBackground,
                  color: colors.text,
                  cursor: 'pointer'
                }}
              >
                ⛶ Expand
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid - Card-based layout like Pizzaz */}
      <div style={{
        display: 'grid',
        gap: '12px',
        padding: '16px',
        gridTemplateColumns: displayMode === 'fullscreen' 
          ? 'repeat(auto-fill, minmax(300px, 1fr))' 
          : '1fr'
      }}>
        {processedResults.map((result) => {
          const resultId = `${result.website}-${result.rank}`;
          const isFavorite = widgetState.favorites.includes(resultId);
          
          return (
            <div
              key={resultId}
              style={{
                backgroundColor: colors.cardBackground,
                border: `1px solid ${colors.border}`,
                borderRadius: '12px',
                padding: '16px',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: theme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              {/* Favorite button */}
              <button
                onClick={() => toggleFavorite(resultId)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  opacity: isFavorite ? 1 : 0.3,
                  transition: 'opacity 0.2s'
                }}
              >
                {isFavorite ? '❤️' : '🤍'}
              </button>
              
              {/* Website badge */}
              <div style={{
                display: 'inline-block',
                padding: '4px 8px',
                backgroundColor: colors.surface,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                color: colors.textSecondary,
                marginBottom: '12px'
              }}>
                {result.website.toUpperCase()}
              </div>
              
              {/* Price */}
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: colors.text,
                marginBottom: '8px'
              }}>
                {result.price}
              </div>
              
              {/* Fare type and converted price */}
              <div style={{
                fontSize: '13px',
                color: colors.textSecondary,
                marginBottom: '16px'
              }}>
                {result.fareType}
                {result.convertedPrice && result.convertedPrice !== result.price && (
                  <span style={{ marginLeft: '8px' }}>
                    · {result.convertedPrice}
                  </span>
                )}
              </div>
              
              {/* Action buttons */}
              <div style={{
                display: 'flex',
                gap: '8px'
              }}>
                {result.bookingUrl && (
                  <button
                    onClick={() => window.openai?.openExternal?.({ href: result.bookingUrl! })}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      backgroundColor: colors.accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = colors.accentHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = colors.accent;
                    }}
                  >
                    Book Now
                  </button>
                )}
                
                <button
                  onClick={() => sendFollowup(`Tell me more about this ${result.price} flight on ${result.website}`)}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: colors.surface,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  ℹ️
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Footer with actions */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => sendFollowup('Show me more flight options or different dates')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            backgroundColor: colors.cardBackground,
            color: colors.text,
            cursor: 'pointer'
          }}
        >
          🔍 More Options
        </button>
        
        <button
          onClick={refreshResults}
          disabled={status === 'IN_PROGRESS'}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            backgroundColor: colors.cardBackground,
            color: colors.text,
            cursor: status === 'IN_PROGRESS' ? 'not-allowed' : 'pointer',
            opacity: status === 'IN_PROGRESS' ? 0.6 : 1
          }}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}

// Mount the component
const rootElement = document.getElementById('flight-results-root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<FlightResultsApp />);
} else {
  console.error('Could not find #flight-results-root element');
}

