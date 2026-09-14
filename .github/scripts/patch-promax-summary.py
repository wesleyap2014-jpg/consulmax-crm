from pathlib import Path

path = Path("src/pages/propostas-pro-max/modelos/ProMaxModelosHub.tsx")
text = path.read_text(encoding="utf-8")

old_logic = '''  const remainingMonths = Math.max(0, flow.totalMonths - lastContemplationMonth);
  const postContemplationEntry = monthEntries.find((entry) => entry.month > lastContemplationMonth);
  const postContemplationInstallment = onlyNumber(proposal.parcela_escolhida) || summary.postContemplationInstallment || postContemplationEntry?.installment || 0;
'''

new_logic = '''  const remainingMonths = Math.max(0, flow.totalMonths - lastContemplationMonth);
  const postContemplationEntry = monthEntries.find((entry) => entry.month > lastContemplationMonth);
  const postContemplationInstallment = onlyNumber(proposal.parcela_escolhida) || summary.postContemplationInstallment || postContemplationEntry?.installment || 0;
  const specialPostContemplationStart = lastContemplationMonth + 1;
  const specialPostContemplationEnd = Math.min(configuredInitialMonths, flow.totalMonths);
  const specialPostContemplationCount = specialPostContemplationEnd >= specialPostContemplationStart
    ? specialPostContemplationEnd - specialPostContemplationStart + 1
    : 0;
  const specialPostContemplationEntry = monthEntries.find((entry) => entry.month === specialPostContemplationStart);
  const specialPostContemplationInstallment = specialPostContemplationEntry?.installment || postContemplationInstallment;
  const hasSpecialPostContemplationInstallments = specialPostContemplationCount > 0
    && Math.abs(specialPostContemplationInstallment - postContemplationInstallment) > 0.01;
  const regularPostContemplationCount = Math.max(0, remainingMonths - specialPostContemplationCount);
'''

old_view = '''                  <div className="mt-1 text-base font-black" style={{ color: C.navy }}>
                    {remainingMonths} x de {brMoney(postContemplationInstallment)}
                  </div>
'''

new_view = '''                  <div className="mt-1 text-base font-black" style={{ color: C.navy }}>
                    {hasSpecialPostContemplationInstallments ? (
                      <div className="space-y-1">
                        <div>
                          {installmentRangeLabel(specialPostContemplationStart, specialPostContemplationEnd)}: {brMoney(specialPostContemplationInstallment)}
                        </div>
                        {regularPostContemplationCount > 0 ? (
                          <div className="text-sm">+ {regularPostContemplationCount} x de {brMoney(postContemplationInstallment)}</div>
                        ) : null}
                      </div>
                    ) : (
                      <>{remainingMonths} x de {brMoney(postContemplationInstallment)}</>
                    )}
                  </div>
'''

if old_logic not in text:
    raise SystemExit("Bloco de logica esperado nao encontrado")
if old_view not in text:
    raise SystemExit("Bloco visual esperado nao encontrado")

text = text.replace(old_logic, new_logic, 1)
text = text.replace(old_view, new_view, 1)
path.write_text(text, encoding="utf-8")
