# Changelog · Radar de Vagas

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). **Este arquivo é a fonte de verdade do que entrou de fato.** Planos e checkboxes de outros documentos podem estar desatualizados; este não pode.

## [Não lançado]

### Adicionado

- **T1.7 · Guarda de privacidade.** `scripts/check-privacy.mjs` falha se houver e-mail, telefone, CPF, CNPJ ou caminho de usuário no que está preparado para commit ou já rastreado. Lê o conteúdo do índice do git, inclusive o arquivo de exceções `.privacy-allow`. Roda no hook `pre-commit` (`git config core.hooksPath .githooks`) e no GitHub. Aceita uma lista privada de termos fora do repositório. 20 testes; verificada em clone com commit real barrado. Não validada em Windows nem em execução real no GitHub.
- **T1.1 · Formato da vaga e contrato de fonte.** `src/job.mjs` (`makeId`, `stripHtml`, `validateJob`, `dedupKey`), `src/sources/index.mjs` (registro e `validateSource`) e o guia `docs/contrato-de-fonte.md`. `stripHtml` segue a regra "na dúvida, preserva o texto" e foi comparado com um parser de navegador em 2.500 entradas malformadas: nenhuma perda de texto além das que o navegador também faria. Um segundo teste independente achou mais três perdas (caractere que muda de tamanho em minúsculas, comentário vazio e atributo com espaço em volta do "="), corrigidas. 62 testes.
- **Decisão 0003.** Estado local em blocos com um dono cada, identidade da vaga e regra conservadora de fusão entre fontes.

- **Documentação inicial.** Plano do produto, arquitetura planejada, roadmap com as fases F0 a F7 e as tarefas da F1. Nenhum código de produto.
- **Plano aprovado.** Fases F0 a F8, com a F5 dedicada a acompanhamento das candidaturas, currículo por vaga e munição de entrevista. Decisões registradas no `ROADMAP.md`.
