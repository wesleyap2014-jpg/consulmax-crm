import{supabase}from"@/lib/supabaseClient";import{CS_START_DATE,ClientRow,LeadRow,SaleRow,WorkItem,CsRecord,normalizeCs,parsePayload,serializePayload}from"./customerSuccessModel";
export async function loadCustomerSuccess():Promise<WorkItem[]>{
 const{data:sales,error:e1}=await supabase.from("vendas").select("id,lead_id,data_venda,vendedor_id,administradora,grupo,cota,valor_venda,numero_proposta,telefone,cancelada_em").gte("data_venda",CS_START_DATE).is("cancelada_em",null).not("lead_id","is",null).order("data_venda",{ascending:false}).range(0,5000);if(e1)throw e1;
 const rows=(sales||[])as any as SaleRow[],lids=[...new Set(rows.map(x=>String(x.lead_id||"")).filter(Boolean))],vids=[...new Set(rows.map(x=>String(x.vendedor_id||"")).filter(Boolean))];
 const leads=new Map<string,LeadRow>(),clients=new Map<string,ClientRow>(),vendors=new Map<string,string>();
 if(lids.length){const{data,error}=await supabase.from("leads").select("id,nome,telefone,email").in("id",lids);if(error)throw error;(data||[]).forEach((x:any)=>leads.set(String(x.id),x));}
 if(lids.length){const{data,error}=await supabase.from("clientes").select("id,lead_id,nome,telefone,email,observacoes").in("lead_id",lids);if(error)throw error;(data||[]).forEach((x:any)=>x.lead_id&&clients.set(String(x.lead_id),x));}
 if(vids.length){const{data,error}=await supabase.from("users").select("auth_user_id,nome").in("auth_user_id",vids);if(error)throw error;(data||[]).forEach((x:any)=>vendors.set(String(x.auth_user_id),String(x.nome||"—")));}
 return rows.map(v=>{const lid=String(v.lead_id||""),cliente=clients.get(lid)||null,p=parsePayload(cliente?.observacoes),map=p.customer_success_by_venda||{};return{venda:v,lead:leads.get(lid)||null,cliente,vendedor_nome:vendors.get(String(v.vendedor_id||""))||"—",cs:normalizeCs(map[v.id])}});
}
export async function saveCustomerSuccess(item:WorkItem,record:CsRecord){
 if(!item.cliente?.id)throw new Error("Confirme o cadastro do cliente antes de iniciar o Sucesso do Cliente.");
 const{data,error}=await supabase.from("clientes").select("observacoes").eq("id",item.cliente.id).maybeSingle();if(error)throw error;
 const p=parsePayload((data as any)?.observacoes),map=p.customer_success_by_venda||{};p.customer_success_by_venda={...map,[item.venda.id]:record};
 const{error:e2}=await supabase.from("clientes").update({observacoes:serializePayload(p)}).eq("id",item.cliente.id);if(e2)throw e2;
}
