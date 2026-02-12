import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Check if it's a chunk load error
    const isChunkError = error.message?.includes('Loading chunk') || 
                         error.name === 'ChunkLoadError' ||
                         error.message?.includes('dynamically imported module') ||
                         error.message?.includes('Importing a module script failed');

    if (isChunkError) {
       // Check if we haven't reloaded recently (prevent infinite loops)
       const lastReload = sessionStorage.getItem('chunk_reload_timestamp');
       const now = Date.now();
       
       if (!lastReload || (now - parseInt(lastReload)) > 10000) {
         sessionStorage.setItem('chunk_reload_timestamp', String(now));
         window.location.reload();
         return;
       }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes('Loading chunk') || 
                           this.state.error?.name === 'ChunkLoadError' ||
                           this.state.error?.message?.includes('dynamically imported module') ||
                           this.state.error?.message?.includes('Importing a module script failed');

      if (isChunkError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="text-center p-8">
              <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Memperbarui Aplikasi...</h2>
              <p className="text-gray-500">Sedang memuat versi terbaru, mohon tunggu sebentar.</p>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center border border-gray-100">
            <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              Terjadi Kesalahan
            </h2>
            
            <p className="text-gray-600 mb-8 leading-relaxed">
              Maaf, terjadi kesalahan yang tidak terduga. Silakan coba muat ulang halaman.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Muat Ulang Halaman
              </button>
              
              <button
                onClick={() => this.setState({ hasError: false })}
                className="w-full inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Coba Lagi
              </button>
            </div>
            
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-8 text-left bg-gray-50 p-4 rounded-lg overflow-auto max-h-48 border border-gray-200">
                <p className="text-xs font-mono text-red-600 whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
