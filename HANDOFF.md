# Radar de Vagas · Handoff

> Como retomar este projeto amanhã (pessoa ou IA). Atualizado em **2026-10-01** · branch `main`

## Objetivo acordado

Uma ferramenta pública e gratuita de busca de vagas que roda na máquina da pessoa, dentro do agente que ela já usa. A primeira versão pública (0.1) entrega coleta, radar local, onboarding, triagem, memória de descarte, agendamento, acompanhamento das candidaturas, currículo por vaga e munição de entrevista.

## Estado do ambiente

```text
Dir:      onde o repositório foi clonado
Dados:    ~/.radar-de-vagas/ (fora do repositório, criada na T1.2)
Branch:   main
Hook:     git config core.hooksPath .githooks (uma vez por clone)
Testes:   node --test
Guarda:   node scripts/check-privacy.mjs
```

## Cuidados para a próxima sessão

- O plano visual da F0 é um documento privado do mantenedor. Tudo o que ele decide está espelhado em `PRD.md`, `ARCHITECTURE.md` e `ROADMAP.md`, que são a fonte para quem clona.
- Nada de dado pessoal no repositório: nem em exemplo, nem em teste, nem em mensagem de commit. Exemplos usam pessoa e empresas inventadas.
- Projetos parecidos com licença AGPL servem para estudo de ideias, nunca para cópia de código. Este repositório é MIT.

## Próxima ação (checklist)

1. [ ] T1.2: pasta de dados, arquivo de busca e módulo de estado (decisão 0003).
2. [ ] T1.3 e T1.4: fontes, seguindo `docs/contrato-de-fonte.md`.
3. [ ] T1.5, T1.6 e T1.8, na ordem das dependências do `ROADMAP.md`.
