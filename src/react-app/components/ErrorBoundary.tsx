import { Component, type ReactNode, createContext, useContext, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, Home, Trash2, WifiOff, Bug, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/react-app/components/ui/button";

// ============================================================================
// ERROR TYPES & CONTEXT
// ============================================================================

type ErrorCategory = 'network' | 'render' | 'api' | 'unknown';

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  category: ErrorCategory;
  timestamp: number;
  url: string;
  userAgent: string;
}

interface ErrorContextValue {
  reportError: (error: Error, category?: ErrorCategory) => void;
  clearErrors: () => void;
  errors: ErrorReport[];
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useErrorReporter() {
  const context = useContext(ErrorContext);
  if (!context) {
    // Return a no-op reporter if not in ErrorProvider
    return {
      reportError: () => {},
      clearErrors: () => {},
      errors: [],
    };
  }
  return context;
}

/**
 * Hook for handling async errors in components
 * Catches errors from promises and reports them
 */
export function useAsyncErrorHandler() {
  const [error, setError] = useState<Error | null>(null);
  const { reportError } = useErrorReporter();

  const handleError = useCallback((err: Error, category: ErrorCategory = 'api') => {
    setError(err);
    reportError(err, category);
  }, [reportError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const wrapAsync = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    return promise.catch((err) => {
      handleError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    });
  }, [handleError]);

  return { error, handleError, clearError, wrapAsync };
}

// ============================================================================
// ERROR PROVIDER
// ============================================================================

interface ErrorProviderProps {
  children: ReactNode;
  onError?: (report: ErrorReport) => void;
}

export function ErrorProvider({ children, onError }: ErrorProviderProps) {
  const [errors, setErrors] = useState<ErrorReport[]>([]);

  const reportError = useCallback((error: Error, category: ErrorCategory = 'unknown') => {
    const report: ErrorReport = {
      message: error.message,
      stack: error.stack,
      category,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    setErrors(prev => [...prev.slice(-9), report]); // Keep last 10 errors
    console.error('[ErrorProvider]', category, error.message);
    
    onError?.(report);
  }, [onError]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return (
    <ErrorContext.Provider value={{ reportError, clearErrors, errors }}>
      {children}
    </ErrorContext.Provider>
  );
}

// ============================================================================
// ERROR BOUNDARY PROPS & STATE
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  category: ErrorCategory;
}

function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || 
      message.includes('fetch') || 
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('cors')) {
    return 'network';
  }
  
  if (message.includes('api') || 
      message.includes('500') || 
      message.includes('404') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')) {
    return 'api';
  }
  
  return 'render';
}

// ============================================================================
// MAIN ERROR BOUNDARY
// ============================================================================

/**
 * Production-safe Error Boundary
 * Catches React rendering errors and displays a user-friendly fallback UI
 * Logs errors without exposing sensitive information to users
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, category: 'unknown' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, category: categorizeError(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error.message);
    console.error("[ErrorBoundary] Stack:", error.stack);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, category: 'unknown' });
  };

  handleClearStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    } catch (e) {
      console.error("Failed to clear storage:", e);
      window.location.reload();
    }
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallbackUI
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          category={this.state.category}
          onRetry={this.handleRetry}
          onRefresh={this.handleRefresh}
          onGoHome={this.handleGoHome}
          onGoBack={this.handleGoBack}
          onClearStorage={this.handleClearStorage}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// SECTION ERROR BOUNDARY
// ============================================================================

/**
 * Lightweight error boundary for specific sections
 * Shows inline error instead of full-page error
 */
export class SectionErrorBoundary extends Component<
  ErrorBoundaryProps & { sectionName?: string },
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps & { sectionName?: string }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, category: 'unknown' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, category: categorizeError(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[SectionErrorBoundary] Error in ${this.props.sectionName || "section"}:`, error.message);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, category: 'unknown' });
  };

  render() {
    if (this.state.hasError) {
      const { category, error } = this.state;
      const isNetwork = category === 'network';

      return (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive mb-2">
            {isNetwork ? (
              <WifiOff className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">
              {this.props.sectionName 
                ? `Error loading ${this.props.sectionName}` 
                : isNetwork 
                  ? "Network error" 
                  : "Error loading section"}
            </span>
          </div>
          {import.meta.env.DEV && error && (
            <p className="text-xs text-destructive/70 mb-2 font-mono truncate">
              {error.message}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={this.handleRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// ROUTE ERROR BOUNDARY
// ============================================================================

/**
 * Error boundary for route-level errors
 * Provides navigation options specific to routing
 */
export class RouteErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, category: 'unknown' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, category: categorizeError(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[RouteErrorBoundary] Route error:", error.message);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, category: 'unknown' });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">
                Page failed to load
              </h1>
              <p className="text-sm text-muted-foreground">
                This page encountered an error. Try going back or returning home.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleGoBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={this.handleGoHome} variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// ERROR FALLBACK UI COMPONENT
// ============================================================================

interface ErrorFallbackUIProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  category: ErrorCategory;
  onRetry: () => void;
  onRefresh: () => void;
  onGoHome: () => void;
  onGoBack: () => void;
  onClearStorage: () => void;
}

function ErrorFallbackUI({
  error,
  errorInfo,
  category,
  onRetry,
  onRefresh,
  onGoHome,
  onGoBack,
  onClearStorage,
}: ErrorFallbackUIProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const getIcon = () => {
    switch (category) {
      case 'network':
        return <WifiOff className="h-8 w-8 text-orange-500" />;
      case 'api':
        return <Bug className="h-8 w-8 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-8 w-8 text-destructive" />;
    }
  };

  const getMessage = () => {
    switch (category) {
      case 'network':
        return {
          title: "Connection problem",
          description: "We couldn't reach the server. Check your internet connection and try again.",
        };
      case 'api':
        return {
          title: "Service unavailable",
          description: "We're having trouble with our servers. Please try again in a moment.",
        };
      default:
        return {
          title: "Something went wrong",
          description: "We encountered an unexpected error. Don't worry, your data is safe.",
        };
    }
  };

  const handleCopyError = async () => {
    const errorText = [
      `Error: ${error?.message}`,
      `Category: ${category}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      error?.stack ? `\nStack:\n${error.stack}` : '',
      errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const { title, description } = getMessage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            category === 'network' ? 'bg-orange-500/10' :
            category === 'api' ? 'bg-yellow-500/10' :
            'bg-destructive/10'
          }`}>
            {getIcon()}
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>

        {/* Dev mode error details */}
        {import.meta.env.DEV && error && (
          <div className="text-left">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Bug className="h-3 w-3" />
              {showDetails ? "Hide" : "Show"} error details
            </button>
            
            {showDetails && (
              <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-red-400 font-medium">Debug Info</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={handleCopyError}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-red-400 font-mono text-xs break-all">
                  {error.toString()}
                </p>
                {errorInfo?.componentStack && (
                  <pre className="mt-2 text-red-400/70 font-mono text-[10px] whitespace-pre-wrap max-h-40 overflow-auto">
                    {errorInfo.componentStack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Primary actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button onClick={onGoBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button onClick={onGoHome} variant="outline">
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
        </div>

        {/* Secondary actions */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-3">
            Still having issues?
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onRefresh}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Hard Refresh
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onClearStorage}
              className="text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear Cache & Reload
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// API ERROR COMPONENT
// ============================================================================

interface APIErrorProps {
  error: Error | string | null;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Display component for API errors
 * Use this when fetching data fails
 */
export function APIError({ error, onRetry, compact = false }: APIErrorProps) {
  const message = error instanceof Error ? error.message : error;
  const isNetwork = message?.toLowerCase().includes('fetch') || 
                    message?.toLowerCase().includes('network');

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        {isNetwork ? <WifiOff className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <span>{isNetwork ? "Connection error" : "Failed to load"}</span>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry} className="h-6 px-2">
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
        isNetwork ? 'bg-orange-500/10' : 'bg-destructive/10'
      }`}>
        {isNetwork ? (
          <WifiOff className="h-6 w-6 text-orange-500" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-destructive" />
        )}
      </div>
      <p className="text-foreground font-medium mb-1">
        {isNetwork ? "Connection problem" : "Failed to load data"}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        {isNetwork 
          ? "Check your internet connection" 
          : "Something went wrong. Please try again."}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// LOADING BOUNDARY
// ============================================================================

interface LoadingBoundaryProps {
  loading: boolean;
  error: Error | string | null;
  onRetry?: () => void;
  children: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * Combined loading and error state handler
 * Wraps content that needs both loading and error states
 */
export function LoadingBoundary({ 
  loading, 
  error, 
  onRetry, 
  children, 
  loadingFallback 
}: LoadingBoundaryProps) {
  if (loading) {
    return loadingFallback || (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <APIError error={error} onRetry={onRetry} />;
  }

  return <>{children}</>;
}
