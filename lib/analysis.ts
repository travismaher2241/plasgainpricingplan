import {Snapshot,Purchase,Product,Customer,Discount,key} from './types';
export function master(p:Product){return p.ucsPrice===null?null:p.ucsPrice*1.35}
export function summarize(s:Snapshot,discounts:Record<string,Discount>){const map=new Map<string,Purchase[]>();for(const p of s.purchases){const k=key(p.customerCode,p.itemCode);map.set(k,[...(map.get(k)||[]),p])}const out=[];for(const c of s.customers)for(const p of s.products){const raw=map.get(key(c.code,p.code))||[];const invoices=new Map<string,Purchase>();for(const h of raw){const old=invoices.get(h.invoice);if(old){const qty=old.qty+h.qty,net=old.net+h.net;invoices.set(h.invoice,{...old,qty,net,price:net/qty,line:Math.max(old.line,h.line)})}else invoices.set(h.invoice,{...h})}const history=[...invoices.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.invoice.localeCompare(a.invoice)||b.line-a.line);const last=history[0],previous=history[1];const base=master(p);const discount=discounts[key(c.code,p.code)]||{value:null,locked:false,updatedAt:''};out.push({customer:c,item:p,last,previous,quantity:history.reduce((n,h)=>n+h.qty,0),revenue:history.reduce((n,h)=>n+h.net,0),invoiceCount:history.length,base,implied:last&&base?100*(1-last.price/base):null,discount,proposed:base!==null&&discount.value!==null?base*(1-discount.value/100):null})}return out}


export type PricingRow = ReturnType<typeof summarize>[number];
export function isUcsCustomer(customer: Customer) {
  const name = customer.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ pty ltd$/, '');
  return name === 'underground cable services';
}
export type PriceBenchmark = {
  item: Product; base: number|null;
  groups: {price:number; count:number}[];
  modes: {price:number; count:number}[];
  customers: number; excluded: number;
};
export function priceBenchmarks(rows: PricingRow[], products: Product[]) {
  const result = new Map<string, PriceBenchmark>(products.map(item=>[item.code,{item,base:master(item),groups:[],modes:[],customers:0,excluded:0}]));
  const counts = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const benchmark = result.get(row.item.code);
    if (!benchmark || !row.last) continue;
    if (isUcsCustomer(row.customer)) {benchmark.excluded++; continue;}
    const cents = Math.round((row.last.price + Number.EPSILON) * 100);
    const prices = counts.get(row.item.code) || new Map<number, number>();
    prices.set(cents,(prices.get(cents)||0)+1);counts.set(row.item.code,prices);
    benchmark.customers++;
  }
  for (const [code, benchmark] of result) {
    benchmark.groups = [...(counts.get(code)||[])].map(([cents,count])=>({price:cents/100,count})).sort((a,b)=>b.count-a.count||a.price-b.price);
    const highest = benchmark.groups[0]?.count;
    benchmark.modes = benchmark.groups.filter(group=>group.count===highest);
  }
  return result;
}
export function comparePrice(row: PricingRow, benchmark?: PriceBenchmark) {
  if (isUcsCustomer(row.customer)) return {status:'UCS — excluded',differences:[] as {price:number; delta:number}[]};
  if (!row.last) return {status:'No purchase in last 12 months',differences:[]};
  if (!benchmark?.modes.length) return {status:'No benchmark',differences:[]};
  const price = Math.round((row.last.price + Number.EPSILON)*100)/100;
  const differences = benchmark.modes.map(mode=>({price:mode.price,delta:Math.round((price-mode.price)*100)/100}));
  let status:string;
  if (differences.some(d=>d.delta===0)) status=benchmark.modes.length>1?'At a tied common price':'At common price';
  else if(differences.every(d=>d.delta<0)) status=benchmark.modes.length>1?'Below all tied prices':'Below common price';
  else if(differences.every(d=>d.delta>0)) status=benchmark.modes.length>1?'Above all tied prices':'Above common price';
  else status='Between tied prices';
  return {status,differences};
}
