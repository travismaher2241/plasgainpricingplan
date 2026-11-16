import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,priceBenchmarks,comparePrice,isUcsCustomer} from '../lib/analysis';
import {workbook} from '../lib/export';
import ExcelJS from 'exceljs';
import type {Snapshot,Purchase} from '../lib/types';
const purchase=(customerCode:string,price:number,invoice=customerCode,date='2026-10-01'):Purchase=>({customerCode,itemCode:'001',date,invoice,line:1,qty:1,net:price,price});
function fixture():Snapshot{return {
 products:[{row:6,code:'001',ucsCode:'U1',description:'Pole',unit:'Each',ucsPrice:200},{row:7,code:'002',ucsCode:'U2',description:'Unsold',unit:'Each',ucsPrice:null}],
 customers:[{code:'C1',name:'A'},{code:'C2',name:'B'},{code:'C3',name:'C'},{code:'U',name:' Underground Cable Services Pty Ltd '},{code:'N',name:'No purchases'}],
 purchases:[purchase('C1',281),purchase('C2',285),purchase('C3',285),purchase('C1',100,'OLD','2026-01-01'),purchase('U',200),purchase('U',200,'UOLD','2026-01-01')],
 exceptions:[],start:'2025-11-16',end:'2026-11-16',extractedAt:'2026-11-16',processedLines:6,complete:true,
}}
test('most common price counts latest purchases once per customer, excludes UCS, and retains reference',()=>{
 const s=fixture(),rows=summarize(s,{}),benchmarks=priceBenchmarks(rows,s.products),b=benchmarks.get('001')!;
 assert.equal(b.base,270);assert.equal(b.customers,3);assert.equal(b.excluded,1);
 assert.deepEqual(b.modes,[{price:285,count:2}]);
 assert.deepEqual(comparePrice(rows.find(r=>r.customer.code==='C1'&&r.item.code==='001')!,b),{status:'Below common price',differences:[{price:285,delta:-4}]});
 assert.equal(comparePrice(rows.find(r=>r.customer.code==='U'&&r.item.code==='001')!,b).status,'UCS — excluded');
 assert.equal(comparePrice(rows.find(r=>r.customer.code==='N'&&r.item.code==='001')!,b).status,'No purchase in last 12 months');
 assert.deepEqual(benchmarks.get('002')!.modes,[]);assert.equal(benchmarks.get('002')!.base,null);
 assert.equal(isUcsCustomer({name:'UNDERGROUND   CABLE SERVICES',code:'U'}),true);
 assert.equal(isUcsCustomer({name:'Another Underground Cable Services Customer',code:'X'}),false);
});
test('ties include every common price and each price uses cents',()=>{
 const s=fixture();s.purchases=[purchase('C1',281.00000001),purchase('C2',285),purchase('C3',283)];
 const rows=summarize(s,{}),b=priceBenchmarks(rows,s.products).get('001')!;
 assert.deepEqual(b.modes,[{price:281,count:1},{price:283,count:1},{price:285,count:1}]);
 const row=rows.find(r=>r.customer.code==='C1'&&r.item.code==='001')!;
 assert.equal(comparePrice(row,b).status,'At a tied common price');
 const between={...row,last:{...row.last!,price:282}};
 const twoTies={...b,modes:[{price:281,count:2},{price:285,count:2}]};
 assert.equal(comparePrice(between,twoTies).status,'Between tied prices');
 assert.deepEqual(comparePrice(between,twoTies).differences,[{price:281,delta:1},{price:285,delta:-3}]);
});
test('UCS-only and empty products have no benchmark',()=>{
 const s=fixture();s.purchases=[purchase('U',200)];const b=priceBenchmarks(summarize(s,{}),s.products).get('001')!;
 assert.equal(b.customers,0);assert.deepEqual(b.modes,[]);assert.equal(b.base,270);
});
test('Excel includes all item benchmarks and customer differences without older transactions',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await workbook(fixture(),{}) as any);
 const summary=wb.getWorksheet('Item Price Benchmarks')!;
 assert.equal(summary.rowCount,3);assert.equal(summary.getRow(2).getCell(5).value,270);
 assert.equal(summary.getRow(2).getCell(6).value,'285.00');assert.equal(summary.getRow(2).getCell(7).value,2);
 assert.equal(summary.getRow(2).getCell(8).value,3);
 assert.notEqual(summary.getColumn(7).numFmt,'#,##0.00;[Red](#,##0.00)');
 assert.equal(summary.getColumn(9).numFmt,'0.00"%"');
 const latest=wb.getWorksheet('Latest Purchase Prices')!;
 assert.equal(latest.getRow(2).getCell(11).value,'Below common price');
 assert.equal(latest.getRow(2).getCell(12).value,'-4.00 vs 285.00');
});
