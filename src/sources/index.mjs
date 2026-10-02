// Registro explícito das fontes do radar. Por ora não há fonte real: as
// fontes entram aqui uma a uma nas tarefas seguintes (T1.2 em diante).
import { SOURCE_NAME_PATTERN } from '../job.mjs';

export const sources = [];

/**
 * Valida o contrato de uma fonte. Devolve a lista de problemas em português;
 * lista vazia significa fonte válida. Não lança exceção.
 */
export function validateSource(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return ['a fonte precisa ser um objeto'];
  }

  const problems = [];

  if (typeof source.name !== 'string' || source.name.trim() === '') {
    problems.push('campo "name" é obrigatório e precisa ser uma string não vazia');
  } else if (!SOURCE_NAME_PATTERN.test(source.name)) {
    problems.push('campo "name" precisa ser minúsculo, sem espaços e sem dois-pontos');
  }

  if (typeof source.label !== 'string' || source.label.trim() === '') {
    problems.push('campo "label" é obrigatório e precisa ser uma string não vazia');
  }

  if (source.kind !== 'search' && source.kind !== 'company') {
    problems.push('campo "kind" precisa ser "search" ou "company"');
  }

  if (typeof source.defaultEnabled !== 'boolean') {
    problems.push('campo "defaultEnabled" precisa ser booleano');
  }

  if (typeof source.collect !== 'function') {
    problems.push('campo "collect" é obrigatório e precisa ser uma função');
  }

  return problems;
}
