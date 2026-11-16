import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {getFirestore, type Firestore} from 'firebase-admin/firestore';
import {gzipSync, gunzipSync} from 'node:zlib';
import type {State} from './types';

const appName = 'plasgain-pricing';
const chunkSize = 500_000;
const maxBytes = 8_000_000;

export function firebaseConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_PROJECT_ID);
}

function database() {
  let app = getApps().find(a => a.name === appName);
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      let account;
      try { account = JSON.parse(raw); } catch { throw Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service account JSON'); }
      if (!account.project_id || !account.client_email || !account.private_key) {
        throw Error('Firebase service account requires project_id, client_email and private_key');
      }
      app = initializeApp({credential: cert(account), projectId: account.project_id}, appName);
    } else {
      // Application Default Credentials locally; no credentials needed for the emulator.
      app = initializeApp({projectId: process.env.FIREBASE_PROJECT_ID}, appName);
    }
  }
  return getFirestore(app);
}

// Compress and split the snapshot: a Firestore document is limited to 1 MiB.
// The manifest and chunks are read/written together in a transaction so readers
// never combine different revisions, and concurrent edits cannot overwrite data.
export async function readFirebaseState(empty: State, db: Firestore = database()): Promise<State> {
  const root = db.doc('pricing_state/main');
  return db.runTransaction(async tx => {
    const manifest = await tx.get(root);
    if (!manifest.exists) return structuredClone(empty);
    const {revision, chunks} = manifest.data()!;
    if (!Number.isSafeInteger(chunks) || chunks < 1 || chunks > maxBytes / chunkSize) {
      throw Error('Firebase pricing state manifest is invalid');
    }
    const documents = await tx.getAll(...Array.from({length: chunks}, (_, i) => root.collection('chunks').doc(String(i))));
    const buffers = documents.map(doc => {
      const payload = doc.data()?.payload;
      if (!Buffer.isBuffer(payload)) throw Error('Firebase pricing state chunk is missing or invalid');
      return payload;
    });
    const state = JSON.parse(gunzipSync(Buffer.concat(buffers)).toString('utf8'));
    return {...empty, ...state, revision};
  });
}

export async function saveFirebaseState(state: State, db: Firestore = database()) {
  const expected = state.revision;
  if (expected === undefined || !Number.isSafeInteger(expected) || expected < 0) throw Error('State revision missing or invalid');
  const revision = expected + 1;
  const bytes = gzipSync(JSON.stringify({...state, revision}));
  if (bytes.length > maxBytes) throw Error('Pricing data exceeds the Firebase storage transaction limit (8 MB compressed)');
  const chunks = Math.ceil(bytes.length / chunkSize);
  const root = db.doc('pricing_state/main');
  await db.runTransaction(async tx => {
    const manifest = await tx.get(root);
    if ((manifest.exists ? manifest.data()!.revision : 0) !== expected) {
      throw Error('Pricing data changed in another request; refresh and retry');
    }
    for (let i = 0; i < chunks; i++) {
      tx.set(root.collection('chunks').doc(String(i)), {payload: bytes.subarray(i * chunkSize, (i + 1) * chunkSize)});
    }
    tx.set(root, {revision, chunks});
  });
  state.revision = revision;
}
