import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const ZONE = 'America/Porto_Velho';
export const STAGES = [
  ['estrategia', 'Estratégia'], ['pautas', 'Pautas'], ['formatos', 'Formatos'],
  ['calendario', 'Calendário'], ['roteiro', 'Roteiro/Copy'], ['gravacao', 'Gravação'],
  ['producao', 'Produção Criativa'], ['aprovacao', 'Aprovação'], ['publicacao', 'Publicação'],
  ['distribuicao', 'Distribuição'], ['analise', 'Análise'],
] as const;
export type Stage = typeof STAGES[number][0];
export const OBJECTIVES = ['Gerar autoridade','Aumentar leads','Gerar oportunidades comerciais','Divulgar estratégia específica','Reforçar marca','Vender produto','Vender estratégia','Responder objeção','Educação de mercado','Feriado/Data comemorativa','Divulgar campanha','Evento','Treinamento','Relacionamento','Engajamento','Outro'];
export const AUDIENCES = ['Empresários','Médicos','Advogados','Dentistas','Produtores rurais','Transportadoras','Investidores','Alta renda','Pessoa Física','Pessoa Jurídica','Parceiros','Vendedores','Base de clientes','Outro'];
export const PRODUCTS = ['Consórcio Imobiliário','Automóveis','Pesados','Máquinas','Alavancagem Patrimonial','Alavancagem Otimizada','Alavancagem Financeira','Construção Patrimonial','Carta Contemplada','Capital de Giro','Outro'];
export const FUNNELS = ['Descoberta','Autoridade','Educação','Consideração','Engajamento','Conversão','Relacionamento','Retenção'];
export const SOURCES = ['Ideia interna','Comercial','Dúvida de cliente','Objeção de cliente','Tendência','Concorrência','Radar','Pesquisa','Comentário','Pergunta frequente','Campanha','Evento','Data comemorativa','IA','Outro'];
export const HERO = { HERO: 'Grandes ideias, cases e campanhas para gerar impacto e alcance.', HUB: 'Conteúdos recorrentes que sustentam relacionamento e posicionamento.', HELP: 'Respostas práticas a dúvidas, objeções e problemas do público.' };
export const PURPOSE = { Marca: 'Percepção, autoridade, identidade, cultura e confiança.', Demanda: 'Dores, desejos e oportunidades que despertam uma necessidade.', Comercial: 'Produtos, estratégias, ofertas e chamadas comerciais diretas.' };
export const FORMATS: Record<string, string[]> = {
  Instagram:['Reels','Carrossel','Post estático','Stories','Live'], LinkedIn:['Post','Carrossel','Artigo','Vídeo'],
  WhatsApp:['Status','Mensagem','Lista de transmissão','Material comercial'], YouTube:['Shorts','Vídeo','Podcast/entrevista'],
  TikTok:['Vídeo'], Outros:['E-mail','Blog','Material comercial','Apresentação','Treinamento','Outro'],
};
export const CTA_TYPES = ['Comentário','Compartilhamento','Salvamento','Direct','WhatsApp','Lead','Comercial','Sem CTA','Outro'];
export const PRODUCTION_TYPES = ['Design','Edição de vídeo','Motion','Thumbnail','Tratamento de imagem','Legendas','Áudio','B-roll','Copy final'];
export const APPROVAL_CHECKS = ['Copy','Ortografia','Valores','Informações técnicas','Identidade visual','Marca','CTA','Thumbnail','Legenda','Informações regulatórias','Links'];
export const DISTRIBUTION_CHANNELS = ['Instagram Feed','Stories','WhatsApp Status','WhatsApp Parceiros','WhatsApp Clientes','LinkedIn','TikTok','YouTube','E-mail','Comercial','Equipe interna'];
export const METRICS: Record<string,string> = { views:'Visualizações', reach:'Alcance', retention:'Retenção (%)', avg_watch_time:'Tempo médio assistido (s)', likes:'Curtidas', comments:'Comentários', shares:'Compartilhamentos', saves:'Salvamentos', followers:'Seguidores gerados', profile_visits:'Visitas ao perfil', clicks:'Cliques', leads:'Leads', conversations:'Conversas iniciadas', proposals:'Propostas geradas', sales:'Vendas relacionadas', revenue:'Receita influenciada (R$)' };
export const QUESTIONS: Record<string,string> = { hook:'O gancho funcionou?', retention:'O conteúdo reteve?', shares:'Gerou compartilhamentos?', conversations:'Gerou conversas?', cta:'O CTA funcionou?', objections:'Houve objeções nos comentários?', learning:'Qual aprendizado tivemos?', repeat:'Vale repetir o tema?', repurpose:'Vale transformar em outro formato?' };
export const RESULTS = ['Excelente','Acima da média','Dentro da média','Abaixo da média','Fraco'];
export type User = { id:string; nome:string; auth_user_id?:string };
export type Mix = { mode:'percent'|'quantity'; [key:string]:string|number };
export type Strategy = { id:string; title:string; kind:string; start_date:string; end_date:string; owner_id:string|null; campaign_id:string|null; status:string; primary_objective:string; secondary_objectives:string[]; audiences:string[]; focus_products:string[]; message:string; editorial_mix:Mix; purpose_mix:Mix; kpis:string[]; planned_count:number; revision:number; created_at:string };
export type Topic = { id:string; strategy_id:string; title:string; idea:string; problem:string; audiences:string[]; objective:string; product:string; pillar:string; angle:string; hook:string; message:string; cta:string; refs:string; notes:string; hero:keyof typeof HERO; purpose:keyof typeof PURPOSE; funnel:string; source:string; source_item_id:string|null; source_learning:string; revision:number; created_at:string };
export type Take = { number:number; function:string; format:string; scene:string; on_screen:string; on_screen_at:string; speech:string; broll:string; notes:string };
export type Asset = { path:string; name:string; size:number; type:string };
export type Script = { completed:boolean; takes:Take[]; cards:{title:string;text:string;visual:string}[]; headline:string; art_text:string; visual:string; caption:string; cta_type:string; cta:string; thumbnail:Record<string,string> };
export type Production = { status:string; types:string[]; owner_id:string; started_at:string; deadline:string; priority:string; brief:string; refs:string; canva:string; drive:string; final_url:string; version:string; files:Asset[] };
export type Approval = { status:string; checklist:Record<string,boolean>; comment:string; by?:string; at?:string; version?:number; special_reviewer?:string };
export type Item = { id:string; code:number; topic_id:string; title:string; channel:string; format:string; duration_seconds:number; aspect_ratio:string; units:number; cta:string; owner_id:string|null; needs_recording:boolean; needs_design:boolean; needs_editing:boolean; needs_special_approval:boolean; stage:Stage; scheduled_at:string|null; due_at:string|null; published_at:string|null; session_id:string|null; priority:string; script:Script; recording:Record<string,string|boolean>; production:Production; approval:Approval; publication:Record<string,string>; metrics:Record<string,number|null>; qualitative:Record<string,string>; result:string|null; analysis_status:string; revision:number; creative_version:number; created_at:string };
export type Session = { id:string; title:string; scheduled_at:string; location:string; owner_id:string|null; presenter:string; videomaker:string; equipment:string; notes:string; revision:number; created_at:string };
export type Distribution = { id:string; item_id:string; title:string; channel:string; owner_id:string|null; due_at:string|null; status:string; adaptation:string; revision:number };
export type Event = { id:string; entity_table:string; entity_id:string; item_id:string|null; kind:string; actor_id:string|null; created_at:string; before_data:Record<string,unknown>|null; after_data:Record<string,unknown>|null; comment:string|null };
export type Data = { strategies:Strategy[]; topics:Topic[]; items:Item[]; sessions:Session[]; distributions:Distribution[]; users:User[]; campaigns:{id:string;name:string}[] };
export const EMPTY_DATA:Data = { strategies:[],topics:[],items:[],sessions:[],distributions:[],users:[],campaigns:[] };
export const defaultScript = ():Script => ({ completed:false, takes:['Convite','Acordo','Mensagem 1','Mensagem 2','Mensagem 3','Conclusão'].map((fn,i)=>({number:i+1,function:fn,format:'Falando para a câmera',scene:'',on_screen:'',on_screen_at:'',speech:'',broll:'',notes:''})), cards:[{title:'Capa',text:'',visual:''},{title:'Desenvolvimento',text:'',visual:''},{title:'CTA',text:'',visual:''}], headline:'',art_text:'',visual:'',caption:'',cta_type:'Sem CTA',cta:'',thumbnail:{} });
export const defaultProduction = ():Production => ({status:'Aguardando produção',types:[],owner_id:'',started_at:'',deadline:'',priority:'Normal',brief:'',refs:'',canva:'',drive:'',final_url:'',version:'1',files:[]});
export const isVideo = (format:string) => ['Reels','Vídeo','Shorts','Live','Podcast/entrevista'].includes(format);
export const codeLabel = (item:Pick<Item,'code'>) => `EC-${String(item.code).padStart(5,'0')}`;
export const stageLabel = (stage:string) => STAGES.find(x=>x[0]===stage)?.[1] || stage;
export const localDate = (iso?:string|null) => iso ? formatInTimeZone(new Date(iso),ZONE,'yyyy-MM-dd') : '';
export const localInput = (iso?:string|null) => iso ? formatInTimeZone(new Date(iso),ZONE,"yyyy-MM-dd'T'HH:mm") : '';
export const toISO = (value:string) => value ? fromZonedTime(value,ZONE).toISOString() : null;
export const today = () => localDate(new Date().toISOString());
export const brDate = (value?:string|null) => value ? new Intl.DateTimeFormat('pt-BR',{timeZone:ZONE,day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value.length===10 ? `${value}T12:00:00-04:00` : value)) : 'Sem data';
export const safeURL = (value?:string) => { try { const u=new URL(value||''); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export const hasAsset = (item:Item) => !!(safeURL(item.production.final_url) || safeURL(item.production.canva) || safeURL(item.production.drive) || item.production.files?.length);
export const overdue = (item:Item,now=Date.now()) => !item.published_at && item.publication.status!=='Cancelado' && !!(item.due_at||item.scheduled_at) && new Date(item.due_at||item.scheduled_at!).getTime()<now;
export function transitionError(item:Item,target:Stage):string|null {
 const from=STAGES.findIndex(x=>x[0]===item.stage), to=STAGES.findIndex(x=>x[0]===target);
 if(to<=from) return null;
 if(to>=4 && !item.scheduled_at) return 'Defina a data e o horário previstos no Calendário.';
 if(to>=5 && !item.script.completed) return 'Conclua o roteiro/copy antes de avançar.';
 if(to>=6 && item.needs_recording && item.recording.status!=='Gravado') return 'Marque a gravação como Gravado antes de iniciar a produção.';
 if(to>=7 && !hasAsset(item)) return 'Anexe um arquivo ou link da peça final antes da aprovação.';
 if(to>=8 && !(item.approval.status==='Aprovado' && item.approval.version===item.creative_version)) return 'Registre a aprovação da versão atual antes da publicação.';
 if(to>=9 && !item.published_at) return 'Registre a publicação antes de avançar para distribuição/análise.';
 return null;
}
export function weeklyWarnings(items:Item[],topics:Topic[]):string[] {
 const byTopic=new Map(topics.map(t=>[t.id,t])); const rows=items.map(i=>({i,t:byTopic.get(i.topic_id)}));
 if(!rows.length) return [];
 const alerts:string[]=[];
 if(rows.filter(x=>x.t?.purpose==='Comercial').length/rows.length>.4) alerts.push('Mais de 40% da semana é comercial. Avalie o mix.');
 if(!rows.some(x=>x.t?.purpose==='Marca')) alerts.push('A semana ainda não tem conteúdo de Marca.');
 for(const [name,get] of [['formato',(x:typeof rows[number])=>x.i.format],['produto',(x:typeof rows[number])=>x.t?.product],['pilar/tema',(x:typeof rows[number])=>x.t?.pillar]] as const){
  const counts=new Map<string,number>(); rows.forEach(x=>{const key=get(x);if(key)counts.set(key,(counts.get(key)||0)+1)});
  counts.forEach((n,key)=>{if(n>=3 && n/rows.length>.5)alerts.push(`Concentração em ${name}: ${key} (${n} conteúdos).`)});
 }
 const slots=new Set<string>(); rows.forEach(({i})=>{if(!i.scheduled_at)return; const key=`${i.channel}:${i.scheduled_at}`;if(slots.has(key))alerts.push(`Conflito: ${i.channel} tem publicações no mesmo horário.`);slots.add(key)});
 const titles=new Map<string,Set<string>>();rows.forEach(({t})=>{if(!t)return;const key=t.title.trim().toLocaleLowerCase('pt-BR');const ids=titles.get(key)||new Set<string>();ids.add(t.id);titles.set(key,ids)});
 titles.forEach((ids,title)=>{if(ids.size>1)alerts.push(`Pautas repetidas: “${title}”.`)});
 return [...new Set(alerts)];
}
export function produced(item:Item){return item.production.status==='Finalizado'||!!item.published_at||['aprovacao','publicacao','distribuicao','analise'].includes(item.stage)}
export function metricValue(item:Item,key:string){return item.metrics[key] == null ? null : Number(item.metrics[key])}
