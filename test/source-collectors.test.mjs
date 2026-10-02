import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sources } from '../src/sources/index.mjs';
import { validateJob } from '../src/job.mjs';
import { validateSearch, loadSearch, initializeDataDir } from '../src/data-dir.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFetch, USER_AGENT } from '../src/network.mjs';
const fixture = async name => readFile(new URL(`./fixtures/sources/${name}`, import.meta.url), 'utf8');
const data = JSON.parse(await fixture('responses.json'));
const gupyDetail = await fixture('gupy-detail.html');
const linkedinList = await fixture('linkedin-list.html');
const linkedinDetail = await fixture('linkedin-detail.html');
const search = { termos: ['planejamento'], localidade: null, modelo: null, idadeMaximaDias: null,
  fontes: { gupy: true, linkedin: true }, empresas: { greenhouse: ['aurora'], lever: ['nebulosa'], ashby: ['orbita'], inhire: ['constelacao'] } };
const respond = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const sourceByName = name => sources.find(source => source.name === name);
function harness(name, replies) {
  const calls = [], waits = [];
  const queue = [...(replies ?? (name === 'gupy' ? [data.gupy, gupyDetail] : name === 'linkedin' ? [linkedinList, linkedinDetail, ''] : name === 'inhire' ? [data.inhire, data.inhireDetail] : [data[name]]))];
  return { calls, waits, ctx: { search: structuredClone(search), sleep: async ms => waits.push(ms), fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    assert.ok(queue.length, `Chamada inesperada: ${url}`);
    const response = queue.shift();
    if (response instanceof Error) throw response;
    return response instanceof Response ? response : respond(response);
  } } };
}
for (const source of sources) {
  test(`${source.name}: caminho feliz, descrição inteira, contrato e rede identificável`, async () => {
    const h = harness(source.name);
    const result = await source.collect(h.ctx);
    assert.deepEqual(result.errors, []);
    assert.equal(result.jobs.length, 1);
    const job = result.jobs[0];
    assert.deepEqual(validateJob(job), []);
    assert.ok(job.description.includes(source.name === 'lever' ? 'Faixa fictícia: 10 moedas.' : 'Requisito final:'));
    if (['lever', 'ashby'].includes(source.name)) assert.ok(job.description.includes('a<b and c > d'));
    if (source.kind === 'company') assert.ok(job.sourceId.startsWith(search.empresas[source.name][0] + '/'));
    assert.ok(h.calls.every(call => call.options.headers.get('User-Agent') === USER_AGENT && call.options.signal));
    if (source.name === 'inhire') assert.ok(h.calls.every(call => call.options.headers.get('X-Tenant') === 'constelacao'));
  });
  for (const [label, response] of [['erro HTTP', () => respond({}, 404)], ['resposta malformada', () => respond('<html>quebrado</html>')], ['falha de rede', () => new Error('socket failure')]]) {
    test(`${source.name}: ${label} vira aviso em português`, async () => {
      const h = harness(source.name, [response()]);
      const result = await source.collect(h.ctx);
      assert.equal(result.jobs.length, 0);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].message, /fonte|malformada/);
      assert.equal(result.errors[0].step, 'busca');
    });
  }
  test(`${source.name}: timeout não lança exceção`, async () => {
    const result = await source.collect({ search, timeoutMs: 10, fetch: async () => new Promise(() => {}) });
    assert.equal(result.jobs.length, 0);
    assert.match(result.errors[0].message, /Tempo limite/);
  });
  test(`${source.name}: vaga conhecida não busca detalhe`, async () => {
    const h = harness(source.name, source.name === 'linkedin' ? [linkedinList, ''] : [data[source.name]]);
    const ids = { gupy: 'gp-101', linkedin: '50101', greenhouse: 'aurora/gh-101', lever: 'nebulosa/lv-101', ashby: 'orbita/as-101', inhire: 'constelacao/ih-101' };
    const result = await source.collect({ ...h.ctx, known: new Set([ids[source.name]]) });
    assert.deepEqual(result, { jobs: [], errors: [], observed: [ids[source.name]] });
    assert.equal(h.calls.length, source.name === 'linkedin' ? 2 : 1);
  });
}

test('LinkedIn desligado por padrão, ausência e false nunca acessam rede', async () => {
  const source = sourceByName('linkedin');
  assert.equal(source.defaultEnabled, false);
  for (const config of [undefined, {}, { fontes: { linkedin: false } }]) {
    let calls = 0;
    assert.deepEqual(await source.collect({ search: config, fetch: async () => { calls++; throw new Error(); } }), { jobs: [], errors: [] });
    assert.equal(calls, 0);
  }
});

test('LinkedIn espera entre todas as chamadas, inclusive termos e detalhes', async () => {
  const h = harness('linkedin', [linkedinList, linkedinDetail, '', '']);
  h.ctx.search.termos.push('cenários');
  const result = await sourceByName('linkedin').collect(h.ctx);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(h.waits, [1000, 1000, 1000]);
  assert.ok(h.calls.every(call => call.options.redirect === 'manual'));
});
for (const status of [302, 401, 403, 429, 999]) {
  test(`LinkedIn interrompe todos os termos no primeiro HTTP ${status}`, async () => {
    const response = status === 999 ? { ok: false, status, text: async () => '' } : respond('', status);
    let calls = 0;
    const result = await sourceByName('linkedin').collect({ search: { ...search, termos: ['um', 'dois'] }, fetch: async () => { calls++; return response; } });
    assert.equal(calls, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /bloqueio/);
  });
}
test('LinkedIn bloqueado no detalhe para imediatamente e conserva vagas anteriores', async () => {
  const h = harness('linkedin', [linkedinList.replace('</li>', '</li>' + linkedinList.replaceAll('50101', '50102')), linkedinDetail, '<html><form action="/checkpoint/challenge">captcha</form></html>']);
  h.ctx.search.termos.push('outro');
  const result = await sourceByName('linkedin').collect(h.ctx);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(h.calls.length, 3);
});

test('Gupy pagina usando offset, reúne seções e não usa resumo', async () => {
  const first = { data: Array.from({ length: 100 }, () => data.gupy.data[0]), pagination: { total: 100 } };
  const second = structuredClone(data.gupy); second.data[0].id = 'gp-102'; second.pagination.total = 2;
  const h = harness('gupy', [first, gupyDetail, second, gupyDetail]);
  const result = await sourceByName('gupy').collect(h.ctx);
  assert.deepEqual(result.errors, []);
  assert.equal(result.jobs.length, 2);
  assert.ok(h.calls[2].url.includes('offset=100'));
  assert.match(result.jobs[0].description, /Desenhar cenários/);
  assert.ok(!result.jobs[0].description.includes('Resumo'));
});
test('Lever pagina em lotes de 100 e preserva listas e rodapé', async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ ...data.lever[0], id: `lv-${index}` }));
  const h = harness('lever', [first, data.lever]);
  const result = await sourceByName('lever').collect(h.ctx);
  assert.deepEqual(result.errors, []);
  assert.equal(result.jobs.length, 101);
  assert.ok(h.calls[1].url.includes('skip=100'));
  assert.match(result.jobs[0].description, /Idioma inventado/);
  assert.match(result.jobs[0].description, /Última condição/);
});
test('LinkedIn pagina e deduplica entre páginas', async () => {
  const h = harness('linkedin', [linkedinList, linkedinDetail, linkedinList.replaceAll('50101', '50102'), linkedinDetail, '']);
  const result = await sourceByName('linkedin').collect(h.ctx);
  assert.equal(result.jobs.length, 2);
  assert.deepEqual(result.errors, []);
  assert.ok(h.calls[2].url.includes('start=1'));
});
for (const name of ['gupy', 'linkedin', 'lever']) {
  test(`${name}: página repetida encerra com aviso`, async () => {
    const repeated = name === 'gupy' ? { data: Array.from({ length: 100 }, () => data.gupy.data[0]), pagination: { total: 100 } } : name === 'lever' ? Array.from({ length: 100 }, () => data.lever[0]) : linkedinList;
    const h = harness(name, name === 'lever' ? [repeated, repeated] : [repeated, name === 'gupy' ? gupyDetail : linkedinDetail, repeated]);
    const result = await sourceByName(name).collect(h.ctx);
    assert.equal(result.jobs.length, 1);
    assert.match(result.errors[0].message, /Paginação repetida/);
  });
}
for (const name of ['greenhouse', 'lever']) {
  test(`${name}: descrição ausente na lista exige detalhe`, async () => {
    const listing = structuredClone(data[name]);
    if (name === 'greenhouse') delete listing.jobs[0].content; else delete listing[0].descriptionPlain;
    const full = name === 'greenhouse' ? data[name].jobs[0] : data[name][0];
    const h = harness(name, [listing, full]);
    const result = await sourceByName(name).collect(h.ctx);
    assert.equal(result.jobs.length, 1);
    assert.deepEqual(result.errors, []);
    assert.equal(h.calls.length, 2);
  });
}
for (const name of ['gupy', 'linkedin', 'greenhouse', 'lever', 'ashby', 'inhire']) {
  test(`${name}: descrição ausente no detalhe descarta com aviso`, async () => {
    let replies;
    if (name === 'gupy') replies = [data.gupy, '<script id="__NEXT_DATA__">{"props":{"pageProps":{"job":{}}}}</script>'];
    if (name === 'linkedin') replies = [linkedinList, '<html>Sem descrição</html>', ''];
    if (name === 'inhire') replies = [data.inhire, { ...data.inhireDetail, description: '' }];
    if (name === 'ashby') replies = [{ jobs: [{ ...data.ashby.jobs[0], descriptionPlain: '' }] }, '<html>Sem descrição</html>'];
    if (name === 'greenhouse') { const listing = { jobs: [{ ...data.greenhouse.jobs[0], content: '' }] }; replies = [listing, listing.jobs[0]]; }
    if (name === 'lever') { const listing = [{ ...data.lever[0], descriptionPlain: '' }]; replies = [listing, listing[0]]; }
    const h = harness(name, replies);
    const result = await sourceByName(name).collect(h.ctx);
    assert.equal(result.jobs.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].step, 'detalhe');
  });
}
for (const source of sources.filter(source => source.kind === 'company')) {
  test(`${source.name}: empresa com 404 não impede a seguinte do arquivo de busca`, async () => {
    const happy = harness(source.name);
    let count = 0;
    const fetch = happy.ctx.fetch;
    happy.ctx.fetch = async (...args) => ++count === 1 ? respond({}, 404) : fetch(...args);
    happy.ctx.search.empresas[source.name].unshift('ausente');
    const result = await source.collect(happy.ctx);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].target, 'ausente');
  });
}
test('Busca carregada do arquivo existente usa o mesmo contrato, sem adaptador', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-source-'));
  try {
    await initializeDataDir({ dataDir: dir });
    const config = await loadSearch({ dataDir: dir });
    config.idadeMaximaDias = null;
    assert.deepEqual(validateSearch(config), []);
    const h = harness('ashby');
    const result = await sourceByName('ashby').collect({ ...h.ctx, search: config });
    assert.equal(result.jobs.length, 1);
    assert.ok(h.calls[0].url.includes(config.empresas.ashby[0]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Helper limita também leitura de corpo que nunca termina', async () => {
  let signal;
  const fetch = createFetch({ timeoutMs: 10, fetch: async (_, options) => { signal = options.signal; return { ok: true, text: () => new Promise(() => {}) }; } });
  await assert.rejects(fetch('https://fonte.example'), /Tempo limite/);
  assert.equal(signal.aborted, true);
});
test('Limite de páginas opcional comunica contagem parcial', async () => {
  const h = harness('gupy', [{ data: Array.from({ length: 100 }, () => data.gupy.data[0]), pagination: { total: 100 } }, gupyDetail]);
  const result = await sourceByName('gupy').collect({ ...h.ctx, maxPages: 1 });
  assert.equal(result.jobs.length, 1);
  assert.match(result.errors[0].message, /resultado parcial/);
});

 test('Ashby busca JSON-LD do detalhe quando a API omite descrição', async () => {
  const h = harness('ashby', [{ jobs: [{ ...data.ashby.jobs[0], descriptionPlain: '' }] },
    '<script type="application/ld+json">{"@type":"JobPosting","description":"<p>Detalhe inteiro.</p><p>Último requisito.</p>"}</script>']);
  const result = await sourceByName('ashby').collect(h.ctx);
  assert.deepEqual(result.errors, []);
  assert.match(result.jobs[0].description, /Último requisito/);
  assert.equal(h.calls.length, 2);
});
test('LinkedIn não confunde referência a biblioteca captcha com desafio ativo', async () => {
  const h = harness('linkedin', [linkedinList, linkedinDetail + '<script src="/captcha-library.js"></script>', '']);
  const result = await sourceByName('linkedin').collect(h.ctx);
  assert.equal(result.jobs.length, 1);
  assert.deepEqual(result.errors, []);
});
for (const source of sources.filter(source => source.name !== 'linkedin')) {
  test(`${source.name}: JSON válido com estrutura errada gera aviso`, async () => {
    for (const value of [null, 42, { unexpected: [] }]) {
      const h = harness(source.name, [value]);
      const result = await source.collect(h.ctx);
      assert.equal(result.jobs.length, 0);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].message, /malformada/);
    }
  });
}
test('Gupy não guarda descrição parcial se uma seção tem formato inesperado', async () => {
  const h = harness('gupy', [data.gupy, gupyDetail.replace('"<p>Idioma inventado.</p>"', '{"unexpected":true}')]);
  const result = await sourceByName('gupy').collect(h.ctx);
  assert.equal(result.jobs.length, 0);
  assert.match(result.errors[0].message, /malformada/);
});
for (const name of ['gupy', 'inhire']) {
  test(`${name}: falha de detalhe não impede a vaga seguinte`, async () => {
    const listing = structuredClone(data[name]);
    const items = name === 'gupy' ? listing.data : listing.jobsPage;
    items.push({ ...items[0], ...(name === 'gupy' ? { id: 'gp-102' } : { jobId: 'ih-102' }) });
    if (listing.pagination) listing.pagination.total = 2;
    const h = harness(name, [listing, respond({}, 404), name === 'gupy' ? gupyDetail : data.inhireDetail]);
    const result = await sourceByName(name).collect(h.ctx);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].step, 'detalhe');
  });
}
test('As fontes seguintes continuam após o bloqueio do LinkedIn', async () => {
  const blocked = harness('linkedin', [respond('', 429)]);
  const result = await sourceByName('linkedin').collect(blocked.ctx);
  assert.equal(result.errors.length, 1);
  for (const name of ['greenhouse', 'lever', 'ashby', 'inhire']) {
    const h = harness(name);
    assert.equal((await sourceByName(name).collect(h.ctx)).jobs.length, 1);
  }
});
test('ctx.companies substitui a lista da busca; lista vazia não consulta', async () => {
  const h = harness('ashby');
  const source = sourceByName('ashby');
  const result = await source.collect({ ...h.ctx, companies: ['outra-ficticia'] });
  assert.equal(result.jobs.length, 1);
  assert.match(h.calls[0].url, /outra-ficticia/);
  assert.deepEqual(await source.collect({ ...h.ctx, companies: [] }), { jobs: [], errors: [], observed: [] });
  assert.equal(h.calls.length, 1);
});

for (const total of [0, 100, undefined]) {
  test(`Gupy ignora total ${total} e atravessa páginas completas já conhecidas`, async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...data.gupy.data[0], id: `known-${index}` }));
    const second = Array.from({ length: 100 }, (_, index) => ({ ...data.gupy.data[0], id: `more-${index}` }));
    const h = harness('gupy', [{ data: first, pagination: { total } }, { data: second, pagination: { total } }, data.gupy, gupyDetail]);
    const result = await sourceByName('gupy').collect({ ...h.ctx, known: new Set([...first, ...second].map(item => item.id)) });
    assert.deepEqual(result.errors, []);
    assert.equal(result.jobs.length, 1);
    assert.deepEqual(h.calls.slice(0, 3).map(call => new URL(call.url).searchParams.get('offset')), ['0', '100', '200']);
  });
}
test('LinkedIn aceita login opcional em listagem e detalhe públicos', async () => {
  const login = '<form action="/uas/login"><input name="session_key"></form><form action="/signin">Entrar</form>';
  const h = harness('linkedin', [linkedinList + login, linkedinDetail + login, '']);
  const result = await sourceByName('linkedin').collect(h.ctx);
  assert.deepEqual(result.errors, []);
  assert.match(result.jobs[0].description, /Requisito final:/);
  assert.equal(h.calls.length, 3);
});
for (const barrier of ['<form action="/login">Entrar</form>', '<div class="authwall">Entrar</div>', '<title>Sign in</title>']) {
  test(`LinkedIn interrompe autenticação efetiva: ${barrier}`, async () => {
    const h = harness('linkedin', [linkedinList, barrier]);
    h.ctx.search.termos.push('outro');
    const result = await sourceByName('linkedin').collect(h.ctx);
    assert.equal(result.jobs.length, 0);
    assert.match(result.errors[0].message, /autenticação/);
    assert.equal(h.calls.length, 2);
  });
}
for (const noise of ['<!-- </div> -->', '<script>const template = "</div><div>";</script>', '<!-- <div> -->', '<script>const end = "</div>";</script>']) {
  test(`LinkedIn preserva descrição inteira com tags aparentes em ${noise}`, async () => {
    const detail = linkedinDetail.replace('</p>', '</p>' + noise);
    const h = harness('linkedin', [linkedinList, detail, '']);
    const result = await sourceByName('linkedin').collect(h.ctx);
    assert.deepEqual(result.errors, []);
    assert.equal(result.jobs[0].description, 'Planejar o futuro.\n\nDesenhar cenários.\n\nRequisito final: idioma inventado.');
  });
}
