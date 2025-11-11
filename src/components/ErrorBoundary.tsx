import React from "react";

type Props = { children: React.ReactNode; title?: string };
type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("[ErrorBoundary] ", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="max-w-2xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-700">
              {this.props.title || "Falha ao renderizar esta página"}
            </h2>
            <p className="mt-2 text-sm text-red-700 whitespace-pre-wrap">
              {String(this.state.error ?? "Erro desconhecido")}
            </p>
            <p className="mt-3 text-xs text-red-600">
              Veja o console do navegador para rastros detalhados.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
