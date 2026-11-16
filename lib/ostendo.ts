/* The only ERP operation in this project is GET /tabledata, for these fixed tables. */
const tables=['CUSTOMERMASTER','SALESINVOICEHEADER','SALESINVOICELINES'] as const;
export type Table=typeof tables[number];export type RecordRow=Record<string,unknown>;
function config(){const raw=process.env.OSTENDO_API_URL;const key=process.env.OSTENDO_API_KEY;if(!raw||!key)throw Error('OSTENDO_API_URL and OSTENDO_API_KEY are required');const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='plasgain.southeastit.com.au'||u.port!=='8843'||u.search||u.hash)throw Error('Ostendo URL is outside the verified host allowlist');return {u,key}}
export async function query(table:Table,condition?:string):Promise<RecordRow[]>{if(!tables.includes(table))throw Error('Table not allowed');const {u,key}=config();const url=new URL(u.pathname.replace(/\/$/,'')+'/tabledata',u.origin);const params=['configuration=0',`tablename=${encodeURIComponent(table)}`,`apikey=${encodeURIComponent(key)}`,'format=json'];if(condition)params.push(`condition=${encodeURIComponent(condition).replace(/'/g,'%27')}`);url.search=params.join('&');const response=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});if(response.status>=300&&response.status<400)throw Error('Ostendo redirect refused');const body=await response.text();if(!response.ok)throw Error(`Ostendo HTTP ${response.status}`);let json:unknown;try{json=JSON.parse(body)}catch{throw Error('Ostendo returned non-JSON response')};if(json&&typeof json==='object'&&!Array.isArray(json)&&('error'in json||'ERROR'in json||'fault'in json))throw Error('Ostendo returned an error');let rows:unknown=json;if(!Array.isArray(rows)&&rows&&typeof rows==='object'){const o=rows as Record<string,unknown>;const k=Object.keys(o).find(k=>[table,'DATA','ROWS'].includes(k.toUpperCase()));rows=k?o[k]:o}if(rows==null)return [];
// Some table responses encode columns as arrays rather than an array of rows.
if(!Array.isArray(rows)&&typeof rows==='object'){
const columns=Object.entries(rows as Record<string,unknown>);
if(columns.length&&columns.every(([,v])=>Array.isArray(v))){
const count=(columns[0][1] as unknown[]).length;
if(columns.some(([,v])=>(v as unknown[]).length!==count))throw Error('Invalid Ostendo column response: unequal column lengths');
rows=Array.from({length:count},(_,i)=>Object.fromEntries(columns.map(([k,v])=>[k,(v as unknown[])[i]])));
}}
if(!Array.isArray(rows))rows=[rows];if(!(rows as unknown[]).every(r=>r&&typeof r==='object'&&!Array.isArray(r)))throw Error('Invalid Ostendo row response');return rows as RecordRow[]}
export const str=(r:RecordRow,k:string)=>String(r[k]??'').trim();
export const num=(r:RecordRow,k:string)=>{const v=r[k];if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null};
function calendarDate(year:string,month:string,day:string){
const iso=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
const parsed=new Date(iso+'T12:00:00Z');
return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso?iso:'';
}
export function isoDate(raw:unknown,expectedDay?:string){
const s=String(raw??'').trim();
const iso=s.match(/^(\d{4})-(\d\d)-(\d\d)(?=$|[T ])/);
if(iso)return calendarDate(iso[1],iso[2],iso[3]);
const slash=s.match(/^(\d\d?)\/(\d\d?)\/(\d{4})(?=$|[T ])/);
if(!slash)return '';
const dayFirst=calendarDate(slash[3],slash[2],slash[1]);
const monthFirst=calendarDate(slash[3],slash[1],slash[2]);
// Daily queries provide context for ambiguous slash dates. The normalized ISO
// date is persisted on the header so subsequent batches do not reinterpret it.
if(expectedDay&&(dayFirst===expectedDay||monthFirst===expectedDay))return expectedDay;
return dayFirst||monthFirst;
}
export function addDay(day:string){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
export function windowDates(now=new Date()){const end=now.toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});const y=Number(end.slice(0,4)),m=Number(end.slice(5,7)),d=Number(end.slice(8,10));const startDate=new Date(Date.UTC(y,m-13,d));return {start:startDate.toISOString().slice(0,10),end}}
export async function fetchDay(date:string){let rows:RecordRow[];try{rows=await query('SALESINVOICEHEADER',`INVOICEDATE='${date}'`)}catch{const [y,m,d]=date.split('-');rows=await query('SALESINVOICEHEADER',`INVOICEDATE='${Number(m)}/${Number(d)}/${y}'`)}// Accept only a single completely blank placeholder, never a partial invoice.
if(rows.length===1&&'INVOICENUMBER' in rows[0]&&Object.values(rows[0]).every(v=>v===null||typeof v==='string'&&v.trim()===''))return [];
const seen=new Set<string>();for(const [index,r] of rows.entries()){
const invoice=str(r,'INVOICENUMBER');
const location=`Ostendo SALESINVOICEHEADER for ${date}, row ${index+1} of ${rows.length}`;
if(!invoice){
// Report field names only, never customer data, invoice values or credentials.
const fields=Object.keys(r).slice(0,12).map(k=>k.replace(/[^A-Za-z0-9_]/g,'').slice(0,60)).join(', ')||'(none)';
throw Error(`${location}: missing INVOICENUMBER. Returned fields: ${fields}`);
}
const actualDate=isoDate(r.INVOICEDATE,date);
if(!actualDate)throw Error(`${location}: INVOICEDATE is missing or has an unsupported format; expected YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY`);
if(actualDate!==date)throw Error(`${location}: returned invoice date ${actualDate} does not match requested date ${date}; the server date filter needs verification`);
if(seen.has(invoice))throw Error(`${location}: duplicate INVOICENUMBER in this day's response; extraction paused to avoid double counting`);
r.INVOICEDATE=actualDate;seen.add(invoice)}return rows}
export async function fetchLines(invoice:string){if(!/^[A-Za-z0-9][A-Za-z0-9_./-]{0,39}$/.test(invoice))throw Error('Unsafe invoice number');const rows=await query('SALESINVOICELINES',`INVOICENUMBER='${invoice}'`);for(const r of rows)if(str(r,'INVOICENUMBER')!==invoice)throw Error(`Unexpected invoice line for ${invoice}`);return rows}

