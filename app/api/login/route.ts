import {NextRequest} from 'next/server';import {login} from '@/lib/auth';
export async function POST(req:NextRequest){const {password}=await req.json();return login(req,String(password||''))}

