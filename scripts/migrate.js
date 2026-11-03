import {existsSync,readFileSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const{db,closeDB}=await import('../server/db.js');
try{
 for(const file of ['001-initial.sql','002-media-finance.sql','003-monitoring.sql']){
  const sql=readFileSync(new URL('../sql/'+file,import.meta.url),'utf8').replace(/^\s*--.*$/gm,'');
  for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await db().query(statement);
  console.log('Applied '+file);
 }
 console.log('Schema ready; existing users and data kept.');
}finally{await closeDB();}
