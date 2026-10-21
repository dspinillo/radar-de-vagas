// Acha o identificador da empresa em cada ATS por empresa (Greenhouse, Lever,
// Ashby, InHire) a partir do nome e diz se há vaga no Brasil. Só consulta a
// listagem de cada fonte, nunca o detalhe de uma vaga. Não edita busca.json;
// quem decide incluir o identificador é a pessoa.
import { createFetch } from './network.mjs';
import { loadSearch } from './data-dir.mjs';

const LABELS = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', inhire: 'InHire' };

// Sufixo societário ou genérico removido uma vez, só se sobrar nome.
const SUFFIXES = ['s\\.a\\.', 's\\/a', 'sa', 'ltda', 'brasil', 'brazil', 'grupo', 'group', 'inc', 'tecnologia'];
const SUFFIX_REGEX = new RegExp(`(?:^|[\\s,.-]+)(?:${SUFFIXES.join('|')})\\s*$`, 'i');

function stripTrailingSuffix(normalized) {
  const match = SUFFIX_REGEX.exec(normalized);
  if (!match) return normalized;
  const withoutSuffix = normalized.slice(0, match.index).trim();
  return withoutSuffix === '' ? normalized : withoutSuffix;
}

/**
 * Candidatos a identificador a partir do nome da empresa: tudo junto, com
 * hífen e a primeira palavra (quando houver mais de uma e tiver 3+ letras).
 * Sem duplicados. Não inclui os identificadores vindos de --id, que entram
 * antes desta lista.
 */
export function generateCandidates(name) {
  if (typeof name !== 'string' || !name.trim()) return [];
  const accentless = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const withoutSuffix = stripTrailingSuffix(accentless.trim());
  const words = withoutSuffix.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const joined = words.join('');
  const hyphenated = words.join('-');
  const first = words.length > 1 && words[0].length >= 3 ? words[0] : null;
  return [...new Set([joined, hyphenated, first].filter(Boolean))];
}

const UF_CODES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const BRAZIL_CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Recife',
  'Florianópolis', 'Campinas', 'Salvador', 'Brasília', 'Fortaleza'];
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Sigla de UF só em maiúsculas: ", Pa" ou ", es" não são estado brasileiro.
const UF_REGEX = new RegExp(`[,-]\\s*(?:${UF_CODES.join('|')})\\b`);
const CITY_REGEX = new RegExp(`\\b(?:${BRAZIL_CITIES.map(escapeRegExp).join('|')})\\b`, 'i');
// MS, PR e PA também são siglas nos EUA; país estrangeiro explícito vence a sigla.
const FOREIGN_REGEX = /\b(?:USA?|UK)\b|United States|United Kingdom|Estados Unidos|Canada|Mexico|México|Spain|España|Espanha|Portugal|Colombia|Colômbia|Argentina|Chile/i;

/**
 * Heurística de texto: a vaga parece ser no Brasil pelo local informado.
 * Siglas de UF só contam depois de vírgula ou hífen e sem país estrangeiro no
 * texto; "remote"/"remoto" em inglês não conta, só a palavra em português.
 */
export function isBrazilLocation(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/Brasil|Brazil|\bBR\b/i.test(value)) return true;
  if (FOREIGN_REGEX.test(value)) return false;
  if (UF_REGEX.test(value)) return true;
  if (CITY_REGEX.test(value)) return true;
  if (/\bremoto\b/i.test(value)) return true;
  return false;
}

/** Testa uma lista de locais (location, allLocations, secondaryLocations...). */
export function hasBrazilSignal(values) {
  return (values ?? []).some(isBrazilLocation);
}

function isLeverBrazil(job) {
  if (job?.country === 'BR') return true;
  return hasBrazilSignal([job?.categories?.location, ...(Array.isArray(job?.categories?.allLocations) ? job.categories.allLocations : [])]);
}

function isAshbyBrazil(job) {
  const country = job?.address?.postalAddress?.addressCountry;
  if (typeof country === 'string' && /^(brazil|brasil)$/i.test(country.trim())) return true;
  return hasBrazilSignal([job?.location, ...(Array.isArray(job?.secondaryLocations) ? job.secondaryLocations.map(entry => entry?.location) : [])]);
}

async function readJson(response) {
  try { return await response.json(); }
  catch { throw new Error('Resposta malformada: JSON inválido.'); }
}

function httpError(status) {
  const error = new Error(`A fonte respondeu com erro HTTP ${status}.`);
  error.status = status;
  return error;
}

async function probeGreenhouse(id, fetchImpl, signal) {
  const response = await fetchImpl(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(id)}/jobs`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(response.status);
  const data = await readJson(response);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const brazilJobs = jobs.filter(job => hasBrazilSignal([job?.location?.name]));
  const nome = jobs.find(job => typeof job?.company_name === 'string' && job.company_name.trim())?.company_name ?? null;
  return { nome, vagas: jobs.length, vagasBrasil: brazilJobs.length, exemplos: brazilJobs.slice(0, 3).map(job => job?.title).filter(Boolean) };
}

async function probeLever(id, fetchImpl, signal) {
  const response = await fetchImpl(`https://api.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(response.status);
  const data = await readJson(response);
  const jobs = Array.isArray(data) ? data : [];
  const brazilJobs = jobs.filter(isLeverBrazil);
  return { nome: null, vagas: jobs.length, vagasBrasil: brazilJobs.length, exemplos: brazilJobs.slice(0, 3).map(job => job?.text).filter(Boolean) };
}

async function probeAshby(id, fetchImpl, signal) {
  const response = await fetchImpl(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(response.status);
  const data = await readJson(response);
  const jobs = (Array.isArray(data?.jobs) ? data.jobs : []).filter(job => job?.isListed !== false);
  const brazilJobs = jobs.filter(isAshbyBrazil);
  return { nome: null, vagas: jobs.length, vagasBrasil: brazilJobs.length, exemplos: brazilJobs.slice(0, 3).map(job => job?.title).filter(Boolean) };
}

async function probeInHire(id, fetchImpl, signal) {
  const response = await fetchImpl('https://api.inhire.app/job-posts/public/pages', { headers: { 'X-Tenant': id }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw httpError(response.status);
  const data = await readJson(response);
  const jobs = Array.isArray(data?.jobsPage) ? data.jobsPage : [];
  const brazilJobs = jobs.filter(job => hasBrazilSignal([job?.location]));
  const nome = typeof data?.tenantName === 'string' && data.tenantName.trim() ? data.tenantName : null;
  return { nome, vagas: jobs.length, vagasBrasil: brazilJobs.length, exemplos: brazilJobs.slice(0, 3).map(job => job?.displayName).filter(Boolean) };
}

const PROBES = [['greenhouse', probeGreenhouse], ['lever', probeLever], ['ashby', probeAshby], ['inhire', probeInHire]];

// Mesmo padrão de fila com teto de paralelismo usado em source-utils.mjs (flush).
async function runLimited(tasks, limit, signal) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      if (signal?.aborted) return;
      const index = next++;
      results[index] = await tasks[index]();
    }
  }));
  return results;
}

function summaryLine(finding) {
  const label = LABELS[finding.fonte];
  const counts = finding.vagasBrasil === 0 ? `${finding.vagas} vagas, nenhuma no Brasil` : `${finding.vagas} vagas, ${finding.vagasBrasil} no Brasil`;
  // Quadro sem vaga no Brasil costuma ser homônimo ou página parada: não sugerir inclusão.
  const action = finding.jaNaBusca ? 'Já está na sua busca.'
    : finding.vagasBrasil === 0 ? 'Página existe, mas sem vaga no Brasil agora; confira se é a mesma empresa antes de incluir.'
    : `Para coletar, inclua "${finding.identificador}" em empresas.${finding.fonte} no busca.json.`;
  return `${label} (${finding.identificador}): ${counts}. ${action}`;
}

/**
 * Executa a descoberta: gera candidatos (--id primeiro, depois derivados do
 * nome), sonda as quatro fontes por empresa com paralelismo máximo 4 e
 * devolve o código de saída, escrevendo o JSON em stdout e o resumo em
 * português (achados e avisos) em stderr. `options.fetch` substitui a rede
 * nos testes.
 */
export async function discover(name, ids, options = {}) {
  const { stdout = console.log, stderr = console.error, signals = process, fetch: fetchOverride } = options;
  const fetchImpl = createFetch({ fetch: fetchOverride });

  let search = null;
  try { search = await loadSearch(options); } catch { search = null; }
  const jaNaBusca = (fonte, id) => Boolean(search?.empresas?.[fonte]?.includes(id));

  const merged = [...ids, ...generateCandidates(name)];
  const candidates = [...new Set(merged)].slice(0, 4);

  const controller = new AbortController();
  const stop = () => controller.abort();
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);

  const tasks = [];
  for (const candidate of candidates) {
    for (const [fonte, probe] of PROBES) {
      tasks.push(async () => {
        if (controller.signal.aborted) return null;
        try {
          const result = await probe(candidate, fetchImpl, controller.signal);
          if (!result) return null;
          return { type: 'found', finding: { fonte, identificador: candidate, ...result, jaNaBusca: jaNaBusca(fonte, candidate) } };
        } catch (error) {
          if (controller.signal.aborted) return null;
          return { type: 'warning', fonte, identificador: candidate, message: error?.message || 'Falha inesperada ao consultar a fonte.' };
        }
      });
    }
  }

  let outcomes;
  try { outcomes = await runLimited(tasks, 4, controller.signal); }
  finally { signals.removeListener('SIGINT', stop); signals.removeListener('SIGTERM', stop); }

  const findings = [], warnings = [];
  for (const outcome of outcomes) {
    if (!outcome) continue;
    if (outcome.type === 'found') findings.push(outcome.finding);
    else warnings.push(outcome);
  }
  findings.sort((a, b) => b.vagasBrasil - a.vagasBrasil);

  stdout(JSON.stringify(findings));
  for (const warning of warnings) stderr(`Aviso: ${LABELS[warning.fonte]} (${warning.identificador}): ${warning.message}`);

  if (controller.signal.aborted) return 130;
  if (!findings.length) {
    stderr(`Nenhum identificador de "${name}" foi encontrado em Greenhouse, Lever, Ashby ou InHire. O identificador costuma aparecer no endereço da página de carreiras da empresa (por exemplo, boards.greenhouse.io/<identificador> ou jobs.lever.co/<identificador>). Se souber o identificador exato, use --id.`);
    return 1;
  }
  for (const finding of findings) stderr(summaryLine(finding));
  return 0;
}
