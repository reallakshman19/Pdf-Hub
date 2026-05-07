import React from 'react';
import { error as logError } from '@/core/logger/service';

interface ErrorBoundaryProps {
  zone: string;
  resetKey?: string | number;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Isolates crashes to a single UI zone and allows controlled recovery.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: err.message,
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    logError('system', `Unhandled error in zone: ${this.props.zone}`, {
      error: err.message,
      stack: err.stack ?? '',
      componentStack: info.componentStack ?? '',
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <span className="text-lg text-red-600">!</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Something went wrong in {this.props.zone}
          </p>
          <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">{this.state.errorMessage}</p>
          <button
            className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
