import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPublishing, metaCampaignForm, metaAdsetForm } from '../shared/publishing.js';

test('ABO campaign has no campaign-level budget or bid strategy', () => {
  const { plan } = previewPublishing({
    name: 'Company information', currency: 'USD', category: 'employment',
    baseBudget: 10, increment: 0, budgetScope: 'PER_ADSET',
    conversion: { type: 'CALL', goal: 'CALLS', phone: '+8801969918811' },
    contents: [{ id: 'a', mediaAssetId: '00000000-0000-4000-8000-000000000001', title: 'Video 1', caption: 'Company information', headline: 'Learn more', cta: 'CALL_NOW' }],
    targets: [{ accountId: 'act_12345', ageMin: 18, ageMax: 65 }]
  });
  const campaign = metaCampaignForm(plan, 'test');
  assert.equal(campaign.status, 'PAUSED');
  assert.equal(campaign.is_adset_budget_sharing_enabled, false);
  for (const key of ['daily_budget', 'lifetime_budget', 'bid_strategy']) assert.equal(Object.hasOwn(campaign, key), false, `${key} is forbidden on ABO campaign`);
  const adset = metaAdsetForm(plan, plan.allocations[0], plan.contents[0], '123', 0);
  assert.equal(adset.daily_budget, 1000);
  assert.equal(adset.bid_strategy, 'LOWEST_COST_WITHOUT_CAP');
});
