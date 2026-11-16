import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {readFirebaseState, saveFirebaseState} from '../lib/firestore-store';
import type {State} from '../lib/types';

// This suite uses real Firestore transactions against the local emulator only.
test('Firestore round trips large states and rejects stale/concurrent writes', {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const app = initializeApp({projectId: 'demo-plasgain-storage'}, 'storage-test');
  const db = getFirestore(app);
  const root = db.doc('pricing_state/main');
  const empty: State = {revision:0,snapshot:null,stagedProducts:[],stagedExceptions:[],discounts:{},draft:null,nextDay:null,pendingHeaders:[],runError:null};
  try {
    await db.recursiveDelete(root);
    assert.deepEqual(await readFirebaseState(empty, db), empty);
    const state = structuredClone(empty);
    state.stagedProducts = [{row:6,code:'001',ucsCode:'TEST',description:'Synthetic',unit:'Each',ucsPrice:100}];
    // Incompressible data ensures this spans multiple Firestore documents.
    state.runError = randomBytes(1_200_000).toString('base64');
    await saveFirebaseState(state, db);
    assert.equal(state.revision, 1);
    assert.ok((await root.get()).data()!.chunks > 1);
    assert.deepEqual(await readFirebaseState(empty, db), state);
    await assert.rejects(saveFirebaseState(structuredClone(empty), db), /changed in another request/);
    const first = structuredClone(state), second = structuredClone(state);
    first.runError = null; second.runError = 'another writer';
    const outcomes = await Promise.allSettled([saveFirebaseState(first, db), saveFirebaseState(second, db)]);
    assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
    const saved = await readFirebaseState(empty, db);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.stagedProducts, state.stagedProducts);
    await root.collection('chunks').doc('0').delete();
    await assert.rejects(readFirebaseState(empty, db), /chunk is missing or invalid/);
  } finally {
    await db.recursiveDelete(root);
    await db.terminate();
    await deleteApp(app);
  }
});
