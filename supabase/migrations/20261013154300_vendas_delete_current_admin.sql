-- Migração aplicada ao Supabase em 2026-10-13 (versão 20261013154300).
-- A guia Usuários armazena administradores em public.users. A política anterior
-- de vendas consultava apenas a tabela legada public.admins e bloqueava
-- exclusões efetuadas por Admins válidos de outras unidades/vendedores.
-- Esta política adiciona o reconhecimento atual, sem remover nenhuma política
-- de vendedor ou de administrador legado.
CREATE POLICY vendas_delete_current_admin
ON public.vendas
AS PERMISSIVE
FOR DELETE
TO authenticated
USING ((SELECT public.is_admin()));
