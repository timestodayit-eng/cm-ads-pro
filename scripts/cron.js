// Hostinger: schedule this finite runner every minute; Settings controls how
// often each mapped Meta account becomes due (5 minutes by default).
// Load environment via node --env-file=...; do NOT start an endless worker.
const {runBatch}=await import('../server/jobs.js');
const {closeDB}=await import('../server/db.js');
try{console.log(JSON.stringify(await runBatch({source:'cron',budgetMs:240000,maxJobs:36,concurrency:3})));}
catch(e){console.error(JSON.stringify({event:'cron_failed',code:e.code||'CRON_FAILED'}));process.exitCode=1;}
finally{await closeDB();}
