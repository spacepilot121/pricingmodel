import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../client/public/legacy-calculator.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const context = vm.createContext({
  structuredClone, createDefaultLine: () => ({}), applyLineDefaults: value => value,
  QUARTER_LABELS: ['Q1', 'Q2', 'Q3', 'Q4'], parseCurrencyInput: Number,
  calculateCampaignSummaryFromData: () => ({}), createId: () => 'new-copy',
  useCallback: fn => fn,
  h: (type, props, ...children) => ({type, props, children}),
});
vm.runInContext(
  between('    const DEFAULT_PAID_RATES =', '    const SIZE_MULT =') +
  between('    const defaultState =', '    const pricingVariables =') +
  between('    function normalizeCampaignState(', '    // Load the active calculator state') +
  between('    function createCampaignRecord(', '    function exportPricingVariablesToCSV(') +
  between('    function EditorToolbar(', '    function CampaignApp('), context);

assert.equal(vm.runInContext('defaultState.marginGoal', context), 40);
assert.equal(vm.runInContext('defaultState.paidMedia.rate', context), 0.07);
for (const margin of [0, 25, 65]) {
  context.saved = {marginGoal: margin, paidMedia: {rate: 0.06, budget: 1500}, campaignLines: [{}]};
  const normal = vm.runInContext('normalizeCampaignState(saved)', context);
  assert.equal(normal.marginGoal, margin);
  assert.equal(normal.paidMedia.rate, 0.06);
  assert.equal(normal.paidMedia.budget, 1500);
}
const original = {id: 'original', name: 'Original', data: {details: {campaignName: 'Original'}, marginGoal: 25, paidMedia: {rate: 0.06}, campaignLines: [{}]}};
context.campaignsRef = {current: [original]};
context.view = 'editor'; context.activeCampaignId = 'original';
context.state = {...structuredClone(original.data), marginGoal: 33, insightNotes: 'Latest edit'};
let pending, selected, view;
context.setCampaigns = updater => { pending = updater; };
context.setActiveCampaignId = id => { selected = id; };
context.setView = value => { view = value; };
vm.runInContext(between('      const handleDuplicateCampaign =', '      const handleMoveCampaign =') + "handleDuplicateCampaign('original');", context);
assert.equal(selected, 'new-copy'); // Navigation must work before React applies a queued update.
assert.equal(view, 'editor');
const records = pending([original]);
assert.equal(records[0], original);
assert.equal(records.length, 2);
assert.equal(records[1].name, 'Copy of Original');
assert.equal(records[1].data.marginGoal, 33);
assert.equal(records[1].data.paidMedia.rate, 0.06);
assert.equal(records[1].data.insightNotes, 'Latest edit');
records[1].data.paidMedia.rate = 0.09;
assert.equal(original.data.paidMedia.rate, 0.06);
assert.equal(context.state.paidMedia.rate, 0.06);
context.view = 'dashboard';
vm.runInContext("handleDuplicateCampaign('original');", context);
assert.equal(pending([original])[1].data.marginGoal, 25);
let clicked;
context.onDuplicate = id => { clicked = id; };
context.campaign = original;
const toolbar = vm.runInContext('EditorToolbar({campaign, onDuplicate})', context);
const buttons = toolbar.children[0].children[1].children;
const templateIndex = buttons.findIndex(button => button.children[0] === 'Save as Template');
assert.equal(buttons[templateIndex + 1].children[0], 'Duplicate');
buttons[templateIndex + 1].props.onClick();
assert.equal(clicked, 'original');
console.log('PASS New defaults, saved pricing preservation, independent copies, queued navigation and editor button');
