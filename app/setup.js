'use strict';

const api = window.connectionSetup;
const apps = document.getElementById('apps');
const summary = document.getElementById('summary');
const status = document.getElementById('status');
const form = document.getElementById('setup');
const save = document.getElementById('save');
const close = document.getElementById('close');

function show(integrations, useDefaults) {
  apps.replaceChildren();
  const detected = integrations.filter(item => item.detected).length;
  summary.textContent = detected === 0 ? 'No supported local apps detected.' :
    `${detected} supported local app${detected === 1 ? '' : 's'} detected.`;

  for (const item of integrations) {
    const row = document.createElement('label');
    row.className = 'app-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    checkbox.disabled = !item.available || (!item.detected && !item.connected);
    checkbox.checked = Boolean(item.connected || (useDefaults && item.detected && item.available && item.selected !== false));
    const name = document.createElement('span');
    name.className = 'app-name';
    name.textContent = item.label;
    const detail = document.createElement('span');
    detail.className = 'app-detail';
    detail.textContent = item.reason || (item.connected ? 'Connected' : item.detected ? 'Ready to connect' : 'App not detected');
    const text = document.createElement('span');
    text.append(name, detail);
    row.append(checkbox, text);
    apps.append(row);
  }
  save.disabled = !apps.querySelector('input:enabled');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  save.disabled = close.disabled = true;
  status.textContent = '';
  try {
    const selected = [...apps.querySelectorAll('input:checked')].map(input => input.value);
    const result = await api.save(selected);
    show(result.integrations, false);
    status.textContent = result.results.filter(item => !item.ok)
      .map(item => `${item.label || item.id} — ${item.reason || 'Could not save this connection.'}`).join('\n');
  } catch {
    status.textContent = 'Could not save the app selections. Try opening App connections again.';
    save.disabled = false;
  } finally { close.disabled = false; }
});

close.addEventListener('click', async () => {
  try { await api.close(); }
  catch { status.textContent = 'Could not close setup. Use the window close button.'; }
});

api.list().then(data => {
  close.textContent = data.firstRun ? 'Continue without connecting' : 'Close';
  if (data.reason) {
    summary.textContent = data.reason;
    return;
  }
  show(data.integrations, data.firstRun);
}).catch(() => { summary.textContent = 'App detection could not finish. Open App connections to try again.'; });
