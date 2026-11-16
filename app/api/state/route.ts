import {NextRequest,NextResponse} from 'next/server';import {authorized,unauthorized} from '@/lib/auth';import {readState} from '@/lib/store';
export async function GET(req:NextRequest){if(!authorized(req))return unauthorized();return NextResponse.json(await readState())}

