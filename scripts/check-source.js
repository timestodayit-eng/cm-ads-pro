import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]); }
for (const file of ['server.js', ...files('server'),...files('shared'),...files('scripts'),...files('tests')].filter(f=>f.endsWith('.js'))) {
 const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'}); if(r.status!==0)process.exit(1);
}
console.log('Server/shared/test JavaScript syntax passed. JSX is checked by npm run build.');
