// Testes da guarda de privacidade.
//
// Atenção: nenhuma amostra aqui pode conter, de forma contígua no código-fonte,
// um dado com cara de real (e-mail, telefone, CPF, CNPJ, caminho de usuário),
// senão a própria checagem de privacidade acusaria este arquivo ao rodar sobre
// o repositório. Por isso toda amostra "positiva" é montada por concatenação
// de pedaços, nunca escrita como um único literal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { scanContent, readAllowList, readPrivateTerms, scanRepository } from '../scripts/check-privacy.mjs';

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'radar-privacy-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Helpers de integração: criam um repositório git de verdade num diretório
// temporário para reproduzir cenários que só existem com índice do git
// (arquivo preparado para commit, nome de arquivo acentuado).
function runGit(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function initGitRepo(repoRoot) {
  runGit(repoRoot, ['init', '-q']);
}

test('acusa e-mail real e deixa passar domínio de exemplo e noreply', () => {
  const emailReal = ['fulano.exemplo', '@', 'gmail.com'].join('');
  const texto = [
    `contato: ${emailReal}`,
    'suporte: contato@example.com',
    'suporte: contato@exemplo.com',
    'robo: noreply@qualquercoisa.com',
  ].join('\n');

  const achados = scanContent(texto);
  const emails = achados.filter((a) => a.type === 'e-mail');

  assert.equal(emails.length, 1);
  assert.equal(emails[0].match, emailReal);
  assert.equal(emails[0].line, 1);
});

test('acusa telefone brasileiro formatado, com e sem +55', () => {
  const comParenteses = ['(11)', ' 9' + '1234', '-5678'].join('');
  const comMais55 = ['+55 11 9', '1234-5678'].join('');
  const texto = [`fone: ${comParenteses}`, `fone: ${comMais55}`, 'não é telefone: 42'].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'telefone');

  assert.equal(achados.length, 2);
});

test('acusa CPF formatado e numérico quando o dígito verificador é válido', () => {
  // Número de dígitos verificadores válidos, citado em documentação técnica
  // brasileira como exemplo didático de CPF; não pertence a ninguém.
  const cpfFormatado = ['111.444.777', '-35'].join('');
  const cpfPlano = ['111444777', '35'].join('');
  const cpfInvalido = ['123456789', '00'].join(''); // dígito verificador não bate

  const texto = [`cpf: ${cpfFormatado}`, `cpf: ${cpfPlano}`, `cpf: ${cpfInvalido}`].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'CPF');

  assert.equal(achados.length, 2);
  assert.ok(achados.some((a) => a.match === cpfFormatado));
  assert.ok(achados.some((a) => a.match === cpfPlano));
});

test('acusa CNPJ formatado e numérico quando o dígito verificador é válido', () => {
  // Número de dígitos verificadores válidos, usado como exemplo didático de
  // CNPJ; não pertence a nenhuma empresa real.
  const cnpjFormatado = ['11.222.333', '/0001-81'].join('');
  const cnpjPlano = ['11222333000', '181'].join('');
  const cnpjInvalido = ['1234567800', '0100'].join('');

  const texto = [`cnpj: ${cnpjFormatado}`, `cnpj: ${cnpjPlano}`, `cnpj: ${cnpjInvalido}`].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'CNPJ');

  assert.equal(achados.length, 2);
  assert.ok(achados.some((a) => a.match === cnpjFormatado));
  assert.ok(achados.some((a) => a.match === cnpjPlano));
});

test('acusa caminho de usuário real e deixa passar o placeholder com reticências', () => {
  const nomeFake = ['fula', 'no'].join('');
  const caminhoUnix = ['/Users/', nomeFake, '/projetos'].join('');
  const caminhoHome = ['/home/', nomeFake, '/projetos'].join('');
  const caminhoWindows = ['C:\\Users\\', nomeFake, '\\projetos'].join('');
  const texto = [
    caminhoUnix,
    caminhoHome,
    caminhoWindows,
    'exemplo genérico: /Users/.../projeto',
    'exemplo genérico: C:\\Users\\...\\projeto',
  ].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'caminho de usuário');

  assert.equal(achados.length, 3);
});

test('.privacy-allow suprime uma linha específica, mas não as outras', () => {
  const emailReal = ['pessoa.permitida', '@', 'gmail.com'].join('');
  const outroEmailReal = ['pessoa.nao.permitida', '@', 'gmail.com'].join('');
  const linhaPermitida = `copyright: ${emailReal}`;
  const texto = [linhaPermitida, `contato: ${outroEmailReal}`].join('\n');

  const achados = scanContent(texto, { allowList: [linhaPermitida] });

  assert.equal(achados.length, 1);
  assert.equal(achados[0].match, outroEmailReal);
});

test('readAllowList lê .privacy-allow do índice do git, ignorando comentário e linha em branco', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const conteudo = ['# comentário', '', 'linha exata permitida', ''].join('\n');
    writeFileSync(path.join(dir, '.privacy-allow'), conteudo, 'utf8');
    runGit(dir, ['add', '.privacy-allow']);

    const lista = readAllowList(dir);

    assert.deepEqual(lista, ['linha exata permitida']);
  });
});

test('readAllowList retorna lista vazia quando .privacy-allow não está no índice', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    assert.deepEqual(readAllowList(dir), []);
  });
});

test('readAllowList ignora .privacy-allow que existe só em disco, fora do índice', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    // escreve no disco mas nunca dá `git add`: não deve contar como exceção.
    writeFileSync(path.join(dir, '.privacy-allow'), 'linha qualquer\n', 'utf8');

    assert.deepEqual(readAllowList(dir), []);
  });
});

test('readPrivateTerms lê termo de diretório temporário (nunca do home real)', () => {
  withTempDir((dir) => {
    const fakeHome = path.join(dir, 'home-fake');
    const privadoDir = path.join(fakeHome, '.radar-de-vagas');
    const nomeFake = ['Fulano', ' de Tal'].join('');
    mkdirSync(privadoDir, { recursive: true });
    writeFileSync(path.join(privadoDir, 'privado.txt'), `${nomeFake}\n`, 'utf8');

    const termos = readPrivateTerms(fakeHome);

    assert.deepEqual(termos, [nomeFake]);
  });
});

test('readPrivateTerms retorna lista vazia quando o arquivo não existe', () => {
  withTempDir((dir) => {
    assert.deepEqual(readPrivateTerms(path.join(dir, 'sem-nada')), []);
  });
});

test('termo da lista privada é encontrado pelo scanContent sem diferenciar maiúsculas', () => {
  const nomeFake = ['Fulano', ' de Tal'].join('');
  const texto = [`entrevista com ${nomeFake.toUpperCase()}`, 'linha neutra'].join('\n');

  const achados = scanContent(texto, { privateTerms: [nomeFake] });

  assert.equal(achados.length, 1);
  assert.equal(achados[0].type, 'termo privado');
  assert.equal(achados[0].line, 1);
});

test('acusa celular de 11 dígitos corridos com DDD válido, mas não 10 dígitos nem id com prefixo', () => {
  const celular = ['119', '87654321'].join(''); // DDD 11 + nono dígito 9 + 8 dígitos = 11 no total
  const dezDigitos = '4471436917'; // 10 dígitos: cara de id de vaga, não de telefone
  const idDeVaga = ['li-', dezDigitos].join('');
  const texto = [`fone: ${celular}`, `id: ${dezDigitos}`, `vaga: ${idDeVaga}`].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'telefone');

  assert.equal(achados.length, 1);
  assert.equal(achados[0].match, celular);
});

test('não acusa 11 dígitos corridos quando o DDD não existe ou o nono dígito não é 9', () => {
  const dddInexistente = ['209', '87654321'].join(''); // "20" não é DDD da Anatel
  const semNono = ['118', '87654321'].join(''); // terceiro dígito não é 9
  const texto = [`fone: ${dddInexistente}`, `fone: ${semNono}`].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'telefone');

  assert.equal(achados.length, 0);
});

test('acusa caminho do Windows com barra dupla (como em string JSON) e com barra normal', () => {
  const nomeFake = ['fula', 'no'].join('');
  const barraDupla = ['C:\\\\Users\\\\', nomeFake, '\\\\projeto'].join('');
  const barraNormal = ['C:/Users/', nomeFake, '/projeto'].join('');
  const texto = [barraDupla, barraNormal].join('\n');

  const achados = scanContent(texto).filter((a) => a.type === 'caminho de usuário');

  assert.equal(achados.length, 2);
});

test('índice do git é a fonte de verdade: arquivo sujo no índice mas limpo em disco ainda acusa', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const relPath = 'arquivo.md';
    const absPath = path.join(dir, relPath);
    const emailSujo = ['sujo.no.indice', '@', 'gmail.com'].join('');

    writeFileSync(absPath, `contato: ${emailSujo}\n`, 'utf8');
    runGit(dir, ['add', relPath]);
    // sobrescreve o arquivo no disco sem dar `git add` de novo: o índice
    // continua com o conteúdo sujo, que é o que de fato iria pro commit.
    writeFileSync(absPath, 'conteudo limpo, sem dado pessoal\n', 'utf8');

    const { findings, errors } = scanRepository(dir);

    assert.deepEqual(errors, []);
    assert.ok(findings.some((f) => f.file === relPath && f.match === emailSujo));
  });
});

test('arquivo com nome acentuado e espaço no índice é escaneado, não ignorado em silêncio', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const relPath = 'relatório da vaga.md';
    const emailReal = ['nome.acentuado', '@', 'gmail.com'].join('');

    writeFileSync(path.join(dir, relPath), `contato: ${emailReal}\n`, 'utf8');
    runGit(dir, ['add', relPath]);

    const { findings, errors } = scanRepository(dir);

    assert.deepEqual(errors, []);
    assert.ok(findings.some((f) => f.file === relPath && f.match === emailReal));
  });
});

test('scanRepository sai limpo (sem achados nem erros) quando o índice não tem dado pessoal', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    writeFileSync(path.join(dir, 'leia-me.md'), 'nada de pessoal aqui\n', 'utf8');
    runGit(dir, ['add', 'leia-me.md']);

    const { findings, errors } = scanRepository(dir);

    assert.deepEqual(findings, []);
    assert.deepEqual(errors, []);
  });
});

test('.privacy-allow só vale como está no índice: linha acrescentada só em disco não libera nada', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const relPath = 'arquivo.md';
    const emailReal = ['bypass.so.no.disco', '@', 'gmail.com'].join('');
    const linha = `contato: ${emailReal}`;

    writeFileSync(path.join(dir, relPath), `${linha}\n`, 'utf8');
    runGit(dir, ['add', relPath]);

    // acrescenta a mesma linha ao .privacy-allow só no disco, sem `git add`
    // nele: não pode virar exceção, senão o commit levaria o e-mail sem
    // deixar rastro da exceção usada.
    writeFileSync(path.join(dir, '.privacy-allow'), `${linha}\n`, 'utf8');

    const { findings, errors } = scanRepository(dir);

    assert.deepEqual(errors, []);
    assert.ok(findings.some((f) => f.file === relPath && f.match === emailReal));
  });
});

test('.privacy-allow adicionado ao índice libera a linha exata', () => {
  withTempDir((dir) => {
    initGitRepo(dir);
    const relPath = 'arquivo.md';
    const emailReal = ['liberado.no.indice', '@', 'gmail.com'].join('');
    const linha = `contato: ${emailReal}`;

    writeFileSync(path.join(dir, relPath), `${linha}\n`, 'utf8');
    runGit(dir, ['add', relPath]);
    writeFileSync(path.join(dir, '.privacy-allow'), `${linha}\n`, 'utf8');
    runGit(dir, ['add', '.privacy-allow']);

    const { findings, errors } = scanRepository(dir);

    assert.deepEqual(errors, []);
    assert.ok(!findings.some((f) => f.file === relPath));
  });
});
