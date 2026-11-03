// Meta reports hourly buckets, not event-level spend. Only complete buckets are
// included: no proportional interpolation of money or conversion counts.
export function utcHourWindow(hours,nowMs=Date.now()){
 if(![12,24].includes(hours))throw new Error('Choose 12 or 24 hours.');
 const end=Math.floor(nowMs/3600000)*3600000;
 return{start:new Date(end-hours*3600000).toISOString(),end:new Date(end).toISOString(),hours};
}
export function parseHourLabel(value){
 const m=/^(\d{2}):00:00\s*-\s*(\d{2}):59:59$/.exec(String(value));
 if(!m||m[1]!==m[2]||Number(m[1])>23)throw new Error('Unsupported Meta hourly bucket label.');return Number(m[1]);
}
export function completeBuckets(rows,window){
 const start=Date.parse(window.start),end=Date.parse(window.end);
 const ms=v=>Date.parse(String(v).replace(' ','T')+(/[Z]|[+-]\d\d:\d\d$/.test(v)?'':'Z'));
 return rows.filter(r=>ms(r.start_utc)>=start&&ms(r.end_utc)<=end&&ms(r.end_utc)>ms(r.start_utc));
}
