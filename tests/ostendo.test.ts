import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDay} from '../lib/ostendo';

test('invoice header validation distinguishes response defects without skipping records', async () => {
  const originalFetch=globalThis.fetch;
  const originalUrl=process.env.OSTENDO_API_URL, originalKey=process.env.OSTENDO_API_KEY;
  process.env.OSTENDO_API_URL='https://plasgain.southeastit.com.au:8843';
  process.env.OSTENDO_API_KEY='synthetic-test-key';
  const date='2025-11-16';
  const respond=(rows:unknown)=>{globalThis.fetch=async()=>new Response(JSON.stringify(rows),{status:200})};
  try {
    respond([]);assert.deepEqual(await fetchDay(date),[]);
    const valid={INVOICENUMBER:'TEST1',INVOICEDATE:'16/11/2025'};
    respond([valid]);assert.deepEqual(await fetchDay(date),[valid]);
    respond([{CUSTOMER:'private-customer',INVOICEDATE:date}]);
    await assert.rejects(fetchDay(date),e=>{
      assert.match(String(e),/missing INVOICENUMBER/);
      assert.match(String(e),/Returned fields: CUSTOMER, INVOICEDATE/);
      assert.doesNotMatch(String(e),/private-customer|synthetic-test-key/);return true;
    });
    respond([{...valid,INVOICEDATE:null}]);await assert.rejects(fetchDay(date),/unsupported format/);
    respond([{...valid,INVOICEDATE:'2025-11-17'}]);await assert.rejects(fetchDay(date),/date filter needs verification/);
    respond([valid,valid]);await assert.rejects(fetchDay(date),/duplicate INVOICENUMBER/);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalUrl===undefined)delete process.env.OSTENDO_API_URL;else process.env.OSTENDO_API_URL=originalUrl;
    if(originalKey===undefined)delete process.env.OSTENDO_API_KEY;else process.env.OSTENDO_API_KEY=originalKey;
  }
});
