// src/pages/Comissoes.tsx
import { useEffect, useMemo, useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

/** =========================================================
 *  Supabase (use local client – troca se você já tiver um cliente global)
 *  ========================================================= */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)

/** =========================================================
 *  Helpers de percentuais (humanizado <-> decimal)
 *  ========================================================= */
function toHumanPct(dec?: number | null): string {
  if (dec == null || isNaN(dec)) return ''
  return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(dec * 100) + '%'
}
function fromHumanPct(human: string): number | null {
  if (!human) return null
  const s = human.replace('%', '').replace(/\./g, '').replace(',', '.').trim()
  const num = Number(s)
  if (isNaN(num)) return null
  return num / 100
}

/** soma com tolerância para floats */
function sum(arr: number[]) {
  return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
}
const EPS = 0.000001

/** =========================================================
 *  Tipos
 *  ========================================================= */
type User = { id: string; nome: string | null; email: string }
type SimTable = { id: string; nome_tabela: string; segmento: string; admin_id?: string | null }
type CommissionRule = {
  id: string
  vendedor_id: string
  sim_table_id: string
  percent_padrao: number | null
  faixa_min: number | null
  faixa_max: number | null
  etapa_entrada_pct: number | null
  etapa_final_pct: number | null
  fluxo_meses: number | null
  fluxo_percentuais: number[] | null
  obs: string | null
  created_at: string
  // anexos/URLs você complementa depois
}

/** =========================================================
 *  Modal de Regra de Comissão
 *  ========================================================= */
type RegraComissaoModalProps = {
  open: boolean
  onClose: () => void
  vendedor?: User | null
  tabela?: SimTable | null
  // para edição
  initial?: Partial<CommissionRule> | null
  onSaved: () => void
}

function RegraComissaoModal({ open, onClose, vendedor, tabela, initial, onSaved }: RegraComissaoModalProps) {
  const isEditing = Boolean(initial?.id)

  // estados de formulário
  const [percentPadraoInput, setPercentPadraoInput] = useState<string>('') // ex.: "1,20%"
  const [faixaMin, setFaixaMin] = useState<string>('') // dinheiro bruto – só número (use sua máscara se quiser)
  const [faixaMax, setFaixaMax] = useState<string>('')
  const [entradaPctInput, setEntradaPctInput] = useState<string>('') // %
  const [finalPctInput, setFinalPctInput] = useState<string>('') // %
  const [meses, setMeses] = useState<number>(1)
  const [fluxoInputs, setFluxoInputs] = useState<string[]>(['100%'])
  const [obs, setObs] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!open) return
    // hidratar com "initial"
    const p = initial?.percent_padrao ?? null
    setPercentPadraoInput(p != null ? toHumanPct(p) : '')
    setFaixaMin(initial?.faixa_min != null ? String(initial?.faixa_min) : '')
    setFaixaMax(initial?.faixa_max != null ? String(initial?.faixa_max) : '')
    setEntradaPctInput(initial?.etapa_entrada_pct != null ? toHumanPct(initial?.etapa_entrada_pct) : '')
    setFinalPctInput(initial?.etapa_final_pct != null ? toHumanPct(initial?.etapa_final_pct) : '')
    const m = initial?.fluxo_meses ?? 1
    setMeses(m)
    const arr = initial?.fluxo_percentuais && initial.fluxo_percentuais.length > 0
      ? initial.fluxo_percentuais.map(toHumanPct)
      : ['100%']
    setFluxoInputs(arr)
    setObs(initial?.obs ?? '')
    setError('')
  }, [open, initial])

  // quando mudar nº de meses, reconstroi o array
  useEffect(() => {
    setFluxoInputs((prev) => {
      if (meses < 1) return ['100%']
      if (prev.length === meses) return prev
      if (prev.length < meses) {
        const add = Array(meses - prev.length).fill('0%')
        return [...prev, ...add]
      } else {
        return prev.slice(0, meses)
      }
    })
  }, [meses])

  const fluxoDecimais = useMemo(() => fluxoInputs.map(fromHumanPct).map((x) => x ?? 0), [fluxoInputs])
  const somaFluxo = useMemo(() => sum(fluxoDecimais), [fluxoDecimais])
  const somaFluxoHuman = useMemo(() => toHumanPct(somaFluxo), [somaFluxo])

  const handleSave = async () => {
    setError('')
    if (!vendedor || !tabela) {
      setError('Selecione vendedor e tabela.')
      return
    }
    const percentPadrao = fromHumanPct(percentPadraoInput)
    if (percentPadrao == null || percentPadrao <= 0) {
      setError('Informe o % padrão corretamente.')
      return
    }
    // soma do fluxo PRECISA ser 100%
    if (Math.abs(somaFluxo - 1) > EPS) {
      setError('A soma do fluxo deve ser exatamente 100%.')
      return
    }

    const payload = {
      vendedor_id: vendedor.id,
      sim_table_id: tabela.id,
      percent_padrao: percentPadrao,
      faixa_min: faixaMin ? Number(faixaMin) : null,
      faixa_max: faixaMax ? Number(faixaMax) : null,
      etapa_entrada_pct: entradaPctInput ? fromHumanPct(entradaPctInput) : 0,
      etapa_final_pct: finalPctInput ? fromHumanPct(finalPctInput) : 1,
      fluxo_meses: meses,
      fluxo_percentuais: fluxoDecimais,
      obs: obs || null,
    }

    try {
      setSaving(true)
      // upsert por (vendedor_id, sim_table_id)
      const { error: upErr } = await supabase
        .from('commission_rules')
        .upsert(payload, { onConflict: 'vendedor_id,sim_table_id' })
      if (upErr) throw upErr
      onClose()
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar regra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Regra de Comissão' : 'Nova Regra de Comissão'}</DialogTitle>
          <DialogDescription>
            {vendedor ? `Vendedor: ${vendedor.nome ?? vendedor.email}` : 'Selecione um vendedor'} •{' '}
            {tabela ? `Tabela: ${tabela.nome_tabela}` : 'Selecione uma tabela'}
          </DialogDescription>
        </DialogHeader>

        {/* Formulário */}
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>% padrão (ex.: 1,2%)</Label>
              <Input
                placeholder="Ex.: 1,2%"
                value={percentPadraoInput}
                onChange={(e) => setPercentPadraoInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Faixa mínima (R$)</Label>
                <Input placeholder="Ex.: 100000" value={faixaMin} onChange={(e) => setFaixaMin(e.target.value)} />
              </div>
              <div>
                <Label>Faixa máxima (R$)</Label>
                <Input placeholder="Ex.: 300000" value={faixaMax} onChange={(e) => setFaixaMax(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>% na entrada (ex.: 30%)</Label>
              <Input placeholder="Ex.: 30%" value={entradaPctInput} onChange={(e) => setEntradaPctInput(e.target.value)} />
            </div>
            <div>
              <Label>% na fase final (ex.: 70%)</Label>
              <Input placeholder="Ex.: 70%" value={finalPctInput} onChange={(e) => setFinalPctInput(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 items-end">
            <div className="col-span-1">
              <Label>Fluxo (meses)</Label>
              <Input
                type="number"
                min={1}
                max={36}
                value={meses}
                onChange={(e) => setMeses(Math.max(1, Math.min(36, Number(e.target.value || 1))))}
              />
            </div>
            <div className="col-span-3">
              <div className="text-sm text-muted-foreground mb-1">
                Informe os percentuais M1..Mn. <b>Soma do fluxo:</b> {somaFluxoHuman}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fluxoInputs.map((val, idx) => (
                  <Input
                    key={idx}
                    value={val}
                    onChange={(e) => {
                      const v = e.target.value
                      setFluxoInputs((old) => old.map((x, i) => (i === idx ? v : x)))
                    }}
                    placeholder={`M${idx + 1} (ex.: 10%)`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Input placeholder="Opcional" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** =========================================================
 *  Página principal
 *  ========================================================= */
export default function Comissoes() {
  // filtros essenciais para a tela (resumo já existente pode continuar)
  const [vendedores, setVendedores] = useState<User[]>([])
  const [tabelas, setTabelas] = useState<SimTable[]>([])
  const [selectedVendedorId, setSelectedVendedorId] = useState<string>('todos')

  // regras já configuradas para o vendedor
  const [regras, setRegras] = useState<(CommissionRule & { tabela_nome?: string })[]>([])

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTabela, setModalTabela] = useState<SimTable | null>(null)
  const [modalVendedor, setModalVendedor] = useState<User | null>(null)
  const [modalInitial, setModalInitial] = useState<Partial<CommissionRule> | null>(null)

  // ======= Carga inicial =======
  useEffect(() => {
    ;(async () => {
      // vendedores
      const { data: u, error: e1 } = await supabase
        .from('users') // TODO: confirme o nome exato
        .select('id, nome, email')
        .order('nome', { ascending: true })
      if (!e1 && u) setVendedores(u as User[])

      // sim_tables
      const { data: st, error: e2 } = await supabase
        .from('sim_tables') // TODO: confirme o nome exato
        .select('id, nome_tabela, segmento, admin_id')
        .order('nome_tabela', { ascending: true })
      if (!e2 && st) setTabelas(st as SimTable[])
    })()
  }, [])

  // ======= Carregar regras do vendedor =======
  async function loadRegras(vendedorId: string) {
    if (!vendedorId || vendedorId === 'todos') {
      setRegras([])
      return
    }
    const { data, error } = await supabase
      .from('commission_rules')
      .select('*, sim_table_id')
      .eq('vendedor_id', vendedorId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      // anexa nome da tabela
      const byId = new Map(tabelas.map((t) => [t.id, t.nome_tabela]))
      const enriched = (data as CommissionRule[]).map((r) => ({
        ...r,
        tabela_nome: byId.get(r.sim_table_id) || r.sim_table_id,
      }))
      setRegras(enriched)
    } else {
      setRegras([])
    }
  }

  useEffect(() => {
    loadRegras(selectedVendedorId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendedorId, tabelas.length])

  // ======= Tabelas disponíveis (excluir já configuradas) =======
  const tabelasDisponiveis = useMemo(() => {
    if (selectedVendedorId === 'todos') return tabelas
    const ja = new Set(regras.map((r) => r.sim_table_id))
    return tabelas.filter((t) => !ja.has(t.id))
  }, [tabelas, regras, selectedVendedorId])

  // ======= Abrir modal (novo) =======
  function openNovo(t: SimTable) {
    const vend = vendedores.find((v) => v.id === selectedVendedorId) || null
    setModalVendedor(vend)
    setModalTabela(t)
    setModalInitial(null)
    setModalOpen(true)
  }
  // ======= Abrir modal (editar) =======
  function openEditar(rule: CommissionRule & { tabela_nome?: string }) {
    const vend = vendedores.find((v) => v.id === rule.vendedor_id) || null
    const tab = tabelas.find((t) => t.id === rule.sim_table_id) || null
    setModalVendedor(vend)
    setModalTabela(tab)
    setModalInitial(rule)
    setModalOpen(true)
  }

  return (
    <div className="grid gap-6">
      {/* Filtros principais que você já tinha – adicionei só Vendedor aqui */}
      <Card className="p-4 grid md:grid-cols-3 gap-3">
        <div>
          <Label>Vendedor</Label>
          <Select value={selectedVendedorId} onValueChange={(v) => setSelectedVendedorId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {vendedores.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nome ?? v.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ... seus outros filtros existentes (período, segmento, status etc.) */}
      </Card>

      {/* CHIPS de Tabelas disponíveis */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Regras de Comissão</h3>
          <div className="text-sm text-muted-foreground">
            Clique em uma tabela para configurar. As já configuradas não aparecem aqui.
          </div>
        </div>

        {selectedVendedorId === 'todos' ? (
          <div className="text-sm text-muted-foreground">
            Selecione um vendedor para configurar regras específicas.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tabelasDisponiveis.map((t) => (
              <Button key={t.id} variant="secondary" className="rounded-full" onClick={() => openNovo(t)}>
                {t.nome_tabela}
              </Button>
            ))}
            {tabelasDisponiveis.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhuma tabela disponível para configurar.</div>
            )}
          </div>
        )}
      </Card>

      {/* LISTA de regras já configuradas para o vendedor */}
      {selectedVendedorId !== 'todos' && (
        <Card className="p-4">
          <div className="mb-3 font-semibold">Já configuradas</div>
          {regras.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma regra configurada para este vendedor.</div>
          ) : (
            <div className="grid gap-2">
              {regras.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border rounded-xl p-3 hover:bg-muted/50 transition"
                >
                  <div className="grid gap-1">
                    <div className="font-medium">{r.tabela_nome}</div>
                    <div className="text-sm text-muted-foreground">
                      % padrão: {toHumanPct(r.percent_padrao ?? 0)} • fluxo: {r.fluxo_meses ?? 1}x (soma{' '}
                      {toHumanPct(sum(r.fluxo_percentuais ?? []) ?? 0)})
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => openEditar(r)}>
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      <RegraComissaoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        vendedor={modalVendedor}
        tabela={modalTabela}
        initial={modalInitial || null}
        onSaved={() => loadRegras(selectedVendedorId)}
      />
    </div>
  )
}
