import { existsSync, readFileSync } from 'node:fs';
if (!existsSync('dist/index.html')) throw new Error('dist/index.html missing. Build failed.');
const html=readFileSync('dist/index.html','utf8');
if (!html.includes('/assets/')) throw new Error('Built assets missing');
console.log('Production frontend verified: dist/index.html');
