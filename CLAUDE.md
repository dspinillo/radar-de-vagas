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

## Como buildar e testar

```bash
node --test        # a partir da F1
```

## Armadilhas conhecidas

1. Truncar a descrição da vaga antes de julgar esconde requisitos que ficam no fim do anúncio.
2. A coleta nunca sobrescreve uma marcação feita pela pessoa.
3. Filtro de título agressivo esconde vaga boa. Na dúvida, deixe passar e alerte.

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
