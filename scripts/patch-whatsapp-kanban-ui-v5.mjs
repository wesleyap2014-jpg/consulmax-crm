import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const replaceOnce = (a, b) => { if (s.includes(a)) s = s.replace(a, b); };
const insertBefore = (needle, block, flag) => { if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle); };

// Evita a gaveta piscar/fechar ao abrir por card do Kanban.
insertBefore(
  '  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;',
  `  function openConversationDrawer(conv: Conversation) {
    setActive(conv);
    setTimeout(() => {
      setActive((prev) => (prev?.id === conv.id ? prev : conv));
    }, 80);
  }
`,
  'function openConversationDrawer'
);

s = s.split('onClick={() => setActive(conv)}').join('onClick={() => openConversationDrawer(conv)}');

// Garante que a área lateral tenha backdrop e não dependa da lista antiga.
s = s.replace(
  'className={active ? "fixed inset-y-0 right-0 z-40 flex w-[min(780px,96vw)] flex-col bg-white shadow-2xl ring-1 ring-slate-200" : "hidden"}',
  'className={active ? "fixed inset-y-0 right-0 z-50 flex w-[min(820px,96vw)] flex-col bg-white shadow-2xl ring-1 ring-slate-200" : "hidden"}'
);

// Esconde os painéis inline gerados antes; eles serão exibidos como overlays reais abaixo.
s = s.replace('{manager && queueSettingsOpen && (\n            <div className="rounded-2xl border bg-slate-50 p-3">', '{false && manager && queueSettingsOpen && (\n            <div className="rounded-2xl border bg-slate-50 p-3">');
s = s.replace('{startTicketOpen && (\n            <div className="rounded-2xl border bg-slate-50 p-3">', '{false && startTicketOpen && (\n            <div className="rounded-2xl border bg-slate-50 p-3">');

// Overlays reais para Iniciar conversa e Configurar filas.
insertBefore(
  '      <Card className="mb-4 overflow-hidden border-0 shadow-sm">',
  `      {startTicketOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">WhatsApp</p>
                <h2 className="text-2xl font-black" style={{ color: C.navy }}>Iniciar conversa</h2>
                <p className="text-sm text-slate-500">Selecione a fila e informe o contato. Se o contato não existir, ele será criado automaticamente.</p>
              </div>
              <Button variant="ghost" onClick={() => setStartTicketOpen(false)} className="text-xl">×</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select value={boardQueue || selectedBoardQueue?.key || ""} onChange={(e) => setBoardQueue(e.target.value)} className="rounded-xl border px-3 py-3 text-sm">
                {effectiveQueues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
              </select>
              <input value={startTicketName} onChange={(e) => setStartTicketName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3 text-sm" />
              <input value={startTicketPhone} onChange={(e) => setStartTicketPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3 text-sm" />
            </div>
            <textarea value={startTicketMessage} onChange={(e) => setStartTicketMessage(e.target.value)} placeholder="Mensagem inicial. Fora da janela de 24h, a Meta pode exigir template aprovado." className="mt-3 min-h-[110px] w-full rounded-xl border px-3 py-3 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartTicketOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={startConversationFromCrm} style={{ background: C.red }} className="text-white">Criar e enviar</Button>
            </div>
          </div>
        </div>
      )}

      {manager && queueSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Central WhatsApp</p>
                <h2 className="text-2xl font-black" style={{ color: C.navy }}>Configurar filas</h2>
                <p className="text-sm text-slate-500">Crie a fila, escolha o modelo Kanban e vincule os usuários que terão acesso.</p>
              </div>
              <Button variant="ghost" onClick={() => setQueueSettingsOpen(false)} className="text-xl">×</Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
              <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
                <label className="text-sm font-bold text-slate-700">Nome da fila</label>
                <input value={newQueueName} onChange={(e) => setNewQueueName(e.target.value)} placeholder="Ex.: Contemplação" className="w-full rounded-xl border px-3 py-3 text-sm" />
                <label className="text-sm font-bold text-slate-700">Modelo do Kanban</label>
                <select value={selectedModelForQueue} onChange={(e) => setSelectedModelForQueue(e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm">
                  <option value="">Selecione o modelo</option>
                  {kanbanModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <Button onClick={createQueueConfigured} disabled={savingQueueConfig} className="w-full" style={{ background: C.red }}>Criar/atualizar fila</Button>
                <div className="pt-3">
                  <label className="text-sm font-bold text-slate-700">Fila para configurar</label>
                  <select value={selectedQueueKey} onChange={(e) => { const key = e.target.value; const q = queuesConfig.find((item) => item.key === key); setSelectedQueueKey(key); setSelectedModelForQueue(q?.kanban_model_id || ""); }} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm">
                    {queuesConfig.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                  </select>
                </div>
                <Button variant="outline" onClick={() => attachModelToSelectedQueue(selectedModelForQueue)} disabled={!selectedQueueKey} className="w-full">Vincular modelo à fila selecionada</Button>
              </div>
              <div className="rounded-3xl border p-4">
                <p className="text-sm font-bold text-slate-800">Usuários vinculados</p>
                <p className="mb-3 text-xs text-slate-500">Somente usuários marcados verão os tickets dessa fila. Admin/gestor continuam vendo tudo.</p>
                <div className="grid max-h-[470px] gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">
                  {users.map((user) => <label key={user.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3 hover:bg-slate-50"><input type="checkbox" checked={isUserLinkedToSelectedQueue(user)} disabled={!user.auth_user_id || savingQueueConfig} onChange={() => toggleQueueUser(user)} className="mt-1" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{user.nome || user.email || "Usuário"}</span><span className="block truncate text-xs text-slate-400">{user.email || user.auth_user_id || "Sem auth_user_id"}</span></span></label>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
`,
  'Iniciar conversa</h2>'
);

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-kanban-ui-v5] ok');
