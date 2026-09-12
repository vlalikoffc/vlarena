import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/** Keeps a rendering bug from turning the whole window into a white square. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[vlarena] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg p-8">
        <div className="max-w-md rounded-2xl border border-bad/30 bg-panel p-5">
          <h1 className="text-[15px] font-semibold text-bad">Something broke in the UI</h1>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-ink2">
            {this.state.error.message}
          </pre>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            Your battles and ratings are safe in local storage. Reload to continue.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-primary h-8 px-3 text-[12px]" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="btn h-8 px-3 text-[12px]"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
