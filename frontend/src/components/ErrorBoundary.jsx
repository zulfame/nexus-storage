import { Component } from "react";
import api from "@/lib/api";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

function ErrorScreen({ message, onReset }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f8fc] p-4" data-testid="error-screen">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-red-500 to-orange-500" />
        <div className="p-8 text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={30} />
          </div>
          <h1 className="font-display font-bold text-2xl tracking-tight text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-500 mt-2">
            An unexpected error occurred while rendering this page. It has been recorded in the
            activity logs.
          </p>
          {message && (
            <div className="mt-4 text-left bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 break-words max-h-28 overflow-auto">
              {message}
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={onReset}
              data-testid="error-retry"
              className="flex items-center gap-2 bg-primary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <RotateCcw size={16} /> Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              data-testid="error-home"
              className="flex items-center gap-2 text-sm font-medium border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Home size={16} /> Back home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    try {
      api.post("/errors", {
        message: error?.message || String(error),
        stack: (error?.stack || info?.componentStack || "").slice(0, 2000),
        path: typeof window !== "undefined" ? window.location.pathname : "",
      });
    } catch (e) {
      /* swallow */
    }
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      return <ErrorScreen message={this.state.message} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
