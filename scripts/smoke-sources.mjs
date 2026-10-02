// Não lê nem grava a pasta de dados. Todos os alvos vêm da linha de comando.
import { parseArgs } from 'node:util';
import { sources } from '../src/sources/index.mjs';
import { validateSearch } from '../src/data-dir.mjs';

try {
  const { values } = parseArgs({ options: {
    termo: { type: 'string', multiple: true },
    greenhouse: { type: 'string', multiple: true }, lever: { type: 'string', multiple: true },
    ashby: { type: 'string', multiple: true }, inhire: { type: 'string', multiple: true },
    linkedin: { type: 'boolean', default: false }, localidade: { type: 'string' },
    'max-pages': { type: 'string' },
  } });
  const maxPages = values['max-pages'] === undefined ? undefined : Number(values['max-pages']);
  if (maxPages !== undefined && (!Number.isSafeInteger(maxPages) || maxPages < 1)) throw new Error('--max-pages precisa ser inteiro positivo.');
  const search = { termos: values.termo ?? [''], localidade: values.localidade ?? null,
    modelo: null, idadeMaximaDias: null, fontes: { gupy: true, linkedin: values.linkedin },
    empresas: Object.fromEntries(['greenhouse', 'lever', 'ashby', 'inhire'].map(name => [name, values[name] ?? []])) };
  const problems = validateSearch(search);
  if (problems.length) throw new Error(`Argumentos inválidos: informe --termo e identificadores de empresas por ATS. ${problems.join('; ')}`);
  for (const source of sources) {
    const result = await source.collect({ search, maxPages });
    console.log(`${source.name}: ${result.jobs.length}`);
    for (const error of result.errors) console.log(`Aviso [${source.name}/${error.step}]: ${error.message}`);
  }
} catch (error) {
  console.error(`Aviso: ${error.message}`);
  process.exitCode = 1;
}
