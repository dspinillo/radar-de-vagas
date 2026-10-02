# Radar de Vagas · instruções para agentes

## Antes de implementar qualquer coisa

Leia nesta ordem: `STATUS.md` (onde paramos) → `HANDOFF.md` (como retomar) → a tarefa TX.Y no `ROADMAP.md`. Vocabulário: `CONTEXT.md`. Erros que já custaram caro: `LESSONS.md`. Decisões: `decisions/`. Não contrarie uma decisão sem escrever a que a substitui.

## Princípio de produto

O radar ranqueia e orienta; quem decide e quem envia é sempre a pessoa.

## Privacidade (regra dura)

Este repositório é público e não pode conter dado pessoal de ninguém.

- Dados de quem usa vivem em `~/.radar-de-vagas/`, nunca dentro do repositório.
- Exemplos, testes e capturas de tela usam pessoa e empresas inventadas.
- Nada de e-mail, telefone, CPF, nome de pessoa real, empregador real de alguém ou caminho de usuário (`/Users/...`, `C:\Users\...`) em código, documentação ou mensagem de commit.
- Ao depurar com dados reais, não cole a saída em arquivo do repositório.
- Checagem automática: `node scripts/check-privacy.mjs` varre os arquivos do repositório e falha (saída 1) se achar e-mail, telefone, CPF, CNPJ ou caminho de usuário. Roda antes de cada commit local e em todo push/pull request no GitHub.
- A checagem olha o que está preparado para commit (índice do git) e o que já está rastreado; um arquivo recém-criado só é verificado depois do `git add`.
- Ativar o hook local uma vez por clone: `git config core.hooksPath .githooks`.
- Exceções vão em `.privacy-allow` (raiz), uma string exata por linha, e só valem depois do `git add` nele (a checagem lê o `.privacy-allow` do índice do git, não do disco). Lista privada opcional e fora do repositório: `~/.radar-de-vagas/privado.txt`.

## Como buildar e testar

```bash
node --test        # a partir da F1
```

## Armadilhas conhecidas

1. Truncar a descrição da vaga antes de julgar esconde requisitos que ficam no fim do anúncio.
2. A coleta nunca sobrescreve uma marcação feita pela pessoa.
3. Filtro de título agressivo esconde vaga boa. Na dúvida, deixe passar e alerte.
4. A guarda de privacidade acusa como celular qualquer identificador puramente numérico de 11 dígitos que comece com DDD válido seguido de "9". Em exemplo ou resposta gravada de teste, use identificador fictício de outro tamanho ou com prefixo.

## Convenções de código

- Node 20+, módulos ES, sem dependências de terceiros.
- Identificadores em inglês; textos de interface, documentação e arquivos da pessoa em português.
- Uma fonte por arquivo em `src/sources/`, todas com o mesmo contrato.
- Commits no padrão Conventional Commits.

## Ao encerrar a sessão

1. Rodar os testes e reportar o resultado real.
2. Atualizar `CHANGELOG.md` com o que entrou.
3. Atualizar `STATUS.md` ("Onde paramos" novo, sessão anterior em `<details>`).
4. Atualizar `HANDOFF.md` se a forma de retomar mudou.
5. Commitar apenas se o mantenedor pedir.
