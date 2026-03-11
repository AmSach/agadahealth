/**
 * ErrorBoundary.jsx
 * Class component — React requires class for error boundaries.
 */

import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[Agada] Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-agada-cream px-4">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-card">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-agada-navy mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm mb-4">
              Agada encountered an unexpected error. Please refresh the page and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-agada-green text-white px-6 py-3 rounded-xl font-semibold hover:bg-agada-green-dark transition-colors"
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-4 text-xs text-left text-red-600 bg-red-50 p-2 rounded overflow-auto">
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
