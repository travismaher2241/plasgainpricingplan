import ExcelJS from 'exceljs';import {Snapshot,Discount} from './types';import {summarize} from './analysis';
const money='#,##0.00;[Red](#,##0.00)';
const auDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):s;
function sheet(wb:ExcelJS.Workbook,name:string,headers:string[],rows:(string|number|null)[][]){const ws=wb.addWorksheet(name);ws.addRow(headers);for(const row of rows)ws.addRow(row.map(v=>v??''));ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:headers.length}};ws.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183153'}}});ws.columns.forEach((col,i)=>{col.width=Math.min(42,Math.max(15,headers[i].length+3));if(/price|revenue/i.test(headers[i]))col.numFmt=money;if(/discount/i.test(headers[i]))col.numFmt='0.00"%"';if(/code/i.test(headers[i]))col.numFmt='@'});return ws}
export async function workbook(s:Snapshot,d:Record<string,Discount>,customer?:string){
const wb=new ExcelJS.Workbook();wb.creator='Plasgain Pricing Analysis';
const rows=summarize(s,d).filter(r=>!customer||r.customer.code===customer);
sheet(wb,'Latest Purchase Prices',[
'Customer','Customer Code','Plasgain Item Code','UCS Item Code','Description','Unit','Last Purchase Date / Status','Last Net Unit Price (AUD)'
],rows.map(r=>[
r.customer.name,r.customer.code,r.item.code,r.item.ucsCode,r.item.description,r.item.unit,
r.last?auDate(r.last.date):'No purchase in last 12 months',r.last?.price??null
]));
return Buffer.from(await wb.xlsx.writeBuffer());
}
