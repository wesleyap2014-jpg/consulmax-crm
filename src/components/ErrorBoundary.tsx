// src/components/ErrorBoundary.tsx
import React from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
  /** Se qualquer valor dentro desse array mudar, o boundary reseta o estado de erro */
  resetKeys?: any[];
  /** Callback opcional quando um erro é capturado */
  onError?: (error: unknown, info: { componentStack: string }) => void;
  /** Callback opcional quando o usuário clica em "Tentar novamente" ou quando resetKeys muda */
  onReset?: () => void;
};

type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // Log estruturado no console
    // (muitos bundlers/infra mascaram o erro; deixar claro aqui ajuda o diagnóstico)
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.props.onError?.(error, { componentStack: errorInfo?.componentStack || "" });
  }

  componentDidUpdate(prevProps: Props) {
    // Reset automático ao mudar qualquer resetKey (ex.: rota, id, etc.)
    if (
      this.state.hasError &&
      Array.isArray(this.props.resetKeys) &&
      Array.isArray(prevProps.resetKeys)
    ) {
      const changed =
        this.props.resetKeys.length !== prevProps.resetKeys.length ||
        this.props.resetKeys.some((v, i) => v !== prevProps.resetKeys![i]);

      if (changed) {
        this.reset();
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const msg =
        (this.state.error && (this.state.error.message || String(this.state.error))) ||
        "Erro desconhecido";

      const stack =
        (this.state.error && this.state.error.stack) ||
        (typeof this.state.error === "object" ? JSON.stringify(this.state.error, null, 2) : "");

      return (
        <div className="p-6">
          <div className="max-w-2xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-700">
              {this.props.title || "Falha ao renderizar esta página"}
            </h2>

            <p className="mt-2 text-sm text-red-700 whitespace-pre-wrap">
              {String(msg)}
            </p>

            {stack && (
              <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap overflow-auto max-h-64">
                {stack}
              </pre>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Tentar novamente
              </button>
              <span className="text-xs text-red-600">
                Veja também o console do navegador para rastros detalhados.
              </span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
