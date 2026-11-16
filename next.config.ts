import type {NextConfig} from 'next';
const config:NextConfig={distDir:process.env.VERCEL?'.next':'build-output'};
export default config;


