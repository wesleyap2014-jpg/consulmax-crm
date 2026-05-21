import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Evita que o CRM recarregue dados automaticamente quando o usuário
       * troca para outra aba/sistema e depois volta para a guia do CRM.
       *
       * Atualizações devem acontecer por ação explícita do usuário
       * (botão Atualizar, salvar, editar, excluir ou navegação interna).
       */
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 10,
      retry: 1,
    },
  },
})
