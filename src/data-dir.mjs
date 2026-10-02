import { link, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryDir = fileURLToPath(new URL('../', import.meta.url));
const companySources = ['greenhouse', 'lever', 'ashby', 'inhire'];

/** Resolve sem criar. RADAR_DATA_DIR deve ser absoluto e ficar fora do repositório. */
export function resolveDataDir(env = process.env) {
  const value = env.RADAR_DATA_DIR ?? join(homedir(), '.radar-de-vagas');
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error('A variável RADAR_DATA_DIR precisa indicar uma pasta absoluta.');
  }
  return resolve(value);
}

// Resolve também os pais existentes para impedir escrita por um atalho simbólico.
async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await physicalPath(parent), relative(parent, path));
  }
}

/** Cria apenas a pasta; usado também pelo estado, sem alterar a busca. */
export async function ensureDataDir(dataDir = resolveDataDir()) {
  if (typeof dataDir !== 'string' || !isAbsolute(dataDir)) {
    throw new Error('A pasta de dados precisa ter um caminho absoluto.');
  }
  const target = await physicalPath(resolve(dataDir));
  const root = await realpath(repositoryDir);
  const inside = relative(root, target);
  if (inside === '' || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`))) {
    throw new Error('A pasta de dados precisa ficar fora do repositório.');
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  return target;
}

function exampleSearch() {
  return {
    aviso: 'EXEMPLO FICTÍCIO: substitua os termos e as empresas inventadas antes de coletar.',
    termos: ['planejamento', 'inteligência de mercado'],
    localidade: 'Brasil',
    modelo: 'remoto',
    idadeMaximaDias: 30,
    detalhesNovosPorFonte: 150,
    prazoFonteSegundos: 600,
    fontes: { gupy: true, linkedin: false },
    empresas: {
      greenhouse: ['aurora-ficticia'],
      lever: ['nebulosa-ficticia'],
      ashby: ['orbita-ficticia'],
      inhire: ['constelacao-ficticia'],
    },
  };
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';

/** Lista de problemas em português; não modifica a busca. */
export function validateSearch(search) {
  if (!isObject(search)) return ['a busca precisa ser um objeto'];
  const problems = [];
  const allowed = ['aviso', 'termos', 'localidade', 'modelo', 'idadeMaximaDias', 'fontes', 'empresas', 'detalhesNovosPorFonte', 'prazoFonteSegundos'];
  for (const key of Object.keys(search)) {
    if (!allowed.includes(key)) problems.push(`campo desconhecido na busca: "${key}"`);
  }
  if ('aviso' in search && !isText(search.aviso)) problems.push('"aviso" precisa ser texto não vazio');
  if (!Array.isArray(search.termos) || search.termos.length === 0 || !search.termos.every(isText)) {
    problems.push('"termos" precisa ser uma lista não vazia de textos não vazios');
  }
  if (search.localidade !== null && !isText(search.localidade)) {
    problems.push('"localidade" precisa ser texto não vazio ou null');
  }
  if (![null, 'remoto', 'híbrido', 'presencial'].includes(search.modelo)) {
    problems.push('"modelo" precisa ser "remoto", "híbrido", "presencial" ou null');
  }
  if (search.idadeMaximaDias !== null && (!Number.isSafeInteger(search.idadeMaximaDias) || search.idadeMaximaDias < 1)) {
    problems.push('"idadeMaximaDias" precisa ser um inteiro positivo ou null');
  }
  for (const key of ['detalhesNovosPorFonte', 'prazoFonteSegundos']) {
    if (key in search && (!Number.isSafeInteger(search[key]) || search[key] < 1 ||
        (key === 'prazoFonteSegundos' && search[key] > 2147483))) {
      problems.push(`"${key}" precisa ser um inteiro positivo${key === 'prazoFonteSegundos' ? ' até 2147483' : ''}`);
    }
  }
  if (!isObject(search.fontes) || Object.keys(search.fontes).some(key => !['gupy', 'linkedin'].includes(key)) ||
      typeof search.fontes.gupy !== 'boolean' || typeof search.fontes.linkedin !== 'boolean') {
    problems.push('"fontes" precisa conter "gupy" e "linkedin" com valores true ou false');
  }
  if (!isObject(search.empresas) || Object.keys(search.empresas).some(key => !companySources.includes(key)) ||
      companySources.some(key => !Array.isArray(search.empresas[key]) || !search.empresas[key].every(isText))) {
    problems.push('"empresas" precisa conter listas de identificadores não vazios para greenhouse, lever, ashby e inhire (listas vazias são permitidas)');
  }
  return problems;
}

/** Cria busca.json uma única vez. Um arquivo existente, mesmo inválido, é preservado. */
export async function initializeDataDir({ dataDir = resolveDataDir() } = {}) {
  const directory = await ensureDataDir(dataDir);
  const destination = join(directory, 'busca.json');
  try {
    await lstat(destination);
    return directory;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Não foi possível acessar busca.json.', { cause: error });
  }
  const temporary = join(directory, `.busca-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(exampleSearch(), null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    // Publica completo e sem substituir um arquivo criado por outra execução.
    try { await link(temporary, destination); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } catch (error) {
    throw new Error('Não foi possível criar o arquivo busca.json.', { cause: error });
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return directory;
}

/** Inicializa quando necessário e devolve os campos em português de busca.json. */
export async function loadSearch(options = {}) {
  const directory = await initializeDataDir(options);
  let search;
  try {
    search = JSON.parse(await readFile(join(directory, 'busca.json'), 'utf8'));
  } catch (error) {
    throw new Error('Não foi possível ler busca.json: confira se o arquivo contém JSON válido. O arquivo foi preservado.', { cause: error });
  }
  const problems = validateSearch(search);
  if (problems.length) throw new Error(`Busca inválida em busca.json: ${problems.join('; ')}. O arquivo foi preservado.`);
  return search;
}
