import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { main } from '../bin/radar.mjs';
import { generateCandidates, isBrazilLocation, hasBrazilSignal, discover } from '../src/discover.mjs';
import { loadSearch } from '../src/data-dir.mjs';

async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-discover-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const stdout = [], stderr = [];
  const options = { dataDir, stdout: value => stdout.push(value), stderr: value => stderr.push(value) };
  const call = async args => {
    stdout.length = stderr.length = 0;
    return main(args, options);
  };
  return { options, call, stdout, stderr };
}

const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body) });
const notFound = body => respond(body, 404);

test('generateCandidates: junto, hífen, primeira palavra, sufixo removido, sem duplicados, no máximo 3 gerados', () => {
  assert.deepEqual(generateCandidates('Reclame Aqui'), ['reclameaqui', 'reclame-aqui', 'reclame']);
  assert.deepEqual(generateCandidates('Fictícia S.A.'), ['ficticia']);
  assert.deepEqual(generateCandidates('Fictícia Ltda'), ['ficticia']);
  assert.deepEqual(generateCandidates('Fictícia Brasil'), ['ficticia']);
  assert.deepEqual(generateCandidates('Grupo Fictício Tecnologia'), ['grupoficticio', 'grupo-ficticio', 'grupo']);
  assert.deepEqual(generateCandidates('Nu'), ['nu']);
  assert.deepEqual(generateCandidates(''), []);
  assert.deepEqual(generateCandidates('   '), []);
  // "S.A." sozinho não sobra nada após o sufixo: o guard de não esvaziar preserva o texto original.
  assert.deepEqual(generateCandidates('S.A.'), ['sa', 's-a']);
});

test('isBrazilLocation: positivos e negativos, remoto só em português', () => {
  for (const value of ['São Paulo, SP, BR', 'Brasil', 'Remote - Brazil', 'Rio de Janeiro', '- RJ', 'Remoto', 'BR', 'Vitória, ES', 'Londrina, PR']) {
    assert.equal(isBrazilLocation(value), true, value);
  }
  for (const value of ['London', 'Mexico City', 'Remote - US', '', null, undefined, 'Lisboa',
    'Jackson, MS, US', 'San Juan, PR, USA', 'Philadelphia, PA, United States', 'Madrid, Spain', 'Pittsburgh, Pa']) {
    assert.equal(isBrazilLocation(value), false, String(value));
  }
  assert.equal(hasBrazilSignal(['London', 'Remoto']), true);
  assert.equal(hasBrazilSignal(['London', 'Lisboa']), false);
  assert.equal(hasBrazilSignal(undefined), false);
});

test('descobrir: nome vazio sai com 2 e não toca a rede', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  options.fetch = async () => assert.fail('não deveria acessar a rede');
  assert.equal(await call(['descobrir']), 2);
  assert.equal(stdout.length, 0);
  assert.equal(stderr.length, 1);
  assert.equal(await call(['descobrir', '']), 2);
  assert.equal(await call(['descobrir', '--id', 'x']), 2);
});

test('descobrir: --id inválido sai com 2 sem acessar a rede; --id repetido entra todo na lista', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  options.fetch = async () => assert.fail('não deveria acessar a rede');
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'tem espaço']), 2);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /identificador/i);

  const calls = [];
  options.fetch = async url => { calls.push(String(url)); return notFound({}); };
  assert.equal(await call(['descobrir', 'Fictícia Tecnologia', '--id', 'um', '--id', 'dois']), 1);
  // candidatos: um, dois (dos --id) + ficticia (gerado); sufixo "tecnologia" removido.
  assert.ok(calls.some(url => url.includes('/um/')) || calls.some(url => url.includes('boards/um')));
  assert.ok(calls.some(url => url.includes('boards/dois')));
  assert.ok(calls.some(url => url.includes('boards/ficticia')));
});

test('descobrir: 404 em todas as fontes é silencioso, nada encontrado, exit 1, sugere --id', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  options.fetch = async () => notFound({ status: 404, error: 'Job not found' });
  assert.equal(await call(['descobrir', 'Empresa Fictícia Que Nao Existe']), 1);
  assert.deepEqual(JSON.parse(stdout[0]), []);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /--id/);
  assert.match(stderr[0], /página de carreiras/);
});

test('descobrir: 200 com 0 vagas conta como encontrado (Greenhouse) e nome vem de company_name', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  // "zenite-ficticia" (diferente do exemplo "aurora-ficticia" que busca.json já traz de fábrica).
  options.fetch = async url => {
    if (String(url) === 'https://boards-api.greenhouse.io/v1/boards/zenite-ficticia/jobs') return respond({ jobs: [] });
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Zênite Fictícia', '--id', 'zenite-ficticia']), 0);
  const found = JSON.parse(stdout[0]);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], { fonte: 'greenhouse', identificador: 'zenite-ficticia', nome: null, vagas: 0, vagasBrasil: 0, exemplos: [], jaNaBusca: false });
  assert.match(stderr.find(line => line.startsWith('Greenhouse')), /0 vagas, nenhuma no Brasil/);
});

test('descobrir: Greenhouse com vagas no Brasil e fora, exemplos e nome da primeira vaga', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  options.fetch = async url => {
    if (String(url) === 'https://boards-api.greenhouse.io/v1/boards/aurora-ficticia/jobs') {
      return respond({ jobs: [
        { id: 1, title: 'Analista Fictício', company_name: 'Aurora Fictícia', location: { name: 'São Paulo' } },
        { id: 2, title: 'Gerente Fictício', company_name: 'Aurora Fictícia', location: { name: 'Lisboa' } },
        { id: 3, title: 'Coordenador Fictício', company_name: 'Aurora Fictícia', location: { name: 'Remoto' } },
      ] });
    }
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Aurora Fictícia', '--id', 'aurora-ficticia']), 0);
  const found = JSON.parse(stdout[0]).find(f => f.identificador === 'aurora-ficticia');
  assert.equal(found.nome, 'Aurora Fictícia');
  assert.equal(found.vagas, 3);
  assert.equal(found.vagasBrasil, 2);
  assert.deepEqual(found.exemplos, ['Analista Fictício', 'Coordenador Fictício']);
  assert.match(stderr.find(line => line.startsWith('Greenhouse')), /3 vagas, 2 no Brasil/);
});

test('descobrir: Lever usa country BR e allLocations; Ashby usa addressCountry e secondaryLocations', async t => {
  const { options, call, stdout } = await setup(t);
  options.fetch = async url => {
    const target = String(url);
    if (target.includes('api.lever.co')) {
      return respond([
        { id: 'a', text: 'Vaga BR', country: 'BR', categories: { location: 'São Paulo' } },
        { id: 'b', text: 'Vaga fora', country: 'US', categories: { location: 'Austin', allLocations: ['Austin, TX'] } },
      ]);
    }
    if (target.includes('api.ashbyhq.com')) {
      return respond({ jobs: [
        { id: 'x', title: 'Vaga Ashby BR', isListed: true, location: 'Remoto', secondaryLocations: [] },
        { id: 'y', title: 'Vaga Ashby não listada', isListed: false, location: 'São Paulo' },
        { id: 'z', title: 'Vaga Ashby fora', isListed: true, location: 'Lisboa', address: { postalAddress: { addressCountry: 'Portugal' } } },
      ] });
    }
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Nebulosa', '--id', 'nebulosa', '--id', 'orbita']), 0);
  const found = JSON.parse(stdout[0]);
  const lever = found.find(f => f.fonte === 'lever');
  const ashby = found.find(f => f.fonte === 'ashby');
  assert.equal(lever.vagas, 2);
  assert.equal(lever.vagasBrasil, 1);
  assert.deepEqual(lever.exemplos, ['Vaga BR']);
  // isListed:false não entra na contagem nem nos exemplos.
  assert.equal(ashby.vagas, 2);
  assert.equal(ashby.vagasBrasil, 1);
  assert.deepEqual(ashby.exemplos, ['Vaga Ashby BR']);
});

test('descobrir: InHire usa X-Tenant, tenantName e location de texto', async t => {
  const { options, call, stdout } = await setup(t);
  options.fetch = async (url, init) => {
    if (String(url).includes('api.inhire.app')) {
      assert.equal(init.headers.get('X-Tenant'), 'constelacao');
      return respond({ tenantName: 'Constelação Fictícia', jobsPage: [
        { jobId: '1', displayName: 'Vaga InHire BR', location: 'São Paulo, SP, BR' },
        { jobId: '2', displayName: 'Vaga InHire fora', location: 'Remote - US' },
      ] });
    }
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Constelação', '--id', 'constelacao']), 0);
  const [found] = JSON.parse(stdout[0]);
  assert.equal(found.nome, 'Constelação Fictícia');
  assert.equal(found.vagas, 2);
  assert.equal(found.vagasBrasil, 1);
  assert.deepEqual(found.exemplos, ['Vaga InHire BR']);
});

test('descobrir: erro HTTP diferente de 404 e timeout viram aviso, nunca "não existe"', async t => {
  const { options, call, stdout, stderr } = await setup(t);
  options.fetch = async url => {
    if (String(url).includes('boards-api.greenhouse.io')) return respond({}, 500);
    if (String(url).includes('api.lever.co')) throw new Error('socket failure');
    if (String(url).includes('api.ashbyhq.com')) return respond({ jobs: [{ id: 1, title: 'Vaga', isListed: true, location: 'São Paulo' }] });
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'ficticia']), 0);
  const found = JSON.parse(stdout[0]);
  assert.equal(found.length, 1);
  assert.equal(found[0].fonte, 'ashby');
  const warnings = stderr.filter(line => line.startsWith('Aviso'));
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(line => line.includes('Greenhouse') && line.includes('ficticia')));
  assert.ok(warnings.some(line => line.includes('Lever')));
  assert.ok(!warnings.some(line => /não existe/i.test(line)));
});

test('descobrir: JSON inválido vira aviso de resposta malformada', async t => {
  const { options, call, stderr } = await setup(t);
  options.fetch = async url => {
    if (String(url).includes('boards-api.greenhouse.io')) return { ok: true, status: 200, text: async () => 'isso não é json {' };
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'ficticia']), 1);
  assert.ok(stderr.some(line => line.includes('malformada')));
});

test('descobrir: jaNaBusca reflete empresas.<fonte> de busca.json; sem busca.json conta como false', async t => {
  const { options, call, stdout } = await setup(t);
  options.fetch = async url => {
    if (String(url).includes('boards-api.greenhouse.io')) return respond({ jobs: [] });
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'ficticia']), 0);
  assert.equal(JSON.parse(stdout[0])[0].jaNaBusca, false);

  const search = await loadSearch(options);
  await writeFile(join(options.dataDir, 'busca.json'), JSON.stringify({ ...search, empresas: { ...search.empresas, greenhouse: ['ficticia'] } }));
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'ficticia']), 0);
  assert.equal(JSON.parse(stdout[0])[0].jaNaBusca, true);
  assert.ok(stdout, 'sanity');
});

test('descobrir: ordena achados por vagasBrasil desc', async t => {
  const { options, call, stdout } = await setup(t);
  options.fetch = async url => {
    const target = String(url);
    if (target.includes('boards-api.greenhouse.io')) return respond({ jobs: [{ id: 1, title: 'Vaga', location: { name: 'Lisboa' } }] });
    if (target.includes('api.lever.co')) return respond([{ id: 1, text: 'Vaga', country: 'BR', categories: { location: 'São Paulo' } }]);
    if (target.includes('api.ashbyhq.com')) return respond({ jobs: [] });
    if (target.includes('api.inhire.app')) return respond({ jobsPage: [] });
    return notFound({});
  };
  assert.equal(await call(['descobrir', 'Fictícia', '--id', 'ficticia']), 0);
  const found = JSON.parse(stdout[0]);
  assert.deepEqual(found.map(f => f.fonte), ['lever', 'greenhouse', 'ashby', 'inhire']);
  assert.ok(found[0].vagasBrasil >= found[1].vagasBrasil);
});

test('descobrir: respeita o limite de 4 candidatos mesmo com vários --id', async t => {
  const { options, call } = await setup(t);
  const seen = new Set();
  options.fetch = async (url, init) => {
    const u = new URL(String(url));
    const id = u.hostname === 'api.inhire.app' ? init?.headers?.get?.('X-Tenant') : u.pathname.split('/')[3];
    if (id) seen.add(id);
    return notFound({});
  };
  await call(['descobrir', 'Fictícia Grande Nome Aqui', '--id', 'um', '--id', 'dois', '--id', 'tres', '--id', 'quatro', '--id', 'cinco']);
  assert.equal(seen.size, 4);
});

test('descobrir: SIGINT cancela e retorna 130, sem ouvintes residuais', async t => {
  const { options, call } = await setup(t);
  options.signals = new EventEmitter();
  let started = false;
  options.fetch = async () => {
    started = true;
    queueMicrotask(() => options.signals.emit('SIGINT'));
    return new Promise(() => {});
  };
  const code = await call(['descobrir', 'Fictícia', '--id', 'ficticia']);
  assert.ok(started);
  assert.equal(code, 130);
  assert.equal(options.signals.listenerCount('SIGINT'), 0);
  assert.equal(options.signals.listenerCount('SIGTERM'), 0);
});

test('discover() direto: usado com fetch falso devolve findings e aceita name/ids', async () => {
  const stdout = [], stderr = [];
  const dataDir = await mkdtemp(join(tmpdir(), 'radar-discover-direct-'));
  try {
    const code = await discover('Fictícia', ['ficticia'], {
      dataDir, stdout: v => stdout.push(v), stderr: v => stderr.push(v),
      fetch: async url => String(url).includes('boards-api.greenhouse.io') ? respond({ jobs: [] }) : notFound({}),
    });
    assert.equal(code, 0);
    assert.equal(JSON.parse(stdout[0]).length, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
