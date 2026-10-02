import { filterJobs, renderRows, renderSourceErrors } from './view.mjs';

const select = selector => document.querySelector(selector);
const feedback = select('#feedback');
let jobs = [];
let loading;
let saving = false;

function render() {
  const visible = filterJobs(jobs, select('#status').value, select('#search').value);
  select('#jobs').innerHTML = renderRows(visible);
  select('#source-errors').innerHTML = renderSourceErrors(currentSources);
  select('#count').textContent = `${visible.length} de ${jobs.length} ${jobs.length === 1 ? 'vaga' : 'vagas'}`;
  select('#empty').hidden = jobs.length !== 0;
  select('#no-results').hidden = jobs.length === 0 || visible.length !== 0;
  select('#table-wrap').hidden = visible.length === 0;
  select('#scroll-hint').hidden = visible.length === 0;
}

let currentSources = {};

async function refresh() {
  if (loading) return loading;
  select('#refresh').disabled = true;
  loading = (async () => {
    const response = await fetch('/api/jobs', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar as vagas. Confira o servidor e tente atualizar.');
    const data = await response.json();
    jobs = data.jobs;
    currentSources = data.sources;
    render();
  })();
  try { await loading; }
  finally { loading = null; select('#refresh').disabled = false; }
}

function report(error) { feedback.textContent = error.message; }

async function mark(row, value, block = 'mark') {
  if (saving) return;
  saving = true;
  const label = row.querySelector('strong').textContent;
  const controls = [...document.querySelectorAll('#jobs button, #jobs textarea, #jobs input, #status, #search, #refresh')];
  controls.forEach(control => { control.disabled = true; });
  const labelSaved = block === 'tracking' ? 'Acompanhamento salvo' : value === null ? 'Marcação desfeita' : 'Decisão salva';
  feedback.textContent = 'Salvando…';
  let saved = false;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(row.dataset.id)}/${block}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar. Tente novamente.');
    saved = true;
    // Um GET iniciado antes do POST pode conter a marcação antiga.
    if (loading) await loading.catch(() => {});
    await refresh();
    feedback.textContent = `${labelSaved}: ${label}.`;
    const focusTarget = select('#table-wrap').hidden ? select('#status') : select('#table-wrap');
    focusTarget.disabled = false;
    focusTarget.focus();
  } catch (error) {
    if (saved) feedback.textContent = `${labelSaved}, mas a lista não foi atualizada. Clique em Atualizar vagas.`;
    else report(error);
  } finally {
    saving = false;
    controls.forEach(control => { control.disabled = false; });
  }
}

select('#jobs').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || saving) return;
  const row = button.closest('tr');
  if (button.dataset.action === 'copy-id') {
    try {
      await navigator.clipboard.writeText(row.dataset.id);
      feedback.textContent = `Identificador copiado: ${row.dataset.id}.`;
    } catch { feedback.textContent = 'Não foi possível copiar. Selecione o identificador na linha e copie manualmente.'; }
    return;
  }
  const form = row.querySelector('form');
  if (button.dataset.action === 'apply') void mark(row, { status: 'applied', cutReason: null });
  if (button.dataset.action === 'undo') void mark(row, null);
  if (button.dataset.action === 'discard') { form.hidden = false; form.elements.cutReason.focus(); }
  if (button.dataset.action === 'cancel') { form.hidden = true; row.querySelector('[data-action="discard"]').focus(); }
});

select('#jobs').addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.hasAttribute('data-tracking')) {
    const { stage, next, notes } = event.target.elements;
    stage.setCustomValidity(stage.value.trim() ? '' : 'Informe a etapa.');
    if (event.target.reportValidity()) void mark(event.target.closest('tr'), {
      stage: stage.value.trim(), next: next.value.trim() || null, notes: notes.value,
    }, 'tracking');
    return;
  }
  const field = event.target.elements.cutReason;
  field.setCustomValidity(field.value.trim() ? '' : 'Escreva o motivo para descartar.');
  if (event.target.reportValidity()) void mark(event.target.closest('tr'), { status: 'discarded', cutReason: field.value.trim() });
});
select('#jobs').addEventListener('input', event => event.target.setCustomValidity?.(''));
select('#search').addEventListener('input', render);
select('#status').addEventListener('change', render);
select('#refresh').addEventListener('click', () => {
  feedback.textContent = 'Atualizando vagas…';
  refresh().then(() => { feedback.textContent = 'Vagas atualizadas.'; }).catch(report);
});
select('#theme').addEventListener('change', event => {
  document.documentElement.dataset.theme = event.target.value;
  try { localStorage.setItem('radar-theme', event.target.value); } catch { /* Tema funciona sem armazenamento. */ }
});
try {
  const theme = localStorage.getItem('radar-theme');
  if (['system', 'light', 'dark'].includes(theme)) {
    select('#theme').value = theme;
    document.documentElement.dataset.theme = theme;
  }
} catch { /* Mantém o tema do sistema. */ }
refresh().catch(report);
