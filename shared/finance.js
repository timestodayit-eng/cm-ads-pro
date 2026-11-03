// Meta `balance` is a billing field, not a universally spendable cash balance.
// Do not merge prepaid funds, unpaid bills and spend-cap headroom.
export function nullableNumber(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
export function normalizeBilling(raw,currency,syncedAt){
 const divisor=['USD','BDT'].includes(currency)?100:null;
 const minor=v=>/^\d+$/.test(String(v??''))&&Number.isSafeInteger(Number(v))?Number(v):null;
 const balance=minor(raw.balance),cap=minor(raw.spend_cap),spent=minor(raw.amount_spent);
 const prepay=typeof raw.is_prepay_account==='boolean'?raw.is_prepay_account:null;
 return {currency,syncedAt,isPrepay:prepay,balanceMinor:balance,spendCapMinor:cap,amountSpentAgainstCapMinor:spent,
  reportedBalance:divisor&&balance!==null?balance/divisor:null,
  billAmountDue:divisor&&balance!==null&&prepay!==true?balance/divisor:null,
  prepaidFunds:null,
  spendCapRemaining:divisor&&cap!==null&&cap>0&&spent!==null?Math.max(0,cap-spent)/divisor:null,
  balanceMeaning:prepay===true?'prepaid_balance_semantics_unverified':'bill_amount_due',
  note:prepay===true?'Prepaid available funds are not verified by this integration. See Meta Billing.':'Meta balance is the bill amount due, not available funds.',
  currencySupported:!!divisor};
}
export function aggregateFinance(accounts){
 const groups=new Map();
 for(const a of accounts){
  if(!groups.has(a.currency))groups.set(a.currency,{currency:a.currency,selected:0,todayKnown:0,yesterdayKnown:0,balanceKnown:0,capKnown:0,prepaidKnown:0,todaySpend:null,yesterdaySpend:null,billAmountDue:null,spendCapRemaining:null,prepaidFunds:null,staleAccounts:0,partial:false});
  const g=groups.get(a.currency);g.selected++;if(a.stale)g.staleAccounts++;
  for(const [value,count,n] of [['todaySpend','todayKnown',a.today?.spend],['yesterdaySpend','yesterdayKnown',a.yesterday?.spend],['billAmountDue','balanceKnown',a.billing?.billAmountDue],['spendCapRemaining','capKnown',a.billing?.spendCapRemaining],['prepaidFunds','prepaidKnown',a.billing?.prepaidFunds]]){
   const v=nullableNumber(n);if(v!==null){g[value]=(g[value]??0)+v;g[count]++;}
  }
 }
 return [...groups.values()].map(g=>({...g,partial:g.todayKnown<g.selected||g.balanceKnown<g.selected||g.staleAccounts>0}));
}
