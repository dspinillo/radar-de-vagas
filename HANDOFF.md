# Radar de Vagas · Handoff

> Como retomar este projeto amanhã (pessoa ou IA). Atualizado em **2026-10-02** · branch `main`

## Objetivo acordado

Uma ferramenta pública e gratuita de busca de vagas que roda na máquina da pessoa, dentro do agente que ela já usa. A primeira versão pública (0.1) entrega coleta, radar local, onboarding, triagem, memória de descarte, agendamento, acompanhamento das candidaturas, currículo por vaga e munição de entrevista.

## Estado do ambiente

```text
Dir:      onde o repositório foi clonado
Dados:    ~/.radar-de-vagas/ (fora do repositório; RADAR_DATA_DIR troca a pasta, use em teste)
Branch:   main
Hook:     git config core.hooksPath .githooks (uma vez por clone)
Testes:   node --test
Guarda:   node scripts/check-privacy.mjs
Coleta:   node bin/radar.mjs collect
Página:   node bin/radar.mjs open
Smoke:    node scripts/smoke-sources.mjs (termos e empresas reais só por argumento)
```

## Cuidados para a próxima sessão

- O plano visual da F0 é um documento privado do mantenedor. Tudo o que ele decide está espelhado em `PRD.md`, `ARCHITECTURE.md` e `ROADMAP.md`, que são a fonte para quem clona.
- Nada de dado pessoal no repositório: nem em exemplo, nem em teste, nem em mensagem de commit. Exemplos usam pessoa e empresas inventadas.
- Projetos parecidos com licença AGPL servem para estudo de ideias, nunca para cópia de código. Este repositório é MIT.

## Próxima ação (checklist)

1. [ ] Commit e push da F1 (T1.2 a T1.6 e T1.8), com ok do mantenedor. Depois do push, repetir o passo a passo do README a partir do clone público.
2. [ ] Validar o README no Windows (pendência do mantenedor).
3. [ ] Fatiar a F2 (onboarding e triagem) em tarefas T2.x no `ROADMAP.md`.

## Como validar de verdade

Teste sem rede não mostra custo de volume. Antes de fechar tarefa de coleta, rode `node bin/radar.mjs collect` com `RADAR_DATA_DIR` apontando para uma pasta temporária e um arquivo de busca com empresas reais que fique fora do repositório.
