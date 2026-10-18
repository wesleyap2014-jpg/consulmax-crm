import { sendTransactionalEmail } from "./_email-smtp.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, supabaseAdmin } from "./_supabase";
const slugs = /^[a-z0-9][a-z0-9-]{2,59}$/;
const choices = ["Aquisição de Imóvel","Aquisição de Automóvel","Aposentadoria com Consórcio","Garantir o Futuro dos Filhos","Alavancagem Financeira","Alavancagem Patrimonial","Capital de Giro"];
const objetivos = ["Imóveis","Veículos","Agro","Máquinas e equipamentos","Serviços","Planejamento patrimonial","Investimentos"];
const digits = (v: unknown) => String(v || "").replace(/\D/g,"");

const META_GRAPH = "https://graph.facebook.com/v21.0";
const TEMPLATE_NAME = "novo_lead_site_comercial";
function formatCurrency(value: number) {
 return value > 0 ? new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value) : "Não informado";
}
async function notifyConsultorWhatsApp(recipient: {nome:string;telefone?:string|null;phone?:string|null;is_active:boolean}, lead: {nome:string;objetivo:string;valor:number}) {
 const token = process.env.META_WHATSAPP_TOKEN;
 const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
 const wabaId = process.env.META_WHATSAPP_WABA_ID || process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
 const rawNumber = digits(recipient.telefone || recipient.phone);
 const to = rawNumber.length === 11 ? "55" + rawNumber : rawNumber;
 if(!recipient.is_active || !/^\d{12,15}$/.test(to)) return {status:"skipped",detail:"Número do vendedor ausente ou inválido"};
 if(!token || !phoneId) return {status:"skipped",detail:"Configuração da Meta incompleta"};
 let resolvedWabaId=wabaId;
 if(!resolvedWabaId){
   const info=await fetch(META_GRAPH+"/"+phoneId+"?fields=whatsapp_business_account",{headers:{Authorization:"Bearer "+token}});
   const body=await info.json();
   resolvedWabaId=String(body?.whatsapp_business_account?.id||"");
 }
 if(!resolvedWabaId) return {status:"skipped",detail:"Conta WhatsApp Business não localizada"};
 const query = new URL(META_GRAPH + "/" + resolvedWabaId + "/message_templates");
 query.searchParams.set("fields","name,language,status,components");
 query.searchParams.set("limit","250");
 const definitionResponse = await fetch(query.toString(),{headers:{Authorization:"Bearer "+token}});
 const definition = await definitionResponse.json();
 if(!definitionResponse.ok) throw new Error("Falha ao consultar modelos aprovados na Meta");
 const template = (definition.data || []).find((m:any)=>m.name===TEMPLATE_NAME && m.language==="pt_BR" && m.status==="APPROVED");
 if(!template) return {status:"skipped",detail:"Modelo não encontrado como aprovado em pt_BR"};
 const body = (template.components || []).find((c:any)=>String(c.type).toUpperCase()==="BODY");
 const variables = [...String(body?.text || "").matchAll(/{{\s*([^}]+)\s*}}/g)];
 if(variables.length!==4) return {status:"skipped",detail:"O modelo aprovado não possui exatamente quatro variáveis no corpo"};
 const texts = [String(recipient.nome || "Consultor").trim().split(/\s+/)[0], lead.nome, lead.objetivo, formatCurrency(lead.valor)];
 const parameters = variables.map((match:any,i:number)=>{
   const p:any={type:"text",text:texts[i]};
   if(isNaN(Number(match[1]))) p.parameter_name=String(match[1]).trim();
   return p;
 });
 const response = await fetch(META_GRAPH+"/"+phoneId+"/messages",{
   method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({messaging_product:"whatsapp",to,type:"template",template:{name:TEMPLATE_NAME,language:{code:"pt_BR"},components:[{type:"body",parameters}]}})
 });
 const result = await response.json();
 if(!response.ok) throw new Error("Meta WhatsApp: "+JSON.stringify(result?.error || result).slice(0,300));
 return {status:"sent",messageId:String(result.messages?.[0]?.id || "")};
}

const publicSite = (site: any, owner: any) => ({ slug:site.slug, nome:owner.nome, foto:owner.avatar_url || owner.photo_url || null, cidade:owner.cidade || null, uf:owner.uf || null, headline:site.headline, sobre_mim:site.sobre_mim, especialidades:(site.especialidades || []).filter((item: string) => choices.includes(item)), whatsapp:site.whatsapp || owner.telefone || owner.phone || null, instagram:site.instagram, linkedin:site.linkedin });
async function ownUser(req: VercelRequest) {
 const {user}=await getAuthUser(req); if(!user) return null;
 const {data}=await supabaseAdmin.from("users").select("id,auth_user_id,nome,email,is_active,avatar_url,photo_url,telefone,phone,role").eq("auth_user_id",user.id).maybeSingle();
 return data?.is_active === true ? data : null;
}
export default async function handler(req: VercelRequest,res: VercelResponse){
 const slug=String(req.query.slug || "").trim().toLowerCase();
 if(req.method==="GET" && slug){
   if(!slugs.test(slug)) return res.status(404).json({error:"Página não encontrada"});
   const {data:site}=await supabaseAdmin.from("consultor_sites").select("*").eq("slug",slug).eq("publicado",true).maybeSingle();
   if(!site) return res.status(404).json({error:"Página indisponível"});
   const {data:owner}=await supabaseAdmin.from("users").select("id,nome,avatar_url,photo_url,cidade,uf,telefone,phone,is_active").eq("id",site.user_id).eq("is_active",true).maybeSingle();
   if(!owner) return res.status(404).json({error:"Página indisponível"});
   return res.status(200).json({site:publicSite(site,owner)});
 }
 if(req.method==="POST" && slug && req.body?.action==="visit"){
   const token=String(req.body?.visitorToken||"");
   if(!/^[a-zA-Z0-9_-]{20,100}$/.test(token)) return res.status(400).json({error:"Visita inválida"});
   const {data:site}=await supabaseAdmin.from("consultor_sites").select("user_id").eq("slug",slug).eq("publicado",true).maybeSingle();
   if(!site) return res.status(404).json({error:"Página indisponível"});
   const {data:owner}=await supabaseAdmin.from("users").select("is_active").eq("id",site.user_id).maybeSingle();
   if(!owner?.is_active) return res.status(404).json({error:"Página indisponível"});
   await supabaseAdmin.from("consultor_site_visits").upsert({user_id:site.user_id,visitor_token:token,visited_on:new Date().toISOString().slice(0,10)},{onConflict:"user_id,visitor_token,visited_on",ignoreDuplicates:true});
   return res.status(200).json({ok:true});
 }
 if(req.method==="POST" && slug){
   if(!slugs.test(slug)) return res.status(404).json({error:"Página não encontrada"});
   if(String(req.body?.website || "")) return res.status(200).json({ok:true});
   const nome=String(req.body?.nome||"").trim().slice(0,120);
   const telefone=digits(req.body?.telefone).slice(0,15);
   const objetivo=String(req.body?.objetivo||"").trim().slice(0,80);
   const valor=Number(req.body?.valor_desejado||0);
   if(nome.length<3 || telefone.length<10 || telefone.length>15 || !objetivos.includes(objetivo) || !Number.isFinite(valor) || valor<0 || valor>1000000000 || req.body?.consentimento !== true)
     return res.status(400).json({error:"Confira os dados e o consentimento."});
   const {data:site}=await supabaseAdmin.from("consultor_sites").select("user_id").eq("slug",slug).eq("publicado",true).maybeSingle();
   if(!site) return res.status(404).json({error:"Página indisponível"});
   const {data:owner}=await supabaseAdmin.from("users").select("id,auth_user_id,is_active").eq("id",site.user_id).eq("is_active",true).maybeSingle();
   if(!owner) return res.status(404).json({error:"Página indisponível"});
   const since=new Date(Date.now()-60*60*1000).toISOString();
   const {count, error:rateError}=await supabaseAdmin.from("consultor_site_submissions").select("id",{count:"exact",head:true}).eq("user_id",owner.id).eq("telefone",telefone).gte("created_at",since);
   if(rateError) return res.status(503).json({error:"Tente novamente em instantes."});
   if((count||0)>0) return res.status(200).json({ok:true});
   // Checa clientes existentes por telefone, sem sobrescrever responsável nem duplicar lead.
   const {data:existing,error:existingError}=await supabaseAdmin.from("leads").select("id,owner_id").eq("telefone",telefone).limit(1);
   if(existingError) throw existingError;
   let leadId=existing?.[0]?.id;
   if(!leadId){
     const {data:lead,error:leadError}=await supabaseAdmin.from("leads").insert({nome,telefone,origem:"Site Comercial",descricao:`Objetivo: ${objetivo}; crédito desejado: ${valor||"não informado"}; origem: /c/${slug}`,owner_id:owner.auth_user_id}).select("id").single();
     if(leadError) {console.error("[consultor-site] lead",leadError);return res.status(500).json({error:"Falha ao registrar solicitação"});}
     leadId=lead.id;
   }
   const {data:opp,error:oppError}=await supabaseAdmin.from("opportunities").insert({
     lead_id:leadId,vendedor_id:owner.auth_user_id,owner_id:owner.auth_user_id,
     estagio:"Novo",stage:"novo",segmento:objetivo,valor_credito:valor||0,
     credito_desejado:valor||null,
     observacao:"Nova solicitação recebida pelo Meu Site Comercial (/c/"+slug+")."
   }).select("id").single();
   if(oppError) {console.error("[consultor-site] opportunity",oppError);return res.status(500).json({error:"Falha ao criar oportunidade"});}
   const {error:submitError}=await supabaseAdmin.from("consultor_site_submissions").insert({user_id:owner.id,lead_id:leadId,opportunity_id:opp.id,nome,telefone,objetivo,valor_desejado:valor||null,origem_pagina:slug});
   if(submitError) {console.error("[consultor-site] submission",submitError);return res.status(500).json({error:"Falha ao registrar solicitação"});}
   const {data:recipient}=await supabaseAdmin.from("users").select("email,nome,telefone,phone,is_active").eq("id",owner.id).maybeSingle();
   if(recipient?.is_active && recipient.email) {
     try {
       await sendTransactionalEmail({
         to:recipient.email,fromName:"Consulmax | Novo Lead",
         subject:"Novo lead pelo seu Site Comercial — "+nome,
         html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:25px;color:#1E293F"><h2 style="color:#A11C27">Você recebeu uma nova oportunidade!</h2><p>Um visitante preencheu seu Site Comercial.</p><p><b>Nome:</b> '+nome.replace(/[&<>"]/g,"")+'</p><p><b>Objetivo:</b> '+objetivo+'</p><p><a href="https://crm.consulmaxconsorcios.com.br/oportunidades">Abrir oportunidades no CRM</a></p></div>',
         text:"Novo lead no Site Comercial. Cliente: "+nome+"; objetivo: "+objetivo+". https://crm.consulmaxconsorcios.com.br/oportunidades"
       });
     } catch(mailError) {console.warn("[consultor-site] notification email failed",mailError);}
   }
   if(recipient?.is_active){
     try {
       const waStatus = await notifyConsultorWhatsApp(recipient,{nome,objetivo,valor});
       console.info("[consultor-site] WhatsApp template notification",waStatus);
     } catch(waError) {console.warn("[consultor-site] WhatsApp notification failed",waError);}
   }
   return res.status(200).json({ok:true});
 }
 const me=await ownUser(req);
 if(!me) return res.status(401).json({error:"Não autorizado"});
 if(req.method==="GET"){
   const {data:site,error}=await supabaseAdmin.from("consultor_sites").select("*").eq("user_id",me.id).maybeSingle();
   if(error) return res.status(500).json({error:"Erro ao carregar site"});
   const [{count},{count:visits},{data:submissions}] = await Promise.all([
     supabaseAdmin.from("consultor_site_submissions").select("id",{count:"exact",head:true}).eq("user_id",me.id),
     supabaseAdmin.from("consultor_site_visits").select("id",{count:"exact",head:true}).eq("user_id",me.id),
     supabaseAdmin.from("consultor_site_submissions").select("id,nome,objetivo,created_at,opportunity_id").eq("user_id",me.id).order("created_at",{ascending:false}).limit(1000)
   ]);
   const opportunityIds=(submissions||[]).map(x=>x.opportunity_id).filter(Boolean);
   const opps:any[]=[];
   for(let i=0;i<opportunityIds.length;i+=200){
     const {data}=await supabaseAdmin.from("opportunities").select("id,stage,estagio,won_at").in("id",opportunityIds.slice(i,i+200));
     opps.push(...(data||[]));
   }
   const wins=opps.filter(o=>o.won_at || ["ganho","fechado (ganho)"].includes(String(o.estagio||"").toLowerCase())).length;
   return res.status(200).json({site,consultas:count||0,visitas:visits||0,vendas:wins,ultimosLeads:(submissions||[]).slice(0,10),owner:{nome:me.nome,foto:me.avatar_url||me.photo_url}});
 }
 if(req.method==="PUT"){
   const value=req.body||{};
   const slugValue=String(value.slug||"").toLowerCase().trim();
   if(!slugs.test(slugValue)) return res.status(400).json({error:"Link deve ter 3 a 60 caracteres, usando letras minúsculas, números e hífens."});
   const special=Array.isArray(value.especialidades) ? value.especialidades.filter((v:any)=>choices.includes(v)).slice(0,7) : [];
   const payload={user_id:me.id,slug:slugValue,headline:String(value.headline||"").trim().slice(0,180),sobre_mim:String(value.sobre_mim||"").trim().slice(0,1600),especialidades:special,whatsapp:digits(value.whatsapp).slice(0,15),instagram:String(value.instagram||"").trim().slice(0,150),linkedin:String(value.linkedin||"").trim().slice(0,200),publicado:value.publicado===true,updated_at:new Date().toISOString()};
   const {data,error}=await supabaseAdmin.from("consultor_sites").upsert(payload,{onConflict:"user_id"}).select("*").single();
   if(error) return res.status(error.code==="23505"?409:500).json({error:error.code==="23505"?"Este link já pertence a outro consultor.":"Não foi possível salvar."});
   return res.status(200).json({site:data});
 }
 return res.status(405).json({error:"Método inválido"});
}
