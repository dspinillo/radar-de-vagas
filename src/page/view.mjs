const models = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' };
const statuses = { applied: 'Inscrita', discarded: 'Descartada' };

// Único ponto de interpolação de texto externo em HTML, incluindo atributos.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch { return '#'; }
}

function dateLabel(value) {
  if (!value) return 'Não informada';
  return value.slice(0, 10).split('-').reverse().join('/');
}

export function toJobs(state) {
  const counts = new Map();
  for (const entry of Object.values(state.jobs)) {
    counts.set(entry.seen.dedupKey, (counts.get(entry.seen.dedupKey) ?? 0) + 1);
  }
  return Object.entries(state.jobs).map(([id, entry]) => ({
    id, ...entry, possibleDuplicate: counts.get(entry.seen.dedupKey) > 1,
  })).sort((a, b) => (b.job.publishedAt ?? '').localeCompare(a.job.publishedAt ?? '') ||
    b.seen.firstSeenAt.localeCompare(a.seen.firstSeenAt) || a.id.localeCompare(b.id));
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterJobs(jobs, status, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return jobs.filter(entry => {
    if (status !== 'all' && (entry.mark?.status ?? 'new') !== status) return false;
    const text = normalize([entry.job.company, entry.job.title, entry.job.location,
      models[entry.job.workModel], entry.job.source, entry.job.description,
      entry.mark?.cutReason, entry.triage?.reason, ...(entry.triage?.alerts ?? [])].join(' '));
    return terms.every(term => text.includes(term));
  });
}

export function renderRows(jobs) {
  return jobs.map(({ id, job, seen, mark, triage, possibleDuplicate }) => {
    const key = escapeHtml(id);
    return `<tr data-id="${key}">
      <td class="company">${escapeHtml(job.company)}</td>
      <th scope="row" class="vacancy"><strong>${escapeHtml(job.title)}</strong>
        <details><summary>Descrição completa</summary><p class="description">${escapeHtml(job.description)}</p></details>
      </th>
      <td>${escapeHtml(job.location ?? 'Não informado')}</td>
      <td>${escapeHtml(models[job.workModel] ?? 'Não informado')}</td>
      <td>${escapeHtml(job.source)}</td>
      <td class="date">${escapeHtml(dateLabel(job.publishedAt))}</td>
      <td class="date">${escapeHtml(dateLabel(seen.firstSeenAt))}</td>
      <td class="reason">${triage ? `<span class="fit" aria-label="Encaixe: ${triage.fit} de 5">${'★'.repeat(triage.fit)}${'☆'.repeat(5 - triage.fit)}</span><p>${escapeHtml(triage.reason)}</p>${triage.alerts.map(alert => `<p class="warning">Alerta da triagem: ${escapeHtml(alert)}</p>`).join('')}` : '<span class="muted">Ainda sem triagem</span>'}
        ${possibleDuplicate ? '<p class="warning">Possível duplicata · empresa e título semelhantes em outra linha.</p>' : ''}
      </td>
      <td><a href="${safeLink(job.url)}" target="_blank" rel="noopener noreferrer">Abrir anúncio<span class="sr-only">: ${escapeHtml(job.title)}</span></a></td>
      <td class="decision"><span class="status">${statuses[mark?.status] ?? 'Nova'}</span>
        ${mark ? `<p>${escapeHtml(mark.cutReason ?? 'Candidatura registrada.')}</p><button type="button" data-action="undo">Desfazer marcação</button>` : `<div class="actions"><button type="button" data-action="apply">Inscrevi</button><button type="button" data-action="discard">Descartar</button></div>
        <form hidden><label>Motivo do descarte<textarea name="cutReason" required rows="2" maxlength="2000" placeholder="O que não combina com sua busca?"></textarea></label><div class="actions"><button type="submit">Confirmar descarte</button><button type="button" data-action="cancel">Cancelar</button></div></form>`}
      </td>
    </tr>`;
  }).join('');
}

export function renderSourceErrors(sources) {
  const errors = Object.entries(sources).flatMap(([name, run]) => run.errors.map(error =>
    `<li>${escapeHtml(name)} · ${escapeHtml(error.target)}: ${escapeHtml(error.message)}</li>`));
  return errors.length ? `<details class="source-errors"><summary>Algumas fontes tiveram falhas na última coleta (${errors.length})</summary><ul>${errors.join('')}</ul><p>As vagas já coletadas continuam disponíveis. Tente rodar a coleta novamente.</p></details>` : '';
}

export function renderPage(jobs, sources) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar de Vagas</title><link rel="stylesheet" href="/page.css"><script type="module" src="/page.mjs"></script></head>
<body><a class="skip-link" href="#radar">Pular para as vagas</a><main>
<header><div><h1>Radar de Vagas</h1><p>Compare as vagas. A decisão é sua.</p></div><label class="theme-label">Tema<select id="theme"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label></header>
<section class="toolbar" aria-label="Filtrar vagas"><label class="search-label">Buscar nas vagas<input id="search" type="search" placeholder="Empresa, título, local ou descrição" autocomplete="off"></label>
<label>Situação<select id="status"><option value="all">Todas</option><option value="new">Novas</option><option value="applied">Inscritas</option><option value="discarded">Descartadas</option></select></label><button id="refresh" type="button">Atualizar vagas</button></section>
<p id="feedback" role="status" aria-live="polite"></p><div id="source-errors">${renderSourceErrors(sources)}</div>
<section id="radar" aria-label="Vagas coletadas"><p id="count" class="count" aria-live="polite">${jobs.length} ${jobs.length === 1 ? 'vaga' : 'vagas'}</p>
<div id="empty" class="empty"${jobs.length ? ' hidden' : ''}><h2>Nenhuma vaga coletada ainda</h2><p>Configure sua busca e rode a coleta no terminal. Depois, clique em Atualizar vagas.</p></div>
<p id="no-results" hidden>Nenhuma vaga com esses filtros. Tente outra busca ou selecione Todas.</p>
<p id="scroll-hint" class="scroll-hint"${jobs.length ? '' : ' hidden'}>Deslize a tabela para os lados para ver os detalhes e as ações.</p>
<div id="table-wrap" class="table-wrap" tabindex="0" role="region" aria-label="Tabela de vagas, com rolagem horizontal"${jobs.length ? '' : ' hidden'}>
<table><caption class="sr-only">Vagas ordenadas pela publicação mais recente; datas desconhecidas aparecem ao final.</caption><thead><tr><th scope="col">Empresa</th><th scope="col">Título</th><th scope="col">Local</th><th scope="col">Modelo</th><th scope="col">Fonte</th><th scope="col">Publicação</th><th scope="col">Primeira vez vista</th><th scope="col">Encaixe e motivo</th><th scope="col">Anúncio</th><th scope="col">Sua decisão</th></tr></thead>
<tbody id="jobs">${renderRows(jobs)}</tbody></table></div></section>
<noscript><p>Ative o JavaScript para buscar, filtrar e registrar suas decisões.</p></noscript>
<footer>Dados locais · Inscrevi registra uma candidatura que você já enviou.</footer>
</main></body></html>`;
}
