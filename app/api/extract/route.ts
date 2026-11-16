import {NextRequest,NextResponse} from 'next/server';import {authorized,unauthorized} from '@/lib/auth';import {readState} from '@/lib/store';import {begin,step} from '@/lib/extract';
export const maxDuration=300;
function progress(s:Awaited<ReturnType<typeof readState>>){return {running:Boolean(s.draft),draft:s.draft?{start:s.draft.start,end:s.draft.end,processedLines:s.draft.processedLines}:null,nextDay:s.nextDay,runError:s.runError}}
export async function POST(req:NextRequest){if(!authorized(req))return unauthorized();try{const {action}=await req.json();if(action==='start'){const s=await readState();if(!s.stagedProducts.length)throw Error('Import a spreadsheet first');return NextResponse.json(progress(await begin(s.stagedProducts,s.stagedExceptions)))}if(action==='step')return NextResponse.json(progress(await step()));throw Error('Invalid action')}catch(e:any){return NextResponse.json({error:e.message},{status:400})}}


