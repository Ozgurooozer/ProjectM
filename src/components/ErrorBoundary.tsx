import React, { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary catches JavaScript errors anywhere in the child component tree.
 * Displays a fallback UI instead of crashing the app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error Boundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-zinc-950 text-zinc-200 p-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
            <details className="mt-4 p-4 bg-zinc-900 rounded text-left text-sm overflow-auto max-h-64">
              <summary className="cursor-pointer font-semibold mb-2 text-zinc-400">Error details</summary>
              <pre className="text-xs text-red-400 whitespace-pre-wrap break-words">
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded text-white font-medium transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
