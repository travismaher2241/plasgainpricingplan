import fs from 'node:fs/promises';import path from 'node:path';import {State} from './types';
const empty:State={snapshot:null,stagedProducts:[],stagedExceptions:[],discounts:{},draft:null,nextDay:null,pendingHeaders:[],runError:null};
const file=()=>path.resolve(process.env.DATA_DIR||'./data','state.json');
export async function readState():Promise<State>{try{return {...empty,...JSON.parse(await fs.readFile(file(),'utf8'))}}catch(e:any){if(e.code==='ENOENT')return structuredClone(empty);throw e}}
export async function saveState(s:State){await fs.mkdir(path.dirname(file()),{recursive:true});const temp=file()+'.tmp';await fs.writeFile(temp,JSON.stringify(s));await fs.rename(temp,file())}

