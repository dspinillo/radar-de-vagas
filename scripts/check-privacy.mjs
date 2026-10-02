#!/usr/bin/env node
// Guarda de privacidade: varre o repositório e falha se encontrar dado pessoal.
// A lógica de detecção (texto -> achados) é pura e exportada para teste.
// O acesso a git e a disco fica isolado nas funções abaixo, fora da detecção.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLACEHOLDER_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'exemplo.com']);

function isPlaceholderEmail(email) {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (PLACEHOLDER_EMAIL_DOMAINS.has(domain.toLowerCase())) return true;
  if (/no-?reply/i.test(local)) return true;
  return false;
}

function findEmails(line) {
  const results = [];
  const regex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  let m;
  while ((m = regex.exec(line))) {
    if (!isPlaceholderEmail(m[0])) results.push({ type: 'e-mail', match: m[0] });
  }
  return results;
}

// Telefone formatado exige separador (parênteses, espaço, hífen ou +55).
const PHONE_REGEX =
  /(?:\+55[\s-]?)?\(\d{2}\)[\s-]?9?\d{4}-?\d{4}|\+55[\s-]?\d{2}[\s-]?9?\d{4}-?\d{4}|\b\d{2}[\s-]9?\d{4}-\d{4}\b/g;

// DDDs de fato emitidos pela Anatel. Sem essa lista, qualquer sequência de 11
// dígitos corridos (id longo, hash, código de rastreio) viraria falso positivo.
const VALID_BR_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Celular brasileiro sem formatação é DDD (2 dígitos) + 9 (nono dígito) + 8
// dígitos, sempre 11 dígitos corridos. Exigir DDD válido e nono dígito "9"
// evita marcar um id de vaga de 10 dígitos (comum neste projeto) ou qualquer
// outra sequência de dígitos sem cara de telefone; por isso sequência de 10
// dígitos nunca é acusada aqui, só de 11.
// Limitação aceita: um identificador puramente numérico de 11 dígitos que por
// coincidência comece com DDD válido seguido de "9" também é acusado como
// celular. Não há como diferenciar os dois só pelo formato; em exemplo ou
// resposta gravada de teste, use identificador fictício de outro tamanho ou
// com prefixo.
function isMobileDigits(digits) {
  if (!/^\d{11}$/.test(digits)) return false;
  const ddd = Number(digits.slice(0, 2));
  return digits[2] === '9' && VALID_BR_DDD.has(ddd);
}

function findPhones(line) {
  const results = [];
  const formatted = new RegExp(PHONE_REGEX);
  let m;
  while ((m = formatted.exec(line))) {
    results.push({ type: 'telefone', match: m[0] });
  }
  const plain = /\b\d{11}\b/g;
  while ((m = plain.exec(line))) {
    if (isMobileDigits(m[0])) results.push({ type: 'telefone', match: m[0] });
  }
  return results;
}

// Algoritmo oficial dos dígitos verificadores do CPF. Validar o dígito evita
// marcar qualquer sequência de 11 números (datas, ids, hashes) como CPF.
function isValidCPF(digits) {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calcDigit = (base) => {
    let sum = 0;
    let weight = base.length + 1;
    for (const ch of base) {
      sum += Number(ch) * weight;
      weight -= 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const base = digits.slice(0, 9);
  const d1 = calcDigit(base);
  const d2 = calcDigit(base + String(d1));
  return digits === base + String(d1) + String(d2);
}

// Mesma lógica do CPF, com os pesos oficiais do CNPJ.
function isValidCNPJ(digits) {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const calcDigit = (base, weights) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) sum += Number(base[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base = digits.slice(0, 12);
  const d1 = calcDigit(base, weights1);
  const d2 = calcDigit(base + String(d1), weights2);
  return digits === base + String(d1) + String(d2);
}

function findCPF(line) {
  const results = [];
  let m;
  const formatted = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
  while ((m = formatted.exec(line))) {
    if (isValidCPF(m[0].replace(/\D/g, ''))) results.push({ type: 'CPF', match: m[0] });
  }
  const plain = /\b\d{11}\b/g;
  while ((m = plain.exec(line))) {
    if (isValidCPF(m[0])) results.push({ type: 'CPF', match: m[0] });
  }
  return results;
}

function findCNPJ(line) {
  const results = [];
  let m;
  const formatted = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
  while ((m = formatted.exec(line))) {
    if (isValidCNPJ(m[0].replace(/\D/g, ''))) results.push({ type: 'CNPJ', match: m[0] });
  }
  const plain = /\b\d{14}\b/g;
  while ((m = plain.exec(line))) {
    if (isValidCNPJ(m[0])) results.push({ type: 'CNPJ', match: m[0] });
  }
  return results;
}

// O nome após "/Users/", "/home/" ou "C:\Users\" só conta como caminho real
// quando é feito de caracteres de nome de verdade; "..." (reticências) é o
// jeito como a própria documentação do projeto se refere ao caminho em
// abstrato e precisa passar.
function isPlaceholderPathSegment(segment) {
  return /^\.+$/.test(segment);
}

const USER_PATH_PATTERNS = [
  // "/Users/" com barra normal também casa dentro de "C:/Users/..." (caminho
  // do Windows escrito com barra normal), então não precisa de padrão à parte.
  /\/Users\/([A-Za-z0-9_.-]+)/g,
  /\/home\/([A-Za-z0-9_.-]+)/g,
  // uma ou mais barras invertidas: dentro de uma string JSON o caminho do
  // Windows aparece com barra dupla no texto cru do arquivo.
  /C:\\+Users\\+([A-Za-z0-9_.-]+)/gi,
];

function findUserPaths(line) {
  const results = [];
  for (const pattern of USER_PATH_PATTERNS) {
    const regex = new RegExp(pattern);
    let m;
    while ((m = regex.exec(line))) {
      if (isPlaceholderPathSegment(m[1])) continue;
      results.push({ type: 'caminho de usuário', match: m[0] });
    }
  }
  return results;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPrivateTerms(line, privateTerms) {
  const results = [];
  for (const term of privateTerms) {
    if (!term) continue;
    const regex = new RegExp(escapeRegExp(term), 'gi');
    let m;
    while ((m = regex.exec(line))) {
      results.push({ type: 'termo privado', match: m[0] });
    }
  }
  return results;
}

function splitLines(text) {
  return text.split(/\r\n|\r|\n/);
}

/**
 * Função pura de detecção: texto -> lista de achados.
 * `allowList` são linhas inteiras que, quando batem exatamente com uma linha
 * do texto, pulam a checagem daquela linha (exceções do .privacy-allow).
 * `privateTerms` são termos adicionais (nomes, empregadores) a procurar.
 */
export function scanContent(text, { allowList = [], privateTerms = [] } = {}) {
  const allowSet = new Set(allowList.map((l) => l.trim()).filter(Boolean));
  const findings = [];
  splitLines(text).forEach((line, idx) => {
    if (allowSet.has(line.trim())) return;
    const lineNumber = idx + 1;
    const lineFindings = [
      ...findEmails(line),
      ...findPhones(line),
      ...findCPF(line),
      ...findCNPJ(line),
      ...findUserPaths(line),
      ...findPrivateTerms(line, privateTerms),
    ];
    for (const f of lineFindings) findings.push({ line: lineNumber, ...f });
  });
  return findings;
}

// ---------- acesso a disco (separado da detecção) ----------

export function readPrivateTerms(homeDir = homedir()) {
  const file = path.join(homeDir, '.radar-de-vagas', 'privado.txt');
  if (!existsSync(file)) return [];
  const content = readFileSync(file, 'utf8');
  return splitLines(content)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function isBinaryBuffer(buffer) {
  const len = Math.min(buffer.length, 8000);
  for (let i = 0; i < len; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// ---------- acesso a git (separado da detecção) ----------
//
// A fonte de verdade é o ÍNDICE do git (o que está preparado para commit e o
// que já está rastreado), nunca o arquivo em disco: depois de um `git add`, a
// pessoa pode sobrescrever o arquivo no disco sem dar `git add` de novo, e o
// que de fato vai pro commit é o conteúdo que já está no índice. No GitHub o
// índice de um checkout limpo é igual ao disco, então o mesmo código serve.

const MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Lista as entradas do índice do git: caminho, sha do blob e modo.
 * Usa `-z` (saída terminada em NUL, sem aspas/escape octal no nome) para que
 * nome de arquivo acentuado ou com espaço não seja perdido no meio do caminho.
 */
export function listIndexEntries(repoRoot) {
  const buffer = execFileSync('git', ['ls-files', '-s', '-z'], {
    cwd: repoRoot,
    maxBuffer: MAX_BUFFER,
  });
  const raw = buffer.toString('utf8');
  return raw
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tabIndex = entry.indexOf('\t');
      const meta = entry.slice(0, tabIndex);
      const filePath = entry.slice(tabIndex + 1);
      const [mode, sha] = meta.split(' ');
      return { path: filePath, sha, mode };
    });
}

/** Lê o conteúdo de um blob do índice pelo sha, sem passar pelo disco. */
export function readBlobContent(repoRoot, sha) {
  return execFileSync('git', ['cat-file', '-p', sha], { cwd: repoRoot, maxBuffer: MAX_BUFFER });
}

/**
 * Lê as exceções de `.privacy-allow` do próprio índice do git, nunca do
 * disco: uma linha só vira exceção depois de um `git add` nela, senão
 * qualquer edição no arquivo em disco liberaria dado pessoal sem deixar
 * rastro no commit. Se `.privacy-allow` não estiver no índice, a lista é
 * vazia. `entries` é opcional, para reaproveitar uma listagem já feita.
 */
export function readAllowList(repoRoot, entries) {
  const indexEntries = entries ?? listIndexEntries(repoRoot);
  const entry = indexEntries.find((e) => e.path === '.privacy-allow');
  if (!entry) return [];
  const content = readBlobContent(repoRoot, entry.sha).toString('utf8');
  return splitLines(content).filter((l) => l.trim() && !l.trim().startsWith('#'));
}

/**
 * Varre o índice do git a partir da raiz do repositório informada (não do
 * diretório atual), o que permite testar contra um repositório temporário.
 */
export function scanRepository(repoRoot, { privateTerms = [] } = {}) {
  const entries = listIndexEntries(repoRoot);
  const allowList = readAllowList(repoRoot, entries);
  const findings = [];
  const errors = [];

  for (const entry of entries) {
    if (entry.mode === '160000') continue; // submódulo: não tem conteúdo de arquivo próprio

    let buffer;
    try {
      buffer = readBlobContent(repoRoot, entry.sha);
    } catch (err) {
      errors.push({ file: entry.path, message: err.message });
      continue;
    }

    if (isBinaryBuffer(buffer)) continue;

    const fileFindings = scanContent(buffer.toString('utf8'), { allowList, privateTerms });
    for (const f of fileFindings) findings.push({ file: entry.path, ...f });
  }

  return { findings, errors };
}

function resolveRepoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function main() {
  const repoRoot = resolveRepoRoot();
  const privateTerms = readPrivateTerms();
  const { findings, errors } = scanRepository(repoRoot, { privateTerms });

  // Erro de leitura nunca é silencioso: conta como achado para efeito de saída.
  for (const err of errors) {
    console.error(`Guarda de privacidade: erro ao ler ${err.file} do índice do git: ${err.message}`);
  }

  if (findings.length > 0) {
    console.error('Guarda de privacidade encontrou possível dado pessoal:');
    for (const f of findings) {
      console.error(`${f.file}:${f.line} - ${f.type}: ${f.match}`);
    }
    console.error(`\nTotal: ${findings.length} achado(s).`);
  }

  if (findings.length === 0 && errors.length === 0) {
    console.log('Guarda de privacidade: nenhum achado. Repositório limpo.');
    process.exit(0);
  }

  process.exit(1);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
