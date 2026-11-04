// Meta delivery settings are validated on BOTH draft save and publish replay.
// Never accept arbitrary Graph API parameter objects from a browser or AI output.
const error=message=>{throw Object.assign(new Error(message),{code:'ADVANCED_SETTINGS_INVALID',status:422});};
const countryRE=/^[A-Z]{2}$/;
const numericId=/^[1-9][0-9]{4,39}$/;
const allowedPositions={
 facebook:['feed','story','facebook_reels','video_feeds','marketplace','search','right_hand_column','instream_video'],
 instagram:['stream','story','reels','profile_feed','ig_search'],
 messenger:['messenger_home'],
 audience_network:['classic','rewarded_video']
};
export const placementOptions={
 facebook:[['feed','Facebook Feed'],['story','Facebook Stories'],['facebook_reels','Facebook Reels'],['video_feeds','Facebook Video Feeds'],['marketplace','Facebook Marketplace'],['search','Facebook Search'],['right_hand_column','Facebook Right Column'],['instream_video','Facebook In-stream']],
 instagram:[['stream','Instagram Feed'],['story','Instagram Stories'],['reels','Instagram Reels'],['profile_feed','Instagram Profile Feed'],['ig_search','Instagram Search']],
 messenger:[['messenger_home','Messenger Inbox']],
 audience_network:[['classic','Audience Network Native'],['rewarded_video','Audience Network Rewarded Video']]
};
export const countryOptions=[['BD','Bangladesh'],['MY','Malaysia'],['SA','Saudi Arabia'],['AE','United Arab Emirates'],['QA','Qatar'],['KW','Kuwait'],['PT','Portugal'],['IT','Italy'],['JP','Japan'],['US','United States'],['CA','Canada'],['GB','United Kingdom']];
export function defaultAdvanced(){return{
 audience:{mode:'BROAD',countries:['BD'],gender:'ALL',interestIds:[],customAudienceIds:[]},
 placements:{mode:'AUTOMATIC',facebook:[],instagram:[],messenger:[],audience_network:[],devices:[]},
 delivery:{performance:'DEFAULT',bidStrategy:'LOWEST_COST_WITHOUT_CAP',bidAmount:'',frequencyCap:null}
};}
function uniqueArray(value,field,max){
 if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length)error(`${field} must contain distinct allowed values (maximum ${max}).`);
 return value;
}
function ids(value,field){return uniqueArray(value||[],field,30).map(x=>{if(typeof x!=='string'||!numericId.test(x))error(`${field}: enter a valid numeric Meta ID.`);return x;});}
export function normalizeAdvanced(input,category,conversion){
 if(input!==undefined&&(input===null||typeof input!=='object'||Array.isArray(input)))error('Advanced settings must be an object.');
 const defaults=defaultAdvanced(),raw=input||{},a={...defaults.audience,...(raw.audience||{})},p={...defaults.placements,...(raw.placements||{})},d={...defaults.delivery,...(raw.delivery||{})};
 if(!['BROAD','ADVANTAGE_PLUS','MANUAL'].includes(a.mode))error('Choose Broad, Advantage+ or Manual audience.');
 const countries=uniqueArray(a.countries||[], 'Countries',20).map(v=>{if(typeof v!=='string'||!countryRE.test(v))error('Country codes must be uppercase two-letter ISO codes.');return v;});
 if(countries.length<1)error('Choose at least one country.');
 if(!['ALL','MALE','FEMALE'].includes(a.gender))error('Choose all genders, men or women.');
 const interestIds=ids(a.interestIds,'Interest IDs');const customAudienceIds=ids(a.customAudienceIds,'Custom Audience IDs');
 if(a.mode==='BROAD'&&(interestIds.length||customAudienceIds.length))error('Broad audience cannot narrow by interest or custom audience. Choose Manual instead.');
 if(a.mode==='ADVANTAGE_PLUS'&&customAudienceIds.length)error('Custom audience inclusion requires Manual audience.');
 if(a.mode==='ADVANTAGE_PLUS'&&a.gender!=='ALL')error('Advantage+ Audience in this builder uses all genders; use eligible Manual targeting if gender restriction is needed.');
 if(category==='employment'){
  if(a.gender!=='ALL')error('Employment ads must include all genders.');
  if(interestIds.length||customAudienceIds.length)error('Employment campaigns cannot use unverified detailed/custom audience targeting in this builder. Use Broad or Advantage+ and verify eligibility in Meta.');
  if(a.mode==='MANUAL')error('Employment targeting must use Broad or Advantage+ in this release; manual targeting is restricted.');
 }
 if(!['AUTOMATIC','MANUAL'].includes(p.mode))error('Choose automatic or manual placements.');
 const placements={mode:p.mode};
 for(const [key,allowed] of Object.entries(allowedPositions)){
  const list=uniqueArray(p[key]||[],`${key} placements`,allowed.length);
  for(const v of list)if(!allowed.includes(v))error(`Unsupported ${key} placement: ${String(v).slice(0,40)}.`);
  placements[key]=[...list];
 }
 const devices=uniqueArray(p.devices||[], 'Device platforms',2);
 if(devices.some(v=>!['mobile','desktop'].includes(v)))error('Device platforms must be mobile or desktop.');
 placements.devices=[...devices];
 if(p.mode==='AUTOMATIC'&&(Object.keys(allowedPositions).some(key=>placements[key].length)||devices.length))error('Automatic placements cannot include manual placement restrictions.');
 if(p.mode==='MANUAL'&&!Object.keys(allowedPositions).some(key=>placements[key].length))error('Select at least one placement or switch to Advantage+ automatic placements.');
 if(!['DEFAULT','REACH','IMPRESSIONS'].includes(d.performance))error('Unsupported performance goal.');
 if(!['LOWEST_COST_WITHOUT_CAP','LOWEST_COST_WITH_BID_CAP','COST_CAP'].includes(d.bidStrategy))error('Unsupported bidding strategy.');
 let bidAmount='';
 if(d.bidStrategy!=='LOWEST_COST_WITHOUT_CAP'){
  const n=Number(d.bidAmount);if(d.bidAmount===''||!Number.isFinite(n)||n<=0||n>100000||Math.abs(n*100-Math.round(n*100))>0.000001)error('Enter a valid positive bid cap or cost cap in account currency (up to two decimals).');
  bidAmount=n.toFixed(2);
 }else if(d.bidAmount!==''&&d.bidAmount!==null&&d.bidAmount!==undefined)error('Remove the bid amount when using lowest cost without a cap.');
 if(d.performance!=='DEFAULT'&&conversion?.type!=='WEBSITE')error('Reach/Impression objective currently requires a Website destination in this builder.');
 if(d.performance!=='DEFAULT'&&conversion?.goal!=='LINK_CLICKS')error('Reach/Impression objective requires the default Website link-click destination setting.');
 let frequencyCap=null;
 if(d.frequencyCap!==null&&d.frequencyCap!==undefined){
  const count=Number(d.frequencyCap.count),days=Number(d.frequencyCap.days);
  if(d.performance!=='REACH')error('Frequency cap requires Awareness / Reach optimization.');
  if(!Number.isInteger(count)||count<1||count>20||!Number.isInteger(days)||days<1||days>90)error('Frequency cap must be 1-20 impressions over 1-90 days.');
  frequencyCap={count,days};
 }
 return{audience:{mode:a.mode,countries,gender:a.gender,interestIds,customAudienceIds},placements,delivery:{performance:d.performance,bidStrategy:d.bidStrategy,bidAmount,frequencyCap}};
}
export function targetingSpec(advanced,allocation){
 const {audience:a,placements:p}=advanced;
 const target={geo_locations:{countries:a.countries},age_min:allocation.ageMin,age_max:allocation.ageMax,targeting_automation:{advantage_audience:a.mode==='ADVANTAGE_PLUS'?1:0}};
 if(a.gender!=='ALL')target.genders=[a.gender==='MALE'?1:2];
 if(a.interestIds.length)target.interests=a.interestIds.map(id=>({id}));
 if(a.customAudienceIds.length)target.custom_audiences=a.customAudienceIds.map(id=>({id}));
 if(p.mode==='MANUAL'){
  const mapping={facebook:'facebook_positions',instagram:'instagram_positions',messenger:'messenger_positions',audience_network:'audience_network_positions'};
  const platforms=Object.keys(mapping).filter(k=>p[k].length);
  target.publisher_platforms=platforms;
  for(const [key,field]of Object.entries(mapping))if(p[key].length)target[field]=p[key];
  if(p.devices.length)target.device_platforms=p.devices;
 }
 return target;
}
export function advancedWarnings(advanced,category){
 const notes=[];
 if(advanced.audience.mode==='ADVANTAGE_PLUS')notes.push('Advantage+ audience uses Meta automation; suggestions are not guaranteed hard targeting restrictions. Meta may change eligibility.');
 if(category==='employment')notes.push('Employment targeting limits apply: all genders, broad ages, and no unverified demographic, interest, custom-audience or exclusion targeting in this builder.');
 if(advanced.placements.mode==='MANUAL')notes.push('Manual placement availability depends on objective, creative format and account. Unsupported Meta placements may be rejected; do not treat selection as guaranteed delivery.');
 if(advanced.delivery.frequencyCap)notes.push('Reach frequency caps require eligible Awareness / Reach delivery and Meta acceptance; this is not a strict guarantee of individual exposure.');
 if(advanced.delivery.bidStrategy!=='LOWEST_COST_WITHOUT_CAP')notes.push('Bid/Cost Cap eligibility and minimums vary by account and objective; Meta validates the bid during paused creation.');
 return notes;
}
