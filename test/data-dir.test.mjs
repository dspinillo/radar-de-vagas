import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDataDir, initializeDataDir, loadSearch, resolveDataDir, validateSearch } from '../src/data-dir.mjs';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'radar-search-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, dataDir: join(root, 'dados') };
}

test('resolve a pasta padrão sem criar ou acessar a pasta real', () => {
  assert.equal(resolveDataDir({}), join(homedir(), '.radar-de-vagas'));
});

test('aceita a variável de ambiente absoluta e rejeita caminho relativo ou vazio', async t => {
  const { dataDir } = await setup(t);
  assert.equal(resolveDataDir({ RADAR_DATA_DIR: dataDir }), resolve(dataDir));
  for (const value of ['', 'dados', '~/dados']) {
    assert.throws(() => resolveDataDir({ RADAR_DATA_DIR: value }), /pasta absoluta/);
  }
});

test('primeira execução cria pasta e busca fictícia completa, com LinkedIn desligado', async t => {
  const options = await setup(t);
  const search = await loadSearch(options);
  assert.deepEqual(validateSearch(search), []);
  assert.match(search.aviso, /FICTÍCIO/);
  assert.equal(search.fontes.linkedin, false);
  assert.ok(search.termos.length);
  assert.equal(search.localidade, 'Brasil');
  assert.equal(search.modelo, 'remoto');
  assert.deepEqual(Object.keys(search.empresas), ['greenhouse', 'lever', 'ashby', 'inhire']);
  assert.ok(Object.values(search.empresas).flat().every(company => company.endsWith('-ficticia')));
  assert.deepEqual(await readdir(options.dataDir), ['busca.json']);
});

test('segunda execução preserva exatamente o arquivo editado pela pessoa', async t => {
  const options = await setup(t);
  const search = await loadSearch(options);
  search.termos = ['análise inventada'];
  search.fontes.linkedin = true;
  const content = `${JSON.stringify(search, null, 4)}\n\n`;
  const path = join(options.dataDir, 'busca.json');
  await writeFile(path, content);
  await initializeDataDir(options);
  assert.deepEqual(await loadSearch(options), search);
  assert.equal(await readFile(path, 'utf8'), content);
});

test('busca com JSON inválido não é sobrescrita na inicialização ou na leitura', async t => {
  const options = await setup(t);
  await initializeDataDir(options);
  const path = join(options.dataDir, 'busca.json');
  await writeFile(path, '{ edição incompleta');
  await initializeDataDir(options);
  await assert.rejects(loadSearch(options), /busca.json.*JSON válido.*preservado/);
  assert.equal(await readFile(path, 'utf8'), '{ edição incompleta');
});

test('busca sintaticamente válida acusa campos inválidos em português e preserva bytes', async t => {
  const options = await setup(t);
  await initializeDataDir(options);
  const path = join(options.dataDir, 'busca.json');
  const content = JSON.stringify({ termos: [], modelo: 'qualquer' });
  await writeFile(path, content);
  await assert.rejects(loadSearch(options), /Busca inválida.*termos.*modelo.*preservado/);
  assert.equal(await readFile(path, 'utf8'), content);
});

test('valida tipos, campos desconhecidos, modelos, idade, fontes e empresas', async t => {
  const options = await setup(t);
  const valid = await loadSearch(options);
  for (const invalid of [null, [], 'texto', 3]) assert.ok(validateSearch(invalid).length);
  for (const patch of [
    { termos: [''] }, { termos: 'vaga' }, { localidade: 4 }, { modelo: 'remote' },
    { idadeMaximaDias: 0 }, { idadeMaximaDias: 1.5 }, { idadeMaximaDias: '30' },
    { fontes: { gupy: true, linkedin: 'false' } }, { fontes: {} }, { empresas: [] },
    { empresas: { ...valid.empresas, lever: [''] } }, { empresas: { ...valid.empresas, outro: [] } },
    { aviso: '' }, { desconhecido: true },
  ]) assert.ok(validateSearch({ ...valid, ...patch }).length, JSON.stringify(patch));
  assert.deepEqual(validateSearch({ ...valid, localidade: null, modelo: null, idadeMaximaDias: null,
    empresas: { greenhouse: [], lever: [], ashby: [], inhire: [] } }), []);
  for (const modelo of ['remoto', 'híbrido', 'presencial']) {
    assert.deepEqual(validateSearch({ ...valid, modelo }), []);
  }
});

test('inicializações simultâneas só publicam uma busca completa e não deixam temporários', async t => {
  const options = await setup(t);
  const searches = await Promise.all(Array.from({ length: 12 }, () => loadSearch(options)));
  for (const search of searches) assert.deepEqual(search, searches[0]);
  assert.deepEqual(await readdir(options.dataDir), ['busca.json']);
});

test('recusa diretório do repositório antes de escrever', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await assert.rejects(ensureDataDir(root), /fora do repositório/);
  await assert.rejects(ensureDataDir(join(root, 'dados-proibidos')), /fora do repositório/);
});

test('recusa link simbólico externo que aponta para dentro do repositório', async t => {
  const { root } = await setup(t);
  const link = join(root, 'atalho');
  await symlink(fileURLToPath(new URL('../', import.meta.url)), link, 'junction');
  await assert.rejects(initializeDataDir({ dataDir: join(link, 'dados-proibidos') }), /fora do repositório/);
});
