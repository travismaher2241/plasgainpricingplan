import fs from 'node:fs/promises';
import path from 'node:path';
import {neon} from '@neondatabase/serverless';
import {State} from './types';
import {firebaseConfigured, readFirebaseState, saveFirebaseState} from './firestore-store';
const empty:State={revision:0,snapshot:null,stagedProducts:[],stagedExceptions:[],discounts:{},draft:null,nextDay:null,pendingHeaders:[],runError:null};
const file=()=>path.resolve(process.env.DATA_DIR||'./data','state.json');
function databaseUrl(){const url=process.env.DATABASE_URL;if(!url&&process.env.VERCEL==='1')throw Error('Connect Firebase with FIREBASE_SERVICE_ACCOUNT_JSON (or set DATABASE_URL for Postgres) on Vercel; temporary file storage is disabled');return url}
async function db(){const url=databaseUrl();if(!url)return null;const sql=neon(url);await sql`CREATE TABLE IF NOT EXISTS pricing_state (id integer PRIMARY KEY CHECK (id = 1), revision bigint NOT NULL, data jsonb NOT NULL)`;await sql`INSERT INTO pricing_state (id, revision, data) VALUES (1, 0, ${JSON.stringify(empty)}::jsonb) ON CONFLICT (id) DO NOTHING`;return sql}
export async function readState():Promise<State>{if(firebaseConfigured())return readFirebaseState(empty);const sql=await db();if(sql){const rows=await sql`SELECT revision, data FROM pricing_state WHERE id = 1`;if(rows.length!==1)throw Error('Pricing state is unavailable');return {...empty,...(rows[0].data as object),revision:Number(rows[0].revision)}}try{return {...empty,...JSON.parse(await fs.readFile(file(),'utf8'))}}catch(e:any){if(e.code==='ENOENT')return structuredClone(empty);throw e}}
export async function saveState(s:State){if(firebaseConfigured())return saveFirebaseState(s);const sql=await db();if(sql){const expected=s.revision;if(expected===undefined)throw Error('State revision missing');const next=expected+1;const data={...s,revision:next};const rows=await sql`UPDATE pricing_state SET revision = ${next}, data = ${JSON.stringify(data)}::jsonb WHERE id = 1 AND revision = ${expected} RETURNING revision`;if(rows.length!==1)throw Error('Pricing data changed in another request; refresh and retry');s.revision=next;return}await fs.mkdir(path.dirname(file()),{recursive:true});const temp=file()+'.tmp';s.revision=(s.revision||0)+1;await fs.writeFile(temp,JSON.stringify(s));await fs.rename(temp,file())}


