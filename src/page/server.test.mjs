import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addJobs, loadState, setMark, setTracking, setTriage } from '../state.mjs';
import { startServer } from './server.mjs';
import { filterJobs, renderRows, toJobs } from './view.mjs';

const sources = [{ name: 'gupy', kind: 'search' }, { name: 'lever', kind: 'company' }];
const id = 'gupy:aurora/vaga-ficticia';
const applied = { status: 'applied', cutReason: null };
const discarded = { status: 'discarded', cutReason: 'Modelo incompatível com a busca fictícia.' };
function job(extra = {}) {
  return {
    source: 'gupy', sourceId: 'aurora/vaga-ficticia', company: 'Aurora Fictícia',
    title: 'Analista de Planejamento', location: 'Cidade Inventada', workModel: 'remote',
    description: 'Descrição fictícia completa.\n\nRequisito no fim: idioma inventado.',
    url: 'https://aurora.example/vaga/ficticia', publishedAt: null, ...extra,
  };
}

async function setup(t, jobs = [job()]) {
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-page-'));
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => server.close()));
    await rm(dataDir, { recursive: true, force: true });
  });
  const options = { dataDir, sources };
  if (jobs.length) await addJobs(jobs, options);
  const open = async (port = 0) => {
    const server = await startServer({ dataDir, port });
    servers.push(server);
    return server;
  };
  return { options, open, server: await open() };
}

function mark(server, value, target = id, headers = {}) {
  return fetch(`${server.url}/api/jobs/${encodeURIComponent(target)}/mark`, {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });
}
async function jobsAt(server) {
  const response = await fetch(`${server.url}/api/jobs`);
  assert.equal(response.status, 200);
  return (await response.json()).jobs;
}

function requestStatus(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, options, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

test('inscrevi, descarte e desfazer sobrevivem a fechar e reabrir; preservam outros blocos', async t => {
  const { options, open, server } = await setup(t, [job(), job({ sourceId: 'outra-vaga' })]);
  await setTriage(id, { fit: 3, reason: 'Exemplo fictício.', alerts: ['Conferir idioma.'] }, options);
  await setTracking(id, { stage: 'conversa', next: null, notes: 'Nota fictícia.' }, options);
  const before = await loadState(options);
  assert.equal((await mark(server, applied)).status, 200);
  assert.equal((await mark(server, discarded, 'gupy:outra-vaga')).status, 200);
  await server.close();
  const reopened = await open();
  const jobs = await jobsAt(reopened);
  assert.equal(jobs.find(entry => entry.id === id).mark.status, 'applied');
  assert.equal(jobs.find(entry => entry.id === 'gupy:outra-vaga').mark.cutReason, discarded.cutReason);
  const disk = JSON.parse(await readFile(join(options.dataDir, 'estado.json'), 'utf8'));
  assert.equal(disk.jobs[id].mark.status, 'applied');
  assert.ok(disk.jobs[id].mark.markedAt);
  for (const block of ['job', 'seen', 'triage', 'tracking']) assert.deepEqual(disk.jobs[id][block], before.jobs[id][block]);
  assert.deepEqual(disk.sources, before.sources);
  assert.equal((await mark(reopened, null)).status, 200);
  await reopened.close();
  assert.equal((await jobsAt(await open())).find(entry => entry.id === id).mark, null);
});

test('descartar sem motivo, motivo vazio ou só espaços é recusado sem alterar o arquivo', async t => {
  const { options, server } = await setup(t);
  const before = await readFile(join(options.dataDir, 'estado.json'), 'utf8');
  for (const cutReason of [undefined, null, '', ' \n ', 1]) {
    const response = await mark(server, { status: 'discarded', cutReason });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /motivo/);
  }
  assert.equal(await readFile(join(options.dataDir, 'estado.json'), 'utf8'), before);
});

test('ID desconhecido e nomes de propriedades herdadas devolvem 404', async t => {
  const { server } = await setup(t);
  for (const target of ['gupy:ausente', '__proto__', 'constructor', '../../estado.json']) {
    assert.equal((await mark(server, applied, target)).status, 404);
  }
});

test('ID com barras, porcentagem e caracteres HTML é dado; alias mantém a chave estável', async t => {
  const sourceId = 'aurora/../%2F/<vaga>"?';
  const { options, server } = await setup(t, [job({ sourceId, applyUrl: 'https://aurora.example/inscricao' })]);
  assert.equal((await mark(server, applied, `gupy:${sourceId}`)).status, 200);
  await addJobs([job({ source: 'lever', sourceId: 'aurora/alias', applyUrl: 'https://aurora.example/inscricao' })], options);
  const response = await mark(server, discarded, 'lever:aurora/alias');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, `gupy:${sourceId}`);
  assert.equal((await jobsAt(server)).length, 1);
});

test('POST de outra origem, origem ausente ou Host forjado é recusado', async t => {
  const { options, server } = await setup(t);
  for (const headers of [
    { Origin: 'https://intruso.example' }, { Origin: 'null' }, { Origin: '' },
    { Origin: `${server.url}.intruso.example` }, { Origin: server.url.replace('http:', 'https:') },
    { Host: 'intruso.example' }, { 'Sec-Fetch-Site': 'cross-site' },
  ]) assert.equal(await requestStatus(`${server.url}/api/jobs/${encodeURIComponent(id)}/mark`, {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json', ...headers },
  }, JSON.stringify(applied)), 403, JSON.stringify(headers));
  const absent = await fetch(`${server.url}/api/jobs/${encodeURIComponent(id)}/mark`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(applied),
  });
  assert.equal(absent.status, 403);
  assert.equal(await requestStatus(server.url, { headers: { Host: 'intruso.example' } }), 403);
  assert.equal((await loadState(options)).jobs[id].mark, null);
});

test('título, descrição, atributos, motivo e erros da fonte saem escapados', async t => {
  const attack = '<img src=x onerror="alert(1)">&\' </script><script>alert(2)</script>';
  const { options, server } = await setup(t, [job({ title: attack, description: attack, company: attack, location: attack })]);
  await setMark(id, { status: 'discarded', cutReason: attack }, options);
  await setTriage(id, { fit: 4, reason: attack, alerts: [attack] }, options);
  await addJobs([], { ...options, runs: [{ source: 'gupy', errors: [{ target: attack, step: 'busca', message: attack }] }] });
  const response = await fetch(server.url);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(!html.includes(attack));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;/);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const rendered = renderRows([{ ...(await jobsAt(server))[0], job: { ...job(), url: 'javascript:alert(1)' } }]);
  assert.ok(!rendered.includes('href="javascript:'));
});

test('corpo acima de 16 KiB é recusado com Content-Length e com transferência em partes', async t => {
  const { options, server } = await setup(t);
  assert.equal((await mark(server, { ...discarded, cutReason: 'á'.repeat(9000) })).status, 413);
  const status = await new Promise((resolve, reject) => {
    const outgoing = request(`${server.url}/api/jobs/${encodeURIComponent(id)}/mark`, {
      method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' },
    }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    outgoing.on('error', reject);
    outgoing.write('{"status":"discarded","cutReason":"');
    outgoing.write('a'.repeat(17000));
    outgoing.end('"}');
  });
  assert.equal(status, 413);
  assert.equal((await loadState(options)).jobs[id].mark, null);
  assert.equal((await mark(server, applied)).status, 200);
});

test('JSON inválido, tipo incorreto e formato inesperado não gravam', async t => {
  const { server } = await setup(t);
  for (const value of [{}, [], 'applied', 1, { ...applied, tracking: {} }, { ...applied, cutReason: 'motivo' }]) {
    assert.equal((await mark(server, value)).status, 400);
  }
  assert.equal((await mark(server, applied, id, { 'Content-Type': 'text/plain' })).status, 415);
  const bad = await fetch(`${server.url}/api/jobs/${encodeURIComponent(id)}/mark`, {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(bad.status, 400);
  const malformedId = await fetch(`${server.url}/api/jobs/%XX/mark`, {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: 'null',
  });
  assert.equal(malformedId.status, 400);
});

test('servidor relê o estado em cada GET e mantém possíveis duplicatas visíveis', async t => {
  const { options, server } = await setup(t);
  assert.equal((await jobsAt(server)).length, 1);
  await addJobs([job({ source: 'lever', sourceId: 'aurora/outra', publishedAt: '2026-09-30' })], options);
  await setMark(id, applied, options);
  const jobs = await jobsAt(server);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every(entry => entry.possibleDuplicate));
  assert.equal(jobs[0].job.source, 'lever');
  assert.equal(jobs.find(entry => entry.id === id).mark.status, 'applied');
  const html = await (await fetch(server.url)).text();
  assert.equal((html.match(/Possível duplicata/g) ?? []).length, 2);
  assert.match(html, /Inscrita/);
  assert.match(html, /Não informada/);
});

test('filtros combinam situação e busca sem acentos, incluindo a descrição inteira', async t => {
  const { options } = await setup(t, [job(), job({ sourceId: 'segunda', title: 'Gestão Fictícia' }), job({ sourceId: 'terceira' })]);
  await setMark('gupy:segunda', applied, options);
  await setMark('gupy:terceira', discarded, options);
  const jobs = toJobs(await loadState(options));
  assert.equal(filterJobs(jobs, 'new', 'aurora idioma inventado').length, 1);
  assert.equal(filterJobs(jobs, 'applied', 'gestao').length, 1);
  assert.equal(filterJobs(jobs, 'discarded', 'incompativel').length, 1);
  assert.equal(filterJobs(jobs, 'all', '').length, 3);
  assert.equal(filterJobs(jobs, 'new', 'ausente').length, 0);
});

test('estado vazio orienta a coleta; recursos são locais e rotas não expõem arquivos', async t => {
  const { server } = await setup(t, []);
  const html = await (await fetch(server.url)).text();
  assert.match(html, /Nenhuma vaga coletada ainda/);
  assert.match(html, /rode a coleta no terminal/);
  assert.match(html, /lang="pt-BR"/);
  assert.deepEqual(await jobsAt(server), []);
  assert.ok(!/(?:src|href)="https?:/.test(html));
  for (const path of ['/page.css', '/page.mjs', '/view.mjs']) assert.equal((await fetch(server.url + path)).status, 200);
  for (const path of ['/estado.json', '/state.mjs', '/api/jobs/ausente', '/%2e%2e%2fstate.mjs']) {
    assert.equal((await fetch(server.url + path)).status, 404);
  }
});

test('estado corrompido retorna erro sem sobrescrever ou divulgar conteúdo', async t => {
  const { options, server } = await setup(t);
  const path = join(options.dataDir, 'estado.json');
  await writeFile(path, '{conteudo ficticio invalido');
  for (const route of ['/', '/api/jobs']) {
    const response = await fetch(server.url + route);
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes('conteudo ficticio invalido'));
  }
  assert.equal((await mark(server, applied)).status, 500);
  assert.equal(await readFile(path, 'utf8'), '{conteudo ficticio invalido');
});

test('porta ocupada cai para outra porta e close pode ser repetido', async t => {
  const { open } = await setup(t, []);
  const occupied = createServer();
  await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const server = await open(occupied.address().port);
  const url = new URL(server.url);
  assert.equal(url.hostname, '127.0.0.1');
  assert.notEqual(Number(url.port), occupied.address().port);
  assert.equal((await fetch(server.url)).status, 200);
  await server.close();
  await server.close();
});

test('porta inválida é rejeitada antes de iniciar', async () => {
  for (const port of [-1, 65536, 1.5, '4317']) await assert.rejects(startServer({ port }), /porta/);
});

test('tracking grava via alias, persiste ao reabrir e preserva os outros blocos', async t => {
  const { options, server, open } = await setup(t, [job({ applyUrl: 'https://aurora.example/inscricao' })]);
  await setMark(id, applied, options);
  await setTriage(id, { fit: 5, reason: 'Motivo fictício.', alerts: ['Idioma.'] }, options);
  await addJobs([job({ source: 'lever', sourceId: 'alias', applyUrl: 'https://aurora.example/inscricao' })], options);
  const before = (await loadState(options)).jobs[id];
  const tracking = { stage: 'Entrevista', next: 'Preparar casos.', notes: '<script>fictício</script>' };
  const response = await fetch(`${server.url}/api/jobs/${encodeURIComponent('lever:alias')}/tracking`, {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: JSON.stringify(tracking),
  });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.id, id);
  assert.deepEqual(saved.tracking, { ...tracking, updatedAt: saved.tracking.updatedAt });
  assert.ok(saved.tracking.updatedAt);
  await server.close();
  const reopened = await open();
  const entry = (await jobsAt(reopened))[0];
  for (const block of ['job', 'seen', 'triage', 'mark']) assert.deepEqual(entry[block], before[block]);
  assert.deepEqual(entry.tracking, saved.tracking);
  const html = await (await fetch(reopened.url)).text();
  assert.match(html, /Etapa: Entrevista/);
  assert.match(html, /Próximo passo: Preparar casos\./);
  assert.match(html, /&lt;script&gt;fictício&lt;\/script&gt;/);
  assert.match(html, /<form data-tracking>/);
  await setMark(id, null, options);
  assert.ok(!(await (await fetch(reopened.url)).text()).includes('<form data-tracking>'));
});

test('tracking compartilha proteção de origem, Host, JSON e tamanho; entradas inválidas não gravam', async t => {
  const { options, server } = await setup(t);
  const url = `${server.url}/api/jobs/${encodeURIComponent(id)}/tracking`;
  const headers = { Origin: server.url, 'Content-Type': 'application/json' };
  for (const patch of [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://intruso.example' },
    { Host: 'intruso.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal(await requestStatus(url, { method: 'POST', headers: { ...headers, ...patch } }, '{"stage":"Entrevista"}'), 403);
  }
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  for (const value of [null, [], {}, { stage: ' ' }, { stage: 2 }, { stage: 'Etapa', next: 2 },
    { stage: 'Etapa', notes: null }, { stage: 'Etapa', fit: 5 }]) {
    assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(value) })).status, 400);
  }
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ stage: 'a'.repeat(17000) }) })).status, 413);
  for (const target of ['gupy:ausente', '__proto__', '../../estado.json']) {
    assert.equal((await fetch(`${server.url}/api/jobs/${encodeURIComponent(target)}/tracking`, {
      method: 'POST', headers, body: '{"stage":"Etapa"}',
    })).status, 404);
  }
  assert.equal((await loadState(options)).jobs[id].tracking, null);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"stage":"Etapa"}' })).status, 200);
  assert.equal((await loadState(options)).jobs[id].tracking.next, null);
});

test('ordenação prioriza estrelas, depois publicação e coleta; sem triagem fica no fim', async t => {
  const { options } = await setup(t, [job({ sourceId: 'sem', publishedAt: '2026-10-02' }),
    job({ sourceId: 'alta', publishedAt: '2026-09-01' }), job({ sourceId: 'nova', publishedAt: '2026-10-01' }),
    job({ sourceId: 'antiga', publishedAt: '2026-09-20' }), job({ sourceId: 'sem-data' })]);
  for (const [target, fit] of [['alta', 5], ['nova', 3], ['antiga', 3], ['sem-data', 3]]) {
    await setTriage(`gupy:${target}`, { fit, reason: 'Motivo fictício.', alerts: ['Alerta fictício.'] }, options);
  }
  const jobs = toJobs(await loadState(options));
  assert.deepEqual(jobs.map(entry => entry.job.sourceId), ['alta', 'nova', 'antiga', 'sem-data', 'sem']);
  const html = renderRows(jobs);
  assert.match(html, /★★★★★/);
  assert.match(html, /Motivo fictício/);
  assert.match(html, /Alerta da triagem: Alerta fictício/);
});
