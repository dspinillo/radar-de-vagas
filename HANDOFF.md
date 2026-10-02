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

1. [ ] Mantenedor: instalar o plugin, rodar o onboarding com o próprio perfil, `collect`, triagem, e anotar onde a triagem errou.
2. [ ] Ajustar `skills/triagem/SKILL.md` com o que o uso real mostrar.
3. [ ] Validar README, agendamento e página no Windows.
4. [ ] Lançamento: alguém de fora instala seguindo só o README; vídeo de demonstração.

## Como validar de verdade

Teste sem rede não mostra custo de volume. Antes de fechar tarefa de coleta, rode `node bin/radar.mjs collect` com `RADAR_DATA_DIR` apontando para uma pasta temporária e um arquivo de busca com empresas reais que fique fora do repositório.

Para validar uma skill sem gastar a assinatura do Claude: `codex exec -s workspace-write --add-dir "$RADAR_DATA_DIR" "Leia skills/<nome>/SKILL.md e execute..."` com a entrada padrão fechada, usando `examples/perfil.md` numa pasta de dados temporária. Dentro da sandbox do agente, `node --test` falha por bloqueio de porta local; isso não é falha do projeto.
