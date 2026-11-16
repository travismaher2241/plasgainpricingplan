import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {workbook} from '../lib/export';
import type {Snapshot} from '../lib/types';

const snapshot:Snapshot={
 products:[{row:6,code:'001',ucsCode:'U1',description:'Pole',unit:'Each',ucsPrice:100},{row:7,code:'002',ucsCode:'U2',description:'Bracket',unit:'Each',ucsPrice:20}],
 customers:[{code:'C1',name:'Customer A'},{code:'C2',name:'Customer B'}],
 purchases:[
 {customerCode:'C1',itemCode:'001',date:'2026-10-01',invoice:'NEW',line:1,qty:2,net:240,price:120},
 {customerCode:'C1',itemCode:'001',date:'2026-09-01',invoice:'OLD',line:1,qty:3,net:270,price:90},
 {customerCode:'C2',itemCode:'002',date:'2026-08-01',invoice:'OTHER',line:1,qty:1,net:25,price:25},
 ],exceptions:[],start:'2025-11-16',end:'2026-11-16',extractedAt:'2026-11-16T01:00:00Z',processedLines:3,complete:true,
};

test('export has exactly one latest-price row per customer/UCS item, including unsold items',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await workbook(snapshot,{}) as any);
 assert.equal(wb.worksheets.length,2);
 const ws=wb.getWorksheet('Latest Purchase Prices')!;
 assert.equal(ws.rowCount,5);assert.equal(ws.columnCount,12);
 const headers=ws.getRow(1).values as string[];
 assert.ok(headers.includes('Last Net Unit Price (AUD)'));
 assert.doesNotMatch(headers.join(','),/Previous|Revenue|Quantity|Invoice/);
 const rows=[2,3,4,5].map(n=>ws.getRow(n));
 assert.deepEqual(rows.map(r=>[r.getCell(2).value,r.getCell(3).value]),[['C1','001'],['C1','002'],['C2','001'],['C2','002']]);
 assert.equal(rows[0].getCell(7).value,'01/10/2026');
 assert.equal(rows[0].getCell(8).value,120);
 assert.equal(rows[1].getCell(7).value,'No purchase in last 12 months');
 assert.ok(rows[1].getCell(8).value===null||rows[1].getCell(8).value==='');
 assert.equal(rows[3].getCell(8).value,25);
 assert.ok(rows.every(r=>r.getCell(8).value!==90));
});

test('selected-customer export contains only that customer and every UCS item',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await workbook(snapshot,{},'C2') as any);
 const ws=wb.worksheets[0];assert.equal(ws.rowCount,3);
 for(const n of [2,3])assert.equal(ws.getRow(n).getCell(2).value,'C2');
 assert.equal(ws.getRow(2).getCell(10).value,'120.00'); // Global benchmark includes C1, even in C2's export.
 assert.equal(ws.getRow(2).getCell(3).value,'001');assert.equal(ws.getRow(3).getCell(3).value,'002');
});
