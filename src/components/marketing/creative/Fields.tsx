import React, { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2 } from 'lucide-react';
import type { User } from './model';

export function Field({label,value,onChange,options,type='text',wide=false,required=false,hint,disabled=false,min,max}: {label:string;value:string|number;onChange:(v:string)=>void;options?:string[]|{value:string;label:string}[];type?:string;wide?:boolean;required?:boolean;hint?:string;disabled?:boolean;min?:number;max?:number}){
 const id=useId();const inputProps={id,value,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>onChange(e.target.value),required,disabled};
 return <div className={`ec-field ${wide?'ec-wide':''}`}><label htmlFor={id}>{label}{required?' *':''}</label>{options?<select {...inputProps}><option value="">Selecione</option>{options.map(x=>typeof x==='string'?<option key={x}>{x}</option>:<option key={x.value} value={x.value}>{x.label}</option>)}</select>:type==='textarea'?<textarea {...inputProps} rows={3}/>:<input {...inputProps} type={type} min={min} max={max}/ >}{hint?<small>{hint}</small>:null}</div>;
}
export function Owner({users,value,onChange,label='Responsável'}:{users:User[];value:string|null;onChange:(v:string)=>void;label?:string}){return <Field label={label} value={value||''} onChange={onChange} options={users.map(u=>({value:u.id,label:u.nome}))}/>}
export function Check({label,value,onChange,disabled=false}:{label:string;value:boolean;onChange:(v:boolean)=>void;disabled?:boolean}){return <label className="ec-check"><input type="checkbox" checked={value} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>}
export function Multi({label,value,options,onChange}:{label:string;value:string[];options:string[];onChange:(v:string[])=>void}){return <fieldset className="ec-multi ec-wide"><legend>{label}</legend><div>{options.map(x=><button type="button" key={x} aria-pressed={value.includes(x)} className={value.includes(x)?'selected':''} onClick={()=>onChange(value.includes(x)?value.filter(y=>y!==x):[...value,x])}>{x}</button>)}</div></fieldset>}
export function Drawer({title,subtitle,children,onClose,footer,wide=true}:{title:string;subtitle?:string;children:React.ReactNode;onClose:()=>void;footer?:React.ReactNode;wide?:boolean}){
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose()}}><Dialog.Portal><Dialog.Overlay className="ec-overlay"/><Dialog.Content className={`ec-drawer ec ${wide?'ec-drawer-wide':''}`} onInteractOutside={e=>e.preventDefault()}><header><div><Dialog.Description>{subtitle||'Esteira Criativa · Consulmax'}</Dialog.Description><Dialog.Title>{title}</Dialog.Title></div><button type="button" className="ec-icon" aria-label="Fechar painel" onClick={onClose}><X size={20}/></button></header><div className="ec-drawer-body">{children}</div>{footer?<footer>{footer}</footer>:null}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Submit({busy,label='Salvar'}:{busy:boolean;label?:string}){return <button className="ec-button ec-primary" type="submit" disabled={busy}>{busy?<Loader2 className="animate-spin" size={16}/>:null}{busy?'Salvando…':label}</button>}
export function ErrorBox({message}:{message:string}){return message?<div role="alert" className="ec-error">{message}</div>:null}
export function Section({title,children,hint}:{title:string;children:React.ReactNode;hint?:string}){return <section className="ec-section"><h3>{title}</h3>{hint?<p className="ec-muted">{hint}</p>:null}<div className="ec-form-grid">{children}</div></section>}
