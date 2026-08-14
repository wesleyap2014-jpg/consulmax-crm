import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import html2canvas from "html2canvas"
import type { WorkItem } from "@/components/clientes/customerSuccessModel"
import { fmtDate, fmtDateTime, fmtMoney } from "@/components/clientes/customerSuccessModel"

type PropostaPDF = {
  cliente: string
  documentoMascarado: string
  segmento: string
  valorCredito: number
  vendedor: string
  data: string
  observacao?: string
}

export async function gerarPropostaPDF(p: PropostaPDF) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text("Consulmax Consórcios", 14, 16)
  doc.setFontSize(10)
  doc.text("Maximize as suas conquistas", 14, 22)

  autoTable(doc, {
    startY: 28,
    head: [["Campo","Valor"]],
    body: [
      ["Cliente", p.cliente],
      ["Documento", p.documentoMascarado],
      ["Segmento", p.segmento],
      ["Crédito", new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.valorCredito)],
      ["Vendedor", p.vendedor],
      ["Data", p.data],
      ...(p.observacao ? [["Obs.", p.observacao]] : [])
    ],
    styles: { halign: 'left' }
  })

  return doc.output("blob")
}

function esc(v: unknown) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
}
function ul(items?: string[]) {
  return items?.length ? `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="empty">Sem apontamentos relevantes.</div>`
}
function fileSafe(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase() || "cliente"
}

export async function baixarRelatorioSucessoClientePDF(item: WorkItem) {
  const r = item.cs.report
  if (!r) throw new Error("Relatório ainda não foi gerado para esta venda.")
  const nome = String(item.cliente?.nome || item.lead?.nome || "Cliente")
  const fortes = r.pontos_fortes?.length ? r.pontos_fortes.map(p=>`<div class="point good"><b>${esc(p.comportamento)}</b><div><strong>Evidência:</strong> ${esc(p.evidencia)}</div><div><strong>Reforçar:</strong> ${esc(p.reforcar)}</div></div>`).join("") : `<div class="empty">Nenhum comportamento específico foi destacado com segurança.</div>`
  const atencao = r.pontos_atencao?.length ? r.pontos_atencao.map(p=>`<div class="point care"><b>${esc(p.comportamento)}</b><div><strong>Evidência:</strong> ${esc(p.evidencia)}</div><div><strong>Risco:</strong> ${esc(p.risco)}</div><div><strong>Como melhorar:</strong> ${esc(p.como_melhorar)}</div></div>`).join("") : `<div class="empty">Nenhum ponto crítico de atenção foi identificado.</div>`
  const root = document.createElement("div")
  root.style.cssText = "position:fixed;left:-12000px;top:0;width:794px;background:#fff;z-index:-1"
  root.innerHTML = `<style>
  .csr{font-family:"Manrope",Arial,sans-serif;color:#172033;background:#fff;padding:48px 52px;font-size:14px;line-height:1.52}.head{display:flex;justify-content:space-between;gap:30px;border-bottom:4px solid #A11C27;padding-bottom:18px}.logo{width:180px}.kicker{color:#A11C27;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:10px}.csr h1{font-size:28px;color:#1E293F;margin:5px 0 3px}.small{font-size:11px;color:#64748B}.meta{text-align:right}.sale{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:12px;background:#F7F8FA;border:1px solid #E5E7EB;border-radius:15px;padding:16px;margin:22px 0}.lab{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;font-weight:800}.val{font-size:13px;font-weight:800;color:#1E293F;margin-top:3px}.sec{margin:24px 0}.title{font-size:18px;color:#1E293F;font-weight:800;border-left:5px solid #A11C27;padding-left:10px;margin-bottom:12px}.summary{background:#FBFAF5;border-left:4px solid #B5A573;border-radius:0 12px 12px 0;padding:15px 17px}.voice{font-size:15px;font-weight:650;color:#1E293F;font-style:italic}.fofa{display:grid;grid-template-columns:1fr 1fr;gap:11px}.box{border:1px solid #E5E7EB;border-radius:13px;padding:13px 15px;break-inside:avoid}.box h3{margin:0 0 6px;color:#1E293F;font-size:14px}.f1{border-top:4px solid #A11C27}.f2{border-top:4px solid #B5A573}.f3{border-top:4px solid #1E293F}.f4{border-top:4px solid #8B5E66}ul{margin:4px 0;padding-left:18px}li{margin:5px 0}.point{border:1px solid #E5E7EB;border-radius:13px;padding:14px 16px;margin:9px 0;break-inside:avoid}.point>b{display:block;color:#1E293F;margin-bottom:5px}.point div{margin:3px 0}.good{border-left:5px solid #B5A573;background:#FCFBF7}.care{border-left:5px solid #A11C27;background:#FFF8F8}.actions{counter-reset:n;list-style:none;padding:0}.actions li{counter-increment:n;display:flex;gap:9px}.actions li:before{content:counter(n);background:#1E293F;color:#fff;font-weight:800;min-width:23px;height:23px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px}.end{background:#1E293F;color:#fff;border-radius:14px;padding:16px 18px}.empty{font-size:12px;color:#64748B;font-style:italic}.foot{border-top:1px solid #E5E7EB;margin-top:28px;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#64748B}.internal{color:#A11C27;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
  </style><div class="csr"><div class="head"><div><img class="logo" src="/logo-consulmax.png"><div class="kicker">Qualidade Comercial • Sucesso do Cliente</div><h1>Relatório da Venda</h1><div class="small">Análise pós-venda para desenvolvimento comercial</div></div><div class="meta small"><b>${esc(fmtDateTime(r.gerado_em))}</b><br>Gerado por ${esc(r.gerado_por || "CRM Consulmax")}</div></div>
  <div class="sale"><div><div class="lab">Cliente</div><div class="val">${esc(nome)}</div></div><div><div class="lab">Vendedor</div><div class="val">${esc(item.vendedor_nome)}</div></div><div><div class="lab">Data da venda</div><div class="val">${esc(fmtDate(item.venda.data_venda))}</div></div><div><div class="lab">Administradora</div><div class="val">${esc(item.venda.administradora||"—")}</div></div><div><div class="lab">Grupo / Cota</div><div class="val">${esc(`${item.venda.grupo||"—"} / ${item.venda.cota||"—"}`)}</div></div><div><div class="lab">Crédito / Venda</div><div class="val">${esc(fmtMoney(item.venda.valor_venda))}</div></div></div>
  <div class="sec"><div class="title">Resumo executivo</div><div class="summary">${esc(r.resumo_executivo)}</div></div><div class="sec"><div class="title">O que o cliente nos transmitiu</div><div class="voice">“${esc(r.voz_do_cliente)}”</div></div>
  <div class="sec"><div class="title">Análise FOFA da venda</div><div class="fofa"><div class="box f1"><h3>Forças</h3>${ul(r.fofa?.forcas)}</div><div class="box f2"><h3>Oportunidades</h3>${ul(r.fofa?.oportunidades)}</div><div class="box f3"><h3>Fraquezas</h3>${ul(r.fofa?.fraquezas)}</div><div class="box f4"><h3>Ameaças</h3>${ul(r.fofa?.ameacas)}</div></div></div>
  <div class="sec"><div class="title">Pontos fortes — comportamentos a reforçar</div>${fortes}</div><div class="sec"><div class="title">Pontos de atenção — como evoluir</div>${atencao}</div>
  <div class="sec"><div class="title">Ações recomendadas</div><ol class="actions">${(r.acoes_recomendadas||[]).map(x=>`<li><span>${esc(x)}</span></li>`).join("")}</ol></div><div class="end"><b>Conclusão da análise</b><br>${esc(r.conclusao)}</div><div class="foot"><span class="internal">Uso interno Consulmax</span><span>Gerado a partir das informações registradas no Sucesso do Cliente.</span></div></div>`
  document.body.appendChild(root)
  try {
    if ((document as any).fonts?.ready) await (document as any).fonts.ready
    const imgs = Array.from(root.querySelectorAll("img"))
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{img.onload=()=>resolve();img.onerror=()=>resolve()})))
    const canvas = await html2canvas(root.querySelector(".csr") as HTMLElement,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false})
    const doc = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"}), pagePx=Math.floor(canvas.width*(297/210))
    let y=0,page=0
    while(y<canvas.height){const h=Math.min(pagePx,canvas.height-y),slice=document.createElement("canvas");slice.width=canvas.width;slice.height=h;const ctx=slice.getContext("2d");if(!ctx)throw new Error("Não foi possível preparar o PDF.");ctx.fillStyle="#fff";ctx.fillRect(0,0,slice.width,slice.height);ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);if(page++)doc.addPage();doc.addImage(slice.toDataURL("image/jpeg",.95),"JPEG",0,0,210,(h/canvas.width)*210,undefined,"FAST");y+=h}
    doc.save(`relatorio-sucesso-cliente-${fileSafe(nome)}-${String(item.venda.data_venda||"venda")}.pdf`)
  } finally { root.remove() }
}
