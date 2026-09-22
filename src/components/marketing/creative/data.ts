import { supabase } from '@/lib/supabaseClient';
import type { Data, Event, Item } from './model';
export const PREFIX='marketing_creative_';
export async function rows<T>(table:string,select='*'):Promise<T[]> {
 const all:T[]=[];
 for(let page=0;;page++){
  const {data,error}=await supabase.from(table).select(select).order('id').range(page*1000,page*1000+999);
  if(error)throw error; all.push(...(data||[]) as T[]); if((data||[]).length<1000)break;
 }
 return all;
}
export async function loadData():Promise<Data>{
 const [strategies,topics,items,sessions,distributions,users,campaigns]=await Promise.all([
 rows<Data['strategies'][number]>(PREFIX+'strategies'),rows<Data['topics'][number]>(PREFIX+'topics'),rows<Item>(PREFIX+'items'),
 rows<Data['sessions'][number]>(PREFIX+'sessions'),rows<Data['distributions'][number]>(PREFIX+'distributions'),
 rows<Data['users'][number]>('users','id,nome,auth_user_id'),rows<Data['campaigns'][number]>('marketing_campaigns','id,name')]);
 return {strategies,topics,items,sessions,distributions,users,campaigns};
}
export async function save<T>(table:string,payload:object,id?:string,revision?:number):Promise<T>{
 let query=id ? supabase.from(PREFIX+table).update(payload).eq('id',id) : supabase.from(PREFIX+table).insert(payload);
 if(id&&revision!==undefined)query=query.eq('revision',revision);
 const {data,error}=await query.select('*').maybeSingle();
 if(error)throw new Error(error.message);
 if(!data)throw new Error('Este registro foi atualizado por outra pessoa. Feche, atualize a esteira e abra novamente antes de salvar.');
 return data as T;
}
export async function loadEvents(item:Item,topicId:string,strategyId:string):Promise<Event[]>{
 const ids=[item.id,topicId,strategyId,item.session_id].filter(Boolean);
 const all:Event[]=[];
 for(let page=0;;page++){
  const {data,error}=await supabase.from(PREFIX+'events').select('*').or(`item_id.eq.${item.id},entity_id.in.(${ids.join(',')})`).order('created_at',{ascending:false}).order('id').range(page*500,page*500+499);
  if(error)throw error; all.push(...(data||[])); if((data||[]).length<500)break;
 }
 return all;
}
export async function maxRequest(body:object){
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw new Error('Sua sessão expirou. Entre novamente no CRM.');
 const response=await fetch('/api/marketing/creative-max',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const result=await response.json();
 if(!response.ok||!result.ok)throw new Error(result.message||'Não foi possível consultar o MAX.');
 return result;
}
