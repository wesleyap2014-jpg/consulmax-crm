import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

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
