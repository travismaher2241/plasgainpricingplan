import {NextRequest,NextResponse} from 'next/server';import {authorized,unauthorized} from '@/lib/auth';import {readState} from '@/lib/store';
export async function GET(req:NextRequest){if(!authorized(req))return unauthorized();try{return NextResponse.json(await readState())}catch(e:any){console.error('Pricing storage unavailable',e);return NextResponse.json({error:e.message||'Pricing storage unavailable'},{status:503})}}


