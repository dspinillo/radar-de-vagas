import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources, validateSource } from '../src/sources/index.mjs';

function fonteValida(extra = {}) {
  return {
    name: 'aurora',
    label: 'Aurora Pagamentos (carreiras)',
    kind: 'company',
    defaultEnabled: true,
    collect: async () => ({ jobs: [], errors: [] }),
    ...extra,
  };
}

test('sources registra as seis fontes válidas, sem nomes repetidos', () => {
  assert.ok(Array.isArray(sources));
  assert.deepEqual(sources.map(source => source.name), ['gupy', 'linkedin', 'greenhouse', 'lever', 'ashby', 'inhire']);
  for (const source of sources) assert.deepEqual(validateSource(source), []);
});

test('validateSource aceita uma fonte válida do tipo company', () => {
  assert.deepEqual(validateSource(fonteValida()), []);
});

test('validateSource aceita uma fonte válida do tipo search', () => {
  const fonte = fonteValida({ name: 'gupy', label: 'Gupy (busca)', kind: 'search' });
  assert.deepEqual(validateSource(fonte), []);
});

test('validateSource rejeita fonte sem collect', () => {
  const fonte = fonteValida();
  delete fonte.collect;
  const problemas = validateSource(fonte);
  assert.ok(problemas.some((p) => p.includes('"collect"')));
});

test('validateSource rejeita collect que não é função', () => {
  const fonte = fonteValida({ collect: 'nao-e-funcao' });
  const problemas = validateSource(fonte);
  assert.ok(problemas.some((p) => p.includes('"collect"')));
});

test('validateSource rejeita name com maiúscula, espaço ou dois-pontos', () => {
  assert.ok(validateSource(fonteValida({ name: 'Aurora' })).some((p) => p.includes('"name"')));
  assert.ok(validateSource(fonteValida({ name: 'aurora pagamentos' })).some((p) => p.includes('"name"')));
  assert.ok(validateSource(fonteValida({ name: 'aurora:carreiras' })).some((p) => p.includes('"name"')));
});

test('validateSource rejeita kind fora de search/company', () => {
  const fonte = fonteValida({ kind: 'agregador' });
  const problemas = validateSource(fonte);
  assert.ok(problemas.some((p) => p.includes('"kind"')));
});

test('validateSource rejeita defaultEnabled que não é booleano', () => {
  const fonte = fonteValida({ defaultEnabled: 'sim' });
  const problemas = validateSource(fonte);
  assert.ok(problemas.some((p) => p.includes('"defaultEnabled"')));
});

test('validateSource rejeita label ausente', () => {
  const fonte = fonteValida();
  delete fonte.label;
  const problemas = validateSource(fonte);
  assert.ok(problemas.some((p) => p.includes('"label"')));
});

// --- Rodada de correções do Tester independente (T1.1) ---

test('validateSource trata array como "precisa ser um objeto", sem listar cada campo', () => {
  assert.deepEqual(validateSource(['aurora']), ['a fonte precisa ser um objeto']);
});
