import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeId, stripHtml, validateJob, dedupKey } from '../src/job.mjs';

// Limite folgado de propósito: a versão quadrática levava mais de 4 segundos
// nessas entradas e a linear leva dezenas de milissegundos. Um limite justo
// (200 ms) falhava à toa com a máquina ocupada rodando os outros testes.
const LINEAR_LIMIT_MS = 1500;

function vagaValida(extra = {}) {
  return {
    source: 'aurora',
    sourceId: 'aurora/123',
    url: 'https://carreiras.aurorapagamentos.exemplo/vagas/123',
    applyUrl: 'https://carreiras.aurorapagamentos.exemplo/vagas/123/inscricao',
    title: 'Analista de Planejamento Comercial',
    company: 'Aurora Pagamentos',
    location: 'Remoto (Brasil)',
    workModel: 'remote',
    description: 'Descrição completa da vaga.',
    publishedAt: '2026-09-20',
    salary: 'R$ 6.000 a R$ 8.000',
    employmentType: 'CLT',
    ...extra,
  };
}

test('makeId junta fonte e id da fonte com dois-pontos', () => {
  assert.equal(makeId('aurora', 'aurora/123'), 'aurora:aurora/123');
  assert.equal(makeId('gupy', '987'), 'gupy:987');
});

test('stripHtml remove tags e preserva parágrafos', () => {
  const html = '<p>Primeiro parágrafo.</p><p>Segundo parágrafo.</p>';
  assert.equal(stripHtml(html), 'Primeiro parágrafo.\n\nSegundo parágrafo.');
});

test('stripHtml transforma cada <li> em linha começando com "- "', () => {
  const html = '<p>Requisitos:</p><ul><li>Item um</li><li>Item dois</li></ul>';
  const resultado = stripHtml(html);
  assert.equal(resultado, 'Requisitos:\n\n- Item um\n- Item dois');
});

test('stripHtml decodifica entidades nomeadas e numéricas', () => {
  const html = '<p>Vaga em S&atilde;o Paulo, &amp; regi&#227;o. Sal&#225;rio &gt; R$5000.</p>';
  assert.equal(stripHtml(html), 'Vaga em São Paulo, & região. Salário > R$5000.');
});

test('stripHtml normaliza espaços em excesso sem truncar', () => {
  const html = '<p>Texto   com      espaços\t\tem   excesso.</p>';
  assert.equal(stripHtml(html), 'Texto com espaços em excesso.');
});

test('stripHtml preserva descrição longa (mais de 50000 caracteres) inteira', () => {
  const paragrafo = 'Responsabilidade detalhada da vaga, repetida para simular um anúncio longo. ';
  let corpo = '';
  while (corpo.length < 50000) {
    corpo += paragrafo;
  }
  corpo += 'MARCA-FINAL-DO-TEXTO';
  const html = `<p>${corpo}</p>`;
  const resultado = stripHtml(html);
  assert.ok(resultado.length >= 50000, 'resultado não pode ser truncado');
  assert.ok(resultado.endsWith('MARCA-FINAL-DO-TEXTO'), 'o final do texto precisa sobreviver inteiro');
  assert.ok(resultado.includes(paragrafo.trim().slice(0, 20)));
});

test('validateJob aceita uma vaga válida', () => {
  assert.deepEqual(validateJob(vagaValida()), []);
});

test('validateJob aceita campos nuláveis como null', () => {
  const vaga = vagaValida({
    applyUrl: null,
    location: null,
    workModel: null,
    publishedAt: null,
    salary: null,
    employmentType: null,
  });
  assert.deepEqual(validateJob(vaga), []);
});

test('validateJob rejeita campo obrigatório ausente ou vazio', () => {
  const vaga = vagaValida({ title: '' });
  delete vaga.company;
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"title"')));
  assert.ok(problemas.some((p) => p.includes('"company"')));
});

test('validateJob rejeita tipo errado em campo obrigatório', () => {
  const vaga = vagaValida({ source: 42 });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"source"')));
});

test('validateJob rejeita url inválida', () => {
  const vaga = vagaValida({ url: 'carreiras.aurorapagamentos.exemplo/vagas/123' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"url"')));
});

test('validateJob rejeita applyUrl que não é http(s)', () => {
  const vaga = vagaValida({ applyUrl: 'ftp://exemplo.com/vaga' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"applyUrl"')));
});

test('validateJob rejeita workModel fora do conjunto permitido', () => {
  const vaga = vagaValida({ workModel: 'presencial' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"workModel"')));
});

test('validateJob rejeita publishedAt com data civil inválida', () => {
  const vaga = vagaValida({ publishedAt: '2026-02-30' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"publishedAt"')));
});

test('validateJob aceita publishedAt null e rejeita formato errado', () => {
  assert.deepEqual(validateJob(vagaValida({ publishedAt: null })), []);
  const problemas = validateJob(vagaValida({ publishedAt: '20/09/2026' }));
  assert.ok(problemas.some((p) => p.includes('"publishedAt"')));
});

test('validateJob rejeita vaga com id, por ser campo da coleta', () => {
  const vaga = vagaValida({ id: 'aurora:aurora/123' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"id"')));
});

test('validateJob rejeita vaga com collectedAt, por ser campo da coleta', () => {
  const vaga = vagaValida({ collectedAt: '2026-09-21T10:00:00.000Z' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"collectedAt"')));
});

test('validateJob reporta campo desconhecido', () => {
  const vaga = vagaValida({ departamento: 'Comercial' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('departamento')));
});

test('dedupKey iguala "Aurora Pagamentos S.A." e "aurora pagamentos"', () => {
  const vagaUm = vagaValida({ company: 'Aurora Pagamentos S.A.', title: 'Analista de Planejamento Comercial' });
  const vagaDois = vagaValida({ company: 'aurora pagamentos', title: 'Analista de Planejamento Comercial' });
  assert.equal(dedupKey(vagaUm), dedupKey(vagaDois));
});

test('dedupKey ignora acento, pontuação e caixa também no título', () => {
  const vagaUm = vagaValida({ company: 'Padaria Ótima Ltda', title: 'Gerente de Operações' });
  const vagaDois = vagaValida({ company: 'padaria otima', title: 'gerente de operacoes!' });
  assert.equal(dedupKey(vagaUm), dedupKey(vagaDois));
});

test('dedupKey distingue empresas ou títulos diferentes', () => {
  const vagaUm = vagaValida({ company: 'Aurora Pagamentos', title: 'Analista de Planejamento Comercial' });
  const vagaDois = vagaValida({ company: 'Aurora Pagamentos', title: 'Analista de Dados' });
  assert.notEqual(dedupKey(vagaUm), dedupKey(vagaDois));
});

// --- Rodada de correções do Tester independente (T1.1) ---

test('stripHtml remove <script> e <style> inteiros, com o conteúdo', () => {
  const html = '<p>Antes</p><script>alert("oi");</script><style>.x { color: red; }</style><p>Depois</p>';
  assert.equal(stripHtml(html), 'Antes\n\nDepois');
});

test('stripHtml remove comentários HTML, com o conteúdo', () => {
  const html = '<p>Antes</p><!-- anotação interna que não deveria aparecer --><p>Depois</p>';
  const resultado = stripHtml(html);
  assert.equal(resultado, 'Antes\n\nDepois');
  assert.ok(!resultado.includes('anotação interna'));
});

test('stripHtml não vaza pedaço de tag quando atributo tem ">"', () => {
  const html = '<div title="valor > esquisito">Nota</div>';
  assert.equal(stripHtml(html), 'Nota');
});

test('stripHtml respeita aspas simples também ao achar o fim da tag', () => {
  const html = "<div title='valor > esquisito'>Nota</div>";
  assert.equal(stripHtml(html), 'Nota');
});

test('stripHtml mantém "<" que não abre tag válida como caractere comum', () => {
  const html = '<p>Faixa: menor que 5 < 10 e maior que 3 > 1.</p>';
  assert.equal(stripHtml(html), 'Faixa: menor que 5 < 10 e maior que 3 > 1.');
});

test('stripHtml é linear: 100.000 "<" seguidos termina dentro do limite', () => {
  const entrada = '<'.repeat(100000);
  const inicio = Date.now();
  const resultado = stripHtml(entrada);
  const duracao = Date.now() - inicio;
  assert.equal(resultado, entrada, 'nenhum "<" solto deveria sumir ou virar outra coisa');
  assert.ok(duracao < LINEAR_LIMIT_MS, `esperava menos de ${LINEAR_LIMIT_MS}ms, levou ${duracao}ms`);
});

test('validateJob exige que "source" siga o padrão de nome de fonte (sem dois-pontos)', () => {
  const vaga = vagaValida({ source: 'gu:py' });
  const problemas = validateJob(vaga);
  assert.ok(problemas.some((p) => p.includes('"source"')));
});

test('validateJob aceita "source" minúsculo com hífen e underscore', () => {
  assert.deepEqual(validateJob(vagaValida({ source: 'gupy-busca_1' })), []);
});

test('validateJob aceita vaga sem nenhum campo anulável (ausência vale null)', () => {
  const vaga = {
    source: 'aurora',
    sourceId: 'aurora/123',
    url: 'https://carreiras.aurorapagamentos.exemplo/vagas/123',
    title: 'Analista de Planejamento Comercial',
    company: 'Aurora Pagamentos',
    description: 'Descrição completa da vaga.',
  };
  assert.deepEqual(validateJob(vaga), []);
});

test('dedupKey não trata "Sa"/"Sá" em caixa normal como sufixo societário', () => {
  const consultoriaSa = dedupKey({ company: 'Consultoria Sa', title: 'Analista' });
  const consultoria = dedupKey({ company: 'Consultoria', title: 'Analista' });
  const fulanoSa = dedupKey({ company: 'Fulano Sa', title: 'Analista' });
  const fulano = dedupKey({ company: 'Fulano', title: 'Analista' });
  const padariaSa = dedupKey({ company: 'Padaria Sá', title: 'Analista' });
  assert.notEqual(consultoriaSa, consultoria);
  assert.notEqual(fulanoSa, fulano);
  assert.notEqual(padariaSa, dedupKey({ company: 'Padaria', title: 'Analista' }));
});

test('dedupKey reconhece "S.A.", "S/A" e "SA" maiúsculo como sufixo', () => {
  const comPontos = dedupKey({ company: 'Aurora Pagamentos S.A.', title: 'Analista' });
  const comBarra = dedupKey({ company: 'Aurora Pagamentos S/A', title: 'Analista' });
  const semPontos = dedupKey({ company: 'Aurora Pagamentos SA', title: 'Analista' });
  const semSufixo = dedupKey({ company: 'Aurora Pagamentos', title: 'Analista' });
  assert.equal(comPontos, semSufixo);
  assert.equal(comBarra, semSufixo);
  assert.equal(semPontos, semSufixo);
});

test('dedupKey nunca esvazia o nome removendo o sufixo', () => {
  const soLtda = dedupKey({ company: 'Ltda', title: 'Analista' });
  const soSA = dedupKey({ company: 'S.A.', title: 'Analista' });
  assert.notEqual(soLtda.split('|')[0], '');
  assert.notEqual(soSA.split('|')[0], '');
});

test('dedupKey trata company/title ausentes como texto vazio, nunca "undefined"', () => {
  const semCompany = dedupKey({ title: 'Analista' });
  const semTitle = dedupKey({ company: 'Aurora Pagamentos' });
  const semNada = dedupKey({});
  assert.equal(semCompany, '|analista');
  assert.ok(!semCompany.includes('undefined'));
  assert.equal(semTitle, 'aurora pagamentos|');
  assert.ok(!semTitle.includes('undefined'));
  assert.equal(semNada, '|');
});

// --- Segunda rodada do Tester independente (T1.1): "na dúvida, preserva o texto" ---

const MARCA = 'TEXTOREALMARCADORDAVAGA';

test('N1: <div title="nunca fecha seguido de 50.000 caracteres de texto real não some', () => {
  const entrada = `<div title="nunca fecha ${MARCA} ` + 'x'.repeat(50000);
  const resultado = stripHtml(entrada);
  assert.ok(resultado.includes(MARCA), 'o texto real precisa sobreviver');
  assert.ok(resultado.length > 50000, 'nada pode ser descartado por causa da aspa que não fecha');
});

test('N1: "<a" repetido 100.000 vezes não vira string vazia', () => {
  const entrada = '<a'.repeat(100000);
  const resultado = stripHtml(entrada);
  assert.equal(resultado, entrada, 'sem um único ">" em lugar nenhum, nada aqui é tag: tudo é texto');
});

test('N1: <script> sem </script> seguido de texto real preserva o texto (descarta só a tag de abertura)', () => {
  const entrada = `<script>var x = 1;${MARCA}`;
  const resultado = stripHtml(entrada);
  assert.ok(resultado.includes(MARCA), 'o texto depois do <script> sem fechamento não pode sumir');
});

test('N1: <!-- sem --> seguido de texto real preserva o texto (o "<!--" vira texto comum)', () => {
  const entrada = `<!-- começa e nunca fecha ${MARCA}`;
  const resultado = stripHtml(entrada);
  assert.ok(resultado.includes(MARCA), 'o texto depois do comentário sem fechamento não pode sumir');
  assert.ok(resultado.includes('<!--'), 'o "<!--" que não fechou vira texto comum, não some');
});

test('N2: "<letra" em prosa legítima não engole o resto da frase', () => {
  const entrada = 'se a<b então ganha bônus. Confirmado > 5% de aumento';
  assert.equal(stripHtml(entrada), entrada);
});

test('N2: genéricos de código (List<String>, Map<K,V>) sobrevivem inteiros', () => {
  const entrada = 'Experiência com List<String> e Map<K,V> em Java, nunca vira tag.';
  assert.equal(stripHtml(entrada), entrada);
});

test('N3: dedupKey não lê o final de "ROSA" como o sufixo "SA" (precisa de separador antes)', () => {
  const casaDeCarnes = dedupKey({ company: 'CASA DE CARNES ROSA', title: 'Analista' });
  assert.ok(casaDeCarnes.startsWith('casa de carnes rosa|'), `esperava manter "rosa" inteiro, veio "${casaDeCarnes}"`);
});

test('regra 6: tempo linear para as seis entradas patológicas (cada uma dentro do limite)', () => {
  const casos = {
    '100.000 "<"': '<'.repeat(100000),
    '"<a" repetido': '<a'.repeat(100000),
    '<a x=" repetido': '<a x="'.repeat(100000),
    '<!-- repetido': '<!--'.repeat(100000),
    '<script> repetido': '<script>'.repeat(100000),
    "<div title=' repetido": "<div title='".repeat(100000),
  };
  for (const [nome, entrada] of Object.entries(casos)) {
    const inicio = Date.now();
    stripHtml(entrada);
    const duracao = Date.now() - inicio;
    assert.ok(duracao < LINEAR_LIMIT_MS, `"${nome}" esperava menos de ${LINEAR_LIMIT_MS}ms, levou ${duracao}ms`);
  }
});

test('stripHtml mantém maiúsculas de tag e de entidade', () => {
  assert.equal(stripHtml('<DIV>Texto</DIV><P>Outro</P>'), 'Texto\n\nOutro');
  assert.equal(stripHtml('<p>S&Atilde;O PAULO</p>'), 'SÃO PAULO');
});

test('stripHtml preserva emoji, literal e via entidade numérica', () => {
  const entrada = '<p>Vaga incrível \u{1F680} com emoji \u{1F600} e &#128512; via entidade</p>';
  const resultado = stripHtml(entrada);
  assert.ok(resultado.includes('\u{1F680}'));
  assert.ok(resultado.includes('\u{1F600}'));
  // a entidade numérica &#128512; decodifica para o mesmo emoji 😀
  const ocorrencias = resultado.split('\u{1F600}').length - 1;
  assert.equal(ocorrencias, 2, 'o emoji literal e o decodificado da entidade precisam estar os dois presentes');
});

test('stripHtml: rede de segurança com 200 entradas pseudoaleatórias (marcação boa e malformada misturadas)', () => {
  // PRNG determinístico (mulberry32) só para gerar entrada de teste reprodutível,
  // sem depender de pacote externo.
  function mulberry32(seed) {
    let a = seed;
    return function gerar() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Dez palavras fictícias com acento: se uma delas acabar presa dentro de uma
  // tentativa de tag (ex.: "<a palavraAcentuada>"), o acento reprova a regra 4
  // (nome de atributo só em ASCII) e a tentativa vira texto, o que garante que
  // o marcador nunca fica "dentro" de uma tag bem formada por acidente.
  const MARCADORES = [
    'zórblatt', 'quintável', 'mirandéx', 'brufólina', 'tacapéira',
    'vendóxia', 'glumeráto', 'pixólane', 'fartravél', 'cindórum',
  ];

  // Mistura de marcação bem formada e malformada: aberturas sem fecho, aspas
  // soltas, <script>/<!-- sem fim, "<" e ">" soltos, nome de tag desconhecido.
  const FRAGMENTOS = [
    '<p>', '</p>', '<li>', '</li>', '<b>', '</b>',
    '<div class="x">', '</div>', '<br>', '<hr>',
    '<div title="nunca fecha', '<a', '<script>', '<style>', '<!--',
    '<', '>', '<estranho>', '<K,V>', '<3', '<=', "<div title='solta",
  ];

  function gerarEntrada(rand) {
    const partes = [];
    for (const marcador of MARCADORES) {
      const quantidadeDeLixo = Math.floor(rand() * 3); // 0, 1 ou 2 fragmentos antes do marcador
      for (let k = 0; k < quantidadeDeLixo; k += 1) {
        partes.push(FRAGMENTOS[Math.floor(rand() * FRAGMENTOS.length)]);
        partes.push(' ');
      }
      partes.push(marcador);
      partes.push(' ');
    }
    return partes.join('');
  }

  for (let seed = 1; seed <= 200; seed += 1) {
    const rand = mulberry32(seed);
    const entrada = gerarEntrada(rand);
    const resultado = stripHtml(entrada);

    let cursor = 0;
    for (const marcador of MARCADORES) {
      const achado = resultado.indexOf(marcador, cursor);
      assert.ok(
        achado !== -1,
        `seed ${seed}: marcador "${marcador}" sumiu. entrada: ${JSON.stringify(entrada)} | saída: ${JSON.stringify(resultado)}`,
      );
      cursor = achado + marcador.length;
    }
  }
});

test('stripHtml: aspa de atributo aberta não emparelha com a aspa de uma tag seguinte', () => {
  const html =
    '<div title="abre PRIMEIRO <div class="x"> SEGUNDO <div title="fecha > TERCEIRO';
  const text = stripHtml(html);
  for (const marcador of ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO']) {
    assert.ok(text.includes(marcador), `faltou ${marcador} em: ${text}`);
  }
});

test('stripHtml: aspa solta no trecho de atributos não é tag e o texto fica', () => {
  const text = stripHtml('<p>Antes</p><div "solta"> Requisito importante </div><p>Depois</p>');
  assert.ok(text.includes('Requisito importante'));
  assert.ok(text.includes('Antes') && text.includes('Depois'));
});

test('stripHtml: tags bem formadas com atributos entre aspas continuam sendo removidas', () => {
  const text = stripHtml(
    `<div class="vaga" data-id='7'><a href="https://exemplo.com/a?b=1&amp;c=2" title="x > y">Inscreva-se</a></div>`,
  );
  assert.equal(text, 'Inscreva-se');
});

test('stripHtml: muitas aspas numa tag só continuam em tempo linear', () => {
  const html = `<a ${'x="1" '.repeat(100000)}>fim`;
  const inicio = performance.now();
  const text = stripHtml(html);
  assert.ok(performance.now() - inicio < LINEAR_LIMIT_MS);
  assert.equal(text, 'fim');
});

test('stripHtml: caractere que muda de tamanho em minúsculas não desalinha o fim do <style>', () => {
  const dotted = String.fromCharCode(0x130);
  assert.equal(stripHtml(`<style>${dotted}</style>Requisito final`), 'Requisito final');
  assert.equal(stripHtml(`<p>Antes</p><script>${dotted}${dotted}</script><p>Depois</p>`), 'Antes\n\nDepois');
});

test('stripHtml: comentário vazio ou fechado com "--!>" não engole o texto seguinte', () => {
  assert.ok(stripHtml('<!-->Requisito um-->').includes('Requisito um'));
  assert.ok(stripHtml('<!----!>Requisito dois-->').includes('Requisito dois'));
  assert.equal(stripHtml('<p>A</p><!-- nota interna --><p>B</p>'), 'A\n\nB');
});

test('stripHtml: atributo escrito com espaços em volta do "=" continua sendo tag', () => {
  assert.equal(stripHtml('<script type = "module">let x = 1;</script>Texto'), 'Texto');
  assert.equal(stripHtml('<style media = "all">a{}</style>Texto'), 'Texto');
  assert.equal(stripHtml('<a href = "https://exemplo.com/vaga">Inscreva-se</a>'), 'Inscreva-se');
});
