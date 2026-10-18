import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, supabaseAdmin } from "./_supabase";
const slugs = /^[a-z0-9][a-z0-9-]{2,59}$/;
const choices = ["Aquisição de Imóvel","Aquisição de Automóvel","Aposentadoria com Consórcio","Garantir o Futuro dos Filhos","Alavancagem Financeira","Alavancagem Patrimonial","Capital de Giro"];
const digits = (v: unknown) => String(v || "").replace(/\D/g,"");
const publicSite = (site: any, owner: any) => ({ slug:site.slug, nome:owner.nome, foto:owner.avatar_url || owner.photo_url || null, cidade:owner.cidade || null, uf:owner.uf || null, headline:site.headline, sobre_mim:site.sobre_mim, especialidades:site.especialidades, whatsapp:site.whatsapp || owner.telefone || owner.phone || null, instagram:site.instagram, linkedin:site.linkedin });
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
 if(req.method==="POST" && slug){
   if(!slugs.test(slug)) return res.status(404).json({error:"Página não encontrada"});
   if(String(req.body?.website || "")) return res.status(200).json({ok:true});
   const nome=String(req.body?.nome||"").trim().slice(0,120);
   const telefone=digits(req.body?.telefone).slice(0,15);
   const objetivo=String(req.body?.objetivo||"").trim().slice(0,80);
   const valor=Number(req.body?.valor_desejado||0);
   if(nome.length<3 || telefone.length<10 || telefone.length>15 || !choices.includes(objetivo) || !Number.isFinite(valor) || valor<0 || valor>1000000000 || req.body?.consentimento !== true)
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
   const {error:submitError}=await supabaseAdmin.from("consultor_site_submissions").insert({user_id:owner.id,lead_id:leadId,nome,telefone,objetivo,valor_desejado:valor||null,origem_pagina:slug});
   if(submitError) {console.error("[consultor-site] submission",submitError);return res.status(500).json({error:"Falha ao registrar solicitação"});}
   return res.status(200).json({ok:true});
 }
 const me=await ownUser(req);
 if(!me) return res.status(401).json({error:"Não autorizado"});
 if(req.method==="GET"){
   const {data:site,error}=await supabaseAdmin.from("consultor_sites").select("*").eq("user_id",me.id).maybeSingle();
   if(error) return res.status(500).json({error:"Erro ao carregar site"});
   const {count}=await supabaseAdmin.from("consultor_site_submissions").select("id",{count:"exact",head:true}).eq("user_id",me.id);
   return res.status(200).json({site,consultas:count||0,owner:{nome:me.nome,foto:me.avatar_url||me.photo_url}});
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
