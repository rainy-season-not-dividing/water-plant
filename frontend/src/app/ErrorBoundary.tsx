import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  props: Props;
  state: State = { error: null };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#070b13] text-slate-100 p-8">
          <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center">
            <h2 className="text-xl font-semibold text-red-400 mb-3">运行时错误</h2>
            <p className="text-sm text-slate-300 mb-4 break-words">{this.state.error.message}</p>
            <pre className="text-xs text-slate-500 text-left overflow-auto max-h-48 mb-6 p-3 rounded bg-slate-900/50">
              {this.state.error.stack}
            </pre>
            <button
              onClick={this.handleRetry}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
