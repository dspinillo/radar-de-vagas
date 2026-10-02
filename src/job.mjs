// Formato único da vaga e as funções puras que toda fonte e todo consumidor usam.
// Ver decisions/0003-estado-e-identidade.md para o porquê de cada regra.

// Entidades HTML nomeadas comuns. Cobre o básico (&amp; &lt; ...) e as letras
// acentuadas do português, que aparecem com frequência em descrição de vaga.
// Pontuação tipográfica usa String.fromCharCode para não depender de escape
// de código, e para nenhum caractere especial (como travessão) ficar literal
// no arquivo-fonte.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: String.fromCharCode(8211),
  mdash: String.fromCharCode(8212),
  hellip: String.fromCharCode(8230),
  lsquo: String.fromCharCode(8216),
  rsquo: String.fromCharCode(8217),
  ldquo: String.fromCharCode(8220),
  rdquo: String.fromCharCode(8221),
  trade: String.fromCharCode(8482),
  copy: String.fromCharCode(169),
  reg: String.fromCharCode(174),
  deg: String.fromCharCode(176),
  middot: String.fromCharCode(183),
  bull: String.fromCharCode(8226),
  aacute: 'á',
  Aacute: 'Á',
  agrave: 'à',
  Agrave: 'À',
  acirc: 'â',
  Acirc: 'Â',
  atilde: 'ã',
  Atilde: 'Ã',
  auml: 'ä',
  Auml: 'Ä',
  aring: 'å',
  Aring: 'Å',
  aelig: 'æ',
  AElig: 'Æ',
  eacute: 'é',
  Eacute: 'É',
  egrave: 'è',
  Egrave: 'È',
  ecirc: 'ê',
  Ecirc: 'Ê',
  euml: 'ë',
  Euml: 'Ë',
  iacute: 'í',
  Iacute: 'Í',
  igrave: 'ì',
  Igrave: 'Ì',
  icirc: 'î',
  Icirc: 'Î',
  iuml: 'ï',
  Iuml: 'Ï',
  oacute: 'ó',
  Oacute: 'Ó',
  ograve: 'ò',
  Ograve: 'Ò',
  ocirc: 'ô',
  Ocirc: 'Ô',
  otilde: 'õ',
  Otilde: 'Õ',
  ouml: 'ö',
  Ouml: 'Ö',
  oslash: 'ø',
  Oslash: 'Ø',
  uacute: 'ú',
  Uacute: 'Ú',
  ugrave: 'ù',
  Ugrave: 'Ù',
  ucirc: 'û',
  Ucirc: 'Û',
  uuml: 'ü',
  Uuml: 'Ü',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  yacute: 'ý',
  Yacute: 'Ý',
  yuml: 'ÿ',
  szlig: 'ß',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isNaN(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}

// Padrão de nome de fonte: minúsculo, sem espaço, sem dois-pontos.
// Compartilhado com validateSource (src/sources/index.mjs) para não duplicar
// a regra. O "source" da vaga precisa seguir o mesmo padrão porque makeId
// junta source e sourceId com dois-pontos, e quem separa o id de volta faz
// isso cortando no PRIMEIRO dois-pontos.
export const SOURCE_NAME_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Deriva o identificador único da vaga a partir da fonte e do id dentro dela.
 * A leitura de volta corta no PRIMEIRO dois-pontos: por isso "source" nunca
 * pode ter dois-pontos (ver SOURCE_NAME_PATTERN), enquanto "sourceId" pode
 * conter dois-pontos e barra livremente.
 */
export function makeId(source, sourceId) {
  return `${source}:${sourceId}`;
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);

// Lista fechada de elementos HTML comuns (comparação sem diferenciar caixa).
// Qualquer nome fora daqui (<String>, <K,V>, <estranho>, texto de programação
// como "List<String>") nunca é lido como tag: fica no texto como está.
const KNOWN_ELEMENTS = new Set([
  'p', 'div', 'span', 'a', 'ul', 'ol', 'li', 'br', 'hr',
  'b', 'i', 'em', 'strong', 'u', 's', 'small', 'sub', 'sup', 'mark', 'del', 'ins',
  'abbr', 'cite', 'q', 'code', 'pre', 'kbd', 'samp', 'var',
  'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'img', 'figure', 'figcaption', 'picture', 'source', 'track', 'video', 'audio',
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'address',
  'label', 'button', 'form', 'input', 'select', 'option', 'optgroup', 'textarea', 'fieldset', 'legend',
  'dl', 'dt', 'dd', 'details', 'summary', 'time', 'template', 'script', 'style',
  'title', 'head', 'body', 'html', 'meta', 'link', 'base', 'iframe', 'svg', 'path',
  'center', 'strike', 'font', 'big', 'tt', 'wbr', 'noscript', 'canvas', 'dialog',
  'data', 'output', 'progress', 'meter', 'ruby', 'rt', 'rp', 'bdi', 'bdo',
]);

const TAG_NAME_CHAR = /[a-zA-Z0-9]/;
const SPACE_CHAR = /\s/;
const ATTR_NAME_PATTERN = /^[A-Za-z0-9_:-]+$/;

function splitAttrTokens(text) {
  const tokens = [];
  const m = text.length;
  let k = 0;
  const skipSpace = () => {
    while (k < m && SPACE_CHAR.test(text[k])) k += 1;
  };
  const readPiece = () => {
    const start = k;
    while (k < m && !SPACE_CHAR.test(text[k])) {
      const c = text[k];
      if (c === '"' || c === "'") {
        const closeAt = text.indexOf(c, k + 1);
        k = closeAt === -1 ? m : closeAt + 1;
      } else {
        k += 1;
      }
    }
    return text.slice(start, k);
  };
  while (true) {
    skipSpace();
    if (k >= m) break;
    let token = readPiece();
    // Junta "nome = valor" escrito com espaços em volta do "=".
    while (true) {
      const save = k;
      skipSpace();
      if (k < m && (token.endsWith('=') || text[k] === '=')) {
        token += readPiece();
        continue;
      }
      k = save;
      break;
    }
    tokens.push(token);
  }
  return tokens;
}

function isPlausibleAttrToken(rawToken) {
  let token = rawToken;
  if (token.endsWith('/')) token = token.slice(0, -1);
  if (token === '') return true;
  const eq = token.indexOf('=');
  const name = eq === -1 ? token : token.slice(0, eq);
  return name !== '' && ATTR_NAME_PATTERN.test(name);
}

// Regra 4: cada item do trecho de atributos é "nome" ou "nome=valor", com o
// nome só em letras ASCII, dígitos, hífen, sublinhado ou dois-pontos. Prosa
// comum ("então", "bônus.") tem acento ou pontuação colada e reprova aqui,
// o que impede que uma frase vire atributo só por ter um "<" e um ">" perto.
function attrsArePlausible(attrsText) {
  return splitAttrTokens(attrsText).every(isPlausibleAttrToken);
}

/**
 * Varredor de tag em passagem única.
 *
 * PRINCÍPIO: NA DÚVIDA, PRESERVA O TEXTO. Deixar passar um pedaço de
 * marcação no resultado é aceitável; perder uma frase real da vaga não é.
 * Por isso nenhum construto sem terminador claro (tag, aspa, comentário,
 * <script>/<style>) pode consumir o que vem depois: se não achar o fim de
 * forma inequívoca, o "<" que deu início vira caractere comum e a leitura
 * continua logo depois dele, sem descartar nada.
 *
 * As buscas à frente (achar o próximo '>', a aspa de fechamento, o
 * "</script") usam caches que só andam para a frente. Uma busca que falhou
 * (por exemplo, não existe mais nenhum '>' no resto do documento) nunca se
 * repete do zero a partir da próxima posição: por isso o tempo total
 * continua linear mesmo em entrada adversária e repetitiva.
 */
function stripTags(html) {
  const n = html.length;
  let out = '';
  let i = 0;

  let gtPos = -2;
  function nextGtAtOrAfter(p) {
    if (gtPos === -1) return -1;
    if (gtPos !== -2 && gtPos >= p) return gtPos;
    gtPos = html.indexOf('>', p);
    return gtPos;
  }

  const quoteCache = { '"': -2, "'": -2 };
  function nextQuoteAtOrAfter(quoteChar, p) {
    if (quoteCache[quoteChar] === -1) return -1;
    if (quoteCache[quoteChar] !== -2 && quoteCache[quoteChar] >= p) return quoteCache[quoteChar];
    quoteCache[quoteChar] = html.indexOf(quoteChar, p);
    return quoteCache[quoteChar];
  }

  // Um comentário fecha em "-->" ou "--!>", e "<!-->" já é um comentário
  // vazio: por isso a busca começa logo depois de "<!".
  const COMMENT_CLOSE = /--!?>/g;
  let commentClose; // undefined = ainda não buscou; null = não existe mais
  function nextCommentCloseAtOrAfter(p) {
    if (commentClose === null) return null;
    if (commentClose && commentClose.pos >= p) return commentClose;
    COMMENT_CLOSE.lastIndex = p;
    const found = COMMENT_CLOSE.exec(html);
    commentClose = found ? { pos: found.index, len: found[0].length } : null;
    return commentClose;
  }

  // Busca sem diferenciar caixa direto no texto original. Passar o documento
  // inteiro para minúsculas mudaria o tamanho dele com certos caracteres e
  // desalinharia os índices.
  const RAW_CLOSE = { script: /<\/script/gi, style: /<\/style/gi };
  const rawCloseCache = { script: -2, style: -2 };
  function nextRawMarkerAtOrAfter(tagName, p) {
    if (rawCloseCache[tagName] === -1) return -1;
    if (rawCloseCache[tagName] !== -2 && rawCloseCache[tagName] >= p) return rawCloseCache[tagName];
    const re = RAW_CLOSE[tagName];
    re.lastIndex = p;
    const found = re.exec(html);
    rawCloseCache[tagName] = found ? found.index : -1;
    return rawCloseCache[tagName];
  }

  let ltPos = -2;
  function nextLtAtOrAfter(p) {
    if (ltPos === -1) return -1;
    if (ltPos !== -2 && ltPos >= p) return ltPos;
    ltPos = html.indexOf('<', p);
    return ltPos;
  }

  // Acha o '>' não citado que fecha a tag iniciada em startPos (posição logo
  // após o nome). Aborta (não era tag) se, antes disso, aparecer outro '<'
  // fora de aspas ou o fim da entrada (regra 2).
  //
  // Aspas (regra 3), dois critérios simples e determinísticos:
  // - Uma aspa só abre valor de atributo quando vem depois de "=" (com ou
  //   sem espaço entre os dois).
  //   Aspa solta no trecho de atributos significa que não era tag.
  // - O valor entre aspas não pode conter "<". É raro em HTML de verdade e é
  //   justamente o que acontece quando uma aspa ficou aberta: ela "fecharia"
  //   na aspa de uma tag seguinte e engoliria o texto entre as duas. Nesse
  //   caso a tag fica no resultado como texto, o que é ruído e não perda.
  function scanTagTail(startPos) {
    let k = startPos;
    while (k < n) {
      const c = html[k];

      if (c === '"' || c === "'") {
        let b = k - 1;
        while (b >= startPos && SPACE_CHAR.test(html[b])) b -= 1;
        if (html[b] !== '=') return { ok: false };
        const closeAt = nextQuoteAtOrAfter(c, k + 1);
        if (closeAt === -1) return { ok: false };
        const ltAt = nextLtAtOrAfter(k + 1);
        if (ltAt !== -1 && ltAt < closeAt) return { ok: false };
        k = closeAt + 1;
        continue;
      }

      if (c === '<') return { ok: false };

      if (c === '>') {
        const attrsText = html.slice(startPos, k);
        if (!attrsArePlausible(attrsText)) return { ok: false };
        return { ok: true, end: k };
      }

      k += 1;
    }
    return { ok: false };
  }

  // Acha o '>' que fecha a tag de fechamento (</script ou </style) a partir
  // de `from`, pulando falsos positivos como "</scripts". Devolve -1 se não
  // existir (caso em que a regra 5 descarta só a tag de abertura).
  function findRawTextClose(tagName, from) {
    const marker = `</${tagName}`;
    let searchFrom = from;
    while (true) {
      const pos = nextRawMarkerAtOrAfter(tagName, searchFrom);
      if (pos === -1) return -1;
      const after = html[pos + marker.length];
      if (after === undefined || after === '>' || SPACE_CHAR.test(after)) {
        const gt = nextGtAtOrAfter(pos + marker.length);
        return gt;
      }
      searchFrom = pos + 1;
    }
  }

  while (i < n) {
    const ch = html[i];

    if (ch !== '<') {
      out += ch;
      i += 1;
      continue;
    }

    if (nextGtAtOrAfter(i) === -1) {
      // Não existe mais nenhum '>' no resto do documento: nada daqui para
      // frente pode fechar tag, comentário ou <script>/<style>. Preserva
      // tudo como texto de uma vez (regra 2/3, caso extremo).
      out += html.slice(i);
      break;
    }

    if (html.startsWith('<!--', i)) {
      const close = nextCommentCloseAtOrAfter(i + 2);
      if (close === null) {
        // Não fecha: o "<!--" vira texto comum, leitura continua logo depois (regra 5).
        out += '<!--';
        i += 4;
        continue;
      }
      i = close.pos + close.len;
      continue;
    }

    const next = html[i + 1];
    const isClosing = next === '/';
    const nameStart = isClosing ? i + 2 : i + 1;

    let j = nameStart;
    while (j < n && TAG_NAME_CHAR.test(html[j])) j += 1;
    const rawName = html.slice(nameStart, j);
    const tagName = rawName.toLowerCase();

    if (rawName === '' || !KNOWN_ELEMENTS.has(tagName)) {
      // Nome vazio ou desconhecido (regra 1): "<" vira caractere comum.
      out += ch;
      i += 1;
      continue;
    }

    const afterName = html[j] ?? '';
    if (afterName !== '>' && afterName !== '/' && !SPACE_CHAR.test(afterName)) {
      // Nome conhecido, mas não termina em espaço, '/' ou '>' (regra 1):
      // não era essa tag (ex.: "<a<a", "<divisao").
      out += ch;
      i += 1;
      continue;
    }

    const scan = scanTagTail(j);
    if (!scan.ok) {
      out += ch;
      i += 1;
      continue;
    }

    if (!isClosing && RAW_TEXT_TAGS.has(tagName)) {
      const closeGt = findRawTextClose(tagName, scan.end + 1);
      if (closeGt === -1) {
        // <script>/<style> sem fechamento: descarta só a tag de abertura
        // (regra 5); o resto volta a ser texto normal, nunca é descartado.
        i = scan.end + 1;
        continue;
      }
      i = closeGt + 1;
      continue;
    }

    if (!isClosing) {
      if (tagName === 'li') out += '\n- ';
      else if (BLOCK_TAGS.has(tagName)) out += '\n';
      else if (tagName === 'br') out += '\n';
    } else if (BLOCK_TAGS.has(tagName)) {
      out += '\n\n';
    }
    // </li> fecha sem emitir nada extra; a marcação "- " já saiu na abertura.

    i = scan.end + 1;
  }

  return out;
}

const NBSP = String.fromCharCode(160);
const SPACE_RUN = new RegExp(`[ \\t\\f\\v${NBSP}]+`, 'g');

/**
 * Converte a descrição em HTML da vaga para texto puro, sem truncar nada.
 * Remove <script>, <style> (quando bem formados, com o conteúdo) e
 * comentários (quando bem formados, com o conteúdo). Preserva quebra entre
 * parágrafos (linha em branco) e cada <li> vira uma linha começando com
 * "- ". Entidades HTML (nomeadas comuns e numéricas) são decodificadas e
 * espaços em excesso são normalizados. Tempo linear no tamanho da entrada,
 * mesmo em HTML malformado: ver o comentário de stripTags para o princípio
 * ("na dúvida, preserva o texto") e as garantias de desempenho.
 *
 * Limitação aceita (documentada em docs/contrato-de-fonte.md): um elemento
 * conhecido com atributos plausíveis escrito em prosa comum (ex.: "a<b and
 * c > d") ainda é lido como tag, como um navegador faria. Por isso só use
 * stripHtml no campo que a fonte entrega como HTML; texto que já vem puro
 * não deve passar por aqui.
 */
export function stripHtml(html) {
  if (typeof html !== 'string') return '';

  let text = stripTags(html);
  text = decodeEntities(text);

  const lines = text.split('\n').map((line) => line.replace(SPACE_RUN, ' ').trim());

  const normalizedLines = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line === '') {
      blankRun += 1;
      if (blankRun === 1) normalizedLines.push('');
    } else {
      blankRun = 0;
      normalizedLines.push(line);
    }
  }

  return normalizedLines.join('\n').trim();
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidCivilDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const REQUIRED_STRING_FIELDS = ['source', 'sourceId', 'url', 'title', 'company', 'description'];
const NULLABLE_STRING_FIELDS = ['location', 'salary', 'employmentType'];
const WORK_MODELS = new Set(['remote', 'hybrid', 'onsite']);
const FORBIDDEN_FIELDS = ['id', 'collectedAt'];
const KNOWN_FIELDS = new Set([
  ...REQUIRED_STRING_FIELDS,
  'applyUrl',
  'workModel',
  'publishedAt',
  ...NULLABLE_STRING_FIELDS,
]);

/**
 * Valida o formato único da vaga. Devolve a lista de problemas em português;
 * lista vazia significa vaga válida. Não lança exceção.
 *
 * Campos anuláveis (applyUrl, location, workModel, publishedAt, salary,
 * employmentType) podem faltar: ausência vale como null. Quem escreve uma
 * fonte não precisa lembrar de escrever `campo: null` para cada um.
 */
export function validateJob(job) {
  if (job === null || typeof job !== 'object' || Array.isArray(job)) {
    return ['a vaga precisa ser um objeto'];
  }

  const problems = [];

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = job[field];
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`campo "${field}" é obrigatório e precisa ser uma string não vazia`);
    }
  }

  if (typeof job.source === 'string' && job.source.trim() !== '' && !SOURCE_NAME_PATTERN.test(job.source)) {
    problems.push('campo "source" precisa seguir o mesmo padrão de nome das fontes (minúsculo, sem espaço, sem dois-pontos)');
  }

  if (typeof job.url === 'string' && job.url.trim() !== '' && !isHttpUrl(job.url)) {
    problems.push('campo "url" precisa ser um endereço http(s) válido');
  }

  const applyUrl = 'applyUrl' in job ? job.applyUrl : null;
  if (applyUrl !== null && !isHttpUrl(applyUrl)) {
    problems.push('campo "applyUrl" precisa ser um endereço http(s) válido ou null');
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    const value = field in job ? job[field] : null;
    if (value !== null && typeof value !== 'string') {
      problems.push(`campo "${field}" precisa ser string ou null`);
    }
  }

  const workModel = 'workModel' in job ? job.workModel : null;
  if (workModel !== null && !WORK_MODELS.has(workModel)) {
    problems.push('campo "workModel" precisa ser "remote", "hybrid", "onsite" ou null');
  }

  const publishedAt = 'publishedAt' in job ? job.publishedAt : null;
  if (publishedAt !== null && !isValidCivilDate(publishedAt)) {
    problems.push('campo "publishedAt" precisa ser uma data "AAAA-MM-DD" válida ou null');
  }

  for (const field of FORBIDDEN_FIELDS) {
    if (field in job) {
      problems.push(`campo "${field}" não pertence à vaga, é escrito pela coleta`);
    }
  }

  for (const key of Object.keys(job)) {
    if (!KNOWN_FIELDS.has(key) && !FORBIDDEN_FIELDS.includes(key)) {
      problems.push(`campo desconhecido: "${key}"`);
    }
  }

  return problems;
}

function normalizeWords(value) {
  const stripped = String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return stripped === '' ? [] : stripped.split(' ');
}

// "SA" só é sufixo societário quando aparece, no texto ORIGINAL (antes de
// baixar a caixa), como "S.A.", "S/A" ou "SA" em maiúsculas, E precedido do
// início do nome ou de um separador (espaço, vírgula, ponto ou hífen).
// "Sa" e "Sá" são nome de pessoa ou de empresa, não sufixo: a comparação é
// sensível a caixa de propósito. Exigir separador evita que o final de uma
// palavra comum (ex.: "ROSA") seja lido como o sufixo "SA".
const SA_EXACT_SUFFIX = /(?:^|[\s,.-]+)(S\.A\.|S\/A|SA)\s*$/;

function stripExactSaSuffix(original) {
  const match = SA_EXACT_SUFFIX.exec(original);
  if (!match) return original;
  const withoutSuffix = original.slice(0, match.index).trim();
  // Nunca remove o sufixo se isso deixar o nome vazio (ex.: empresa chamada só "S.A.").
  return withoutSuffix === '' ? original : withoutSuffix;
}

// Os demais sufixos valem em qualquer caixa, por isso são checados depois de
// normalizar (minúsculas) e tokenizar.
const OTHER_CORPORATE_SUFFIXES = new Set([
  'ltda',
  'ltd',
  'inc',
  'incorporated',
  'llc',
  'corp',
  'corporation',
  'limitada',
  'limited',
]);

function stripOtherSuffixWord(words) {
  if (words.length <= 1) return words;
  const last = words[words.length - 1];
  return OTHER_CORPORATE_SUFFIXES.has(last) ? words.slice(0, -1) : words;
}

function normalizeCompanyWords(company) {
  const withoutSa = stripExactSaSuffix(company);
  return stripOtherSuffixWord(normalizeWords(withoutSa));
}

/**
 * Chave de deduplicação sugerida: empresa (sem sufixo societário) e título,
 * normalizados (minúsculas, sem acento, sem pontuação, espaços colapsados).
 * Só sugere; a fusão de verdade exige evidência forte (ver ADR 0003).
 * `company`/`title` ausentes contam como texto vazio, nunca como "undefined".
 */
export function dedupKey(job) {
  const company = job && typeof job.company === 'string' ? job.company : '';
  const title = job && typeof job.title === 'string' ? job.title : '';
  const companyWords = normalizeCompanyWords(company);
  const titleWords = normalizeWords(title);
  return `${companyWords.join(' ')}|${titleWords.join(' ')}`;
}
