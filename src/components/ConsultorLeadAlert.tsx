import React,{useEffect,useState} from "react";
import {supabase} from "@/lib/supabaseClient";
import {BellRing,X,ExternalLink} from "lucide-react";

type LeadNotice={id:string;nome:string;objetivo:string;created_at:string;opportunity_id:string|null};
export default function ConsultorLeadAlert(){
 const[notice,setNotice]=useState<LeadNotice|null>(null);
 useEffect(()=>{
   let cancelled=false;
   let timer:number|undefined;
   async function check(){
     try{
       const {data:session}=await supabase.auth.getSession();
       if(!session.session)return;
       const user=session.session.user;
       const key="cmx-consultor-site-alert-seen-"+user.id;
       const result=await fetch("/api/consultor-site",{headers:{Authorization:"Bearer "+session.session.access_token}});
       if(!result.ok)return;
       const payload=await result.json();
       const latest=(payload.ultimosLeads||[]).filter((x:LeadNotice)=>Boolean(x.opportunity_id))[0] as LeadNotice|undefined;
       if(!latest||cancelled)return;
       const last=localStorage.getItem(key);
       const floor=last||new Date(Date.now()-24*3600000).toISOString();
       if(latest.created_at<=floor)return;
       localStorage.setItem(key,latest.created_at);
       setNotice(latest);
       if(timer)window.clearTimeout(timer);
       timer=window.setTimeout(()=>setNotice(null),18000);
     }catch(error){console.warn("[consultor-site] alerta de captação indisponível",error);}
   }
   void check();
   const polling=window.setInterval(()=>void check(),60000);
   return()=>{cancelled=true;window.clearInterval(polling);if(timer)window.clearTimeout(timer);};
 },[]);
 if(!notice)return null;
 return <div role="status" className="fixed right-4 top-20 z-[100] w-[min(390px,calc(100vw-32px))] rounded-2xl border border-[#B5A573]/60 bg-white p-4 shadow-2xl">
   <div className="flex items-start gap-3"><div className="rounded-xl bg-[#A11C27]/10 p-2 text-[#A11C27]"><BellRing size={22}/></div><div className="min-w-0 flex-1">
    <h2 className="font-bold text-[#1E293F]">Novo lead pelo seu Site Comercial!</h2>
    <p className="mt-1 break-words text-sm text-slate-700">{notice.nome} • {notice.objetivo}</p>
    <a href="/oportunidades" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#A11C27]">Ver em Oportunidades <ExternalLink size={14}/></a>
   </div><button type="button" aria-label="Dispensar aviso" onClick={()=>setNotice(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={17}/></button></div>
 </div>;
}
