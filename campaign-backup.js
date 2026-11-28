(function (root) {
  'use strict';
  const KEYS = ['pic-campaigns-v2', 'pic-templates-v1', 'precise-influencer-calculator-v1'];
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const hasCampaignLines = value => isObject(value) && (Array.isArray(value.campaignLines) || Array.isArray(value.deliverables));
  function validate(key, raw) {
    if (typeof raw !== 'string') throw new Error('Invalid backup value.');
    const value = JSON.parse(raw);
    if (key === KEYS[0] && (!Array.isArray(value) || value.some(row => !isObject(row) || !hasCampaignLines(row.data ?? row)))) throw new Error('Invalid campaign records.');
    if (key === KEYS[1] && (!Array.isArray(value) || value.some(row => !isObject(row) || !Array.isArray(row.deliverables)))) throw new Error('Invalid templates.');
    if (key === KEYS[2] && !hasCampaignLines(value)) throw new Error('Invalid active campaign.');
    return value;
  }
  function createBackup(storage) {
    const values = {};
    for (const key of KEYS) {
      const raw = storage.getItem(key);
      if (raw !== null) values[key] = raw; // Preserve every field and exact stored bytes.
    }
    return { format: 'precisify-pricing-backup', version: 1, exportedAt: new Date().toISOString(), values };
  }
  function inspectBackup(input) {
    if (!isObject(input) || input.format !== 'precisify-pricing-backup' || input.version !== 1 || !isObject(input.values)) throw new Error('Choose a Precisify pricing backup JSON file.');
    const parsed = {};
    for (const [key, raw] of Object.entries(input.values)) {
      if (!KEYS.includes(key)) throw new Error('This backup contains an unexpected storage key.');
      parsed[key] = validate(key, raw);
    }
    if (!Object.keys(parsed).length) throw new Error('This backup has no saved pricing.');
    return parsed;
  }
  function mergeRecords(existing, incoming, idFactory) {
    const next = [...existing];
    for (const entry of incoming) {
      const sameId = entry.id && next.find(row => row.id === entry.id);
      if (sameId && JSON.stringify(sameId) === JSON.stringify(entry)) continue;
      // A changed campaign with an existing id is recovered as a separate copy.
      next.push(sameId || !entry.id ? { ...entry, id: idFactory(), name: (entry.name || 'Campaign') + ' (restored)' } : entry);
    }
    return next;
  }
  function planRestore(storage, input, idFactory) {
    const parsed = inspectBackup(input);
    const changes = {};
    for (const key of KEYS.slice(0, 2)) {
      if (!parsed[key]) continue;
      const raw = storage.getItem(key);
      const existing = raw === null ? [] : validate(key, raw);
      changes[key] = JSON.stringify(mergeRecords(existing, parsed[key], idFactory));
    }
    if (parsed[KEYS[2]]) {
      if (storage.getItem(KEYS[2]) === null) changes[KEYS[2]] = input.values[KEYS[2]];
      // Also recover the active/legacy campaign into the collection when it was
      // absent from the backup's saved list. Never replace an active local state.
      const collection = JSON.parse(changes[KEYS[0]] || storage.getItem(KEYS[0]) || '[]');
      validate(KEYS[0], JSON.stringify(collection));
      const data = parsed[KEYS[2]];
      if (!collection.some(row => JSON.stringify(row.data ?? row) === JSON.stringify(data))) {
        collection.push({ id: idFactory(), name: (data.name || data.campaignName || 'Active campaign') + ' (restored)', data });
        changes[KEYS[0]] = JSON.stringify(collection);
      }
    }
    return changes;
  }
  function applyRestore(storage, changes) {
    const previous = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
    try { for (const [key, raw] of Object.entries(changes)) storage.setItem(key, raw); }
    catch (error) {
      for (const [key, raw] of Object.entries(previous)) {
        if (raw === null) storage.removeItem(key); else storage.setItem(key, raw);
      }
      throw new Error('Restore could not be saved. Existing pricing was restored. Free browser storage and retry.');
    }
  }
  root.PricingBackup = { KEYS, createBackup, inspectBackup, planRestore, applyRestore };
  if (!root.document) return;
  function download(data, prefix) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '') + '.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function mount(container) {
    if (!container) return;
    if (document.getElementById('pricing-backup-tools')) return;
    const box = document.createElement('section');
    box.id = 'pricing-backup-tools';
    box.style.cssText = 'padding:14px 20px;margin:12px;border:1px solid #8b9cb8;border-radius:10px;background:#fff;color:#17243b;font:14px system-ui;position:relative;z-index:10';
    const title = document.createElement('strong'); title.textContent = 'Pricing backups';
    const description = document.createElement('p');
    description.textContent = 'Campaigns and templates are saved in this browser on this device. Download a backup to keep them or move them to another browser. API keys are excluded. Restoring keeps existing campaigns.';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const exportButton = document.createElement('button'); exportButton.textContent = 'Download pricing backup';
    const importButton = document.createElement('button'); importButton.textContent = 'Restore pricing backup';
    for (const button of [exportButton, importButton]) button.style.cssText = 'padding:8px 12px;margin-right:8px;cursor:pointer;border:1px solid #425479;border-radius:6px';
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
    exportButton.onclick = () => {
      try {
        const backup = createBackup(localStorage);
        if (!Object.keys(backup.values).length) throw new Error('There is no saved pricing in this browser yet.');
        download(backup, 'precisify-pricing'); status.textContent = 'Backup download requested. Keep the JSON file somewhere you can find it again.';
      } catch (error) { status.textContent = error.message; }
    };
    importButton.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      try {
        const file = fileInput.files[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) throw new Error('Backup is too large. Maximum size is 20 MB.');
        const backup = JSON.parse(await file.text());
        const idFactory = () => crypto.randomUUID ? crypto.randomUUID() : 'restored-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const plan = planRestore(localStorage, backup, idFactory);
        if (!root.confirm('Restore these saved campaigns and templates? Existing campaigns stay in place. A backup of your current pricing will download first.')) return;
        download(createBackup(localStorage), 'precisify-before-restore');
        applyRestore(localStorage, plan);
        // Prevent an old in-memory campaign list from writing over the restored list.
        root.location.reload();
      } catch (error) { status.textContent = error.message; }
      finally { fileInput.value = ''; }
    };
    box.append(title, description, exportButton, importButton, fileInput, status);
    container.append(box);
  }
  root.PricingBackup.mount = mount;
  // Only Settings provides this target. Loading the script in a calculator must not add controls there.
  const mountSettings = () => mount(document.getElementById('pricing-backup-settings'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettings); else mountSettings();
})(typeof window === 'undefined' ? globalThis : window);
