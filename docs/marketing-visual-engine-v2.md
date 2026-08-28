# Motor Visual V2 — Central de Conteúdo

## Objetivo

A Produção não trata formatos diferentes como variações da mesma imagem. Cada peça recebe uma regra editorial e visual própria, respeitando o Brand Kit ativo e preservando a tese aprovada no Conteúdo-Mãe.

## Princípio central

**Uma tese, expressões nativas por formato.**

O motor deve produzir peças com aparência de agência premium: limpas, modernas, institucionais, legíveis, com boa hierarquia e sem cara de template genérico ou arte automática.

## Regras por formato

### Carrossel

- É sequência editorial de leitura, não apresentação de slides.
- Cada card deve cumprir uma função e avançar o raciocínio.
- Funções possíveis: `cover`, `concept`, `bullets`, `comparison`, `steps`, `error`, `proof`, `conclusion`, `cta`.
- A capa usa gancho forte e pouco texto.
- Cards internos podem usar bullets, duas colunas, passos, números, pequenos diagramas e comparativos.
- O layout não deve ser repetido em toda a sequência.
- Um card = uma ideia principal.
- O último card fecha a tese ou conduz a uma ação coerente.

### Stories

- Stories são conversa, não carrossel vertical.
- Leitura rápida e pouca densidade de texto.
- Estrutura preferencial: `hook/question → context → insight/explanation → proof/application → cta`.
- Pode incluir enquete, pergunta ou escolha simples quando isso gerar interação real.
- Cada frame deve funcionar em poucos segundos e criar vontade de avançar.

### WhatsApp Status

- Sequência curta, direta e conversacional.
- Uma mensagem por tela.
- Estrutura preferencial: impacto → explicação curta → aplicação → CTA para conversa.
- Evitar aparência de anúncio pesado.

### Post estático

- Uma única ideia forte.
- Headline curta e apoio mínimo.
- Não condensar um carrossel inteiro em uma imagem.
- LinkedIn deve ser mais sóbrio/editorial; Instagram e Facebook podem ter mais impacto sem perder sofisticação.

### Reel / TikTok / Short

- A peça principal é roteiro + captação + edição + capa.
- O PDF de roteiro permanece institucional e vinculado ao Brand Kit.
- A capa deve ter mensagem curta, alto contraste e leitura imediata.
- A edição deve priorizar clareza e naturalidade, sem excesso de efeitos.

### YouTube longo

- O roteiro é aprofundado.
- A thumbnail deve ser tratada como peça própria, em 16:9, com hook visual curto e forte.

## Direção visual global

- Premium, clean, moderna, institucional, sofisticada e humana.
- Muito respiro visual, mas nunca vazio sem função.
- Hierarquia tipográfica forte.
- Poucos elementos por tela.
- Uso controlado das cores oficiais.
- Caixas, linhas, números, comparativos e pequenos diagramas apenas quando melhorarem a compreensão.
- Evitar gradientes excessivos, brilhos, sombras pesadas, emojis e elementos sem função.
- Nunca escrever rótulos técnicos como “CONTEÚDO” ou “Brand Kit” na arte final.
- Nunca inventar logo, cor ou fonte.

## Motivos visuais suportados

O renderizador editorial pode usar motivos abstratos para dar ritmo sem poluir a peça: `growth`, `flow`, `balance`, `building`, `numbers`, `quote`, `target` e `comparison`.

Eles não substituem a mensagem; apenas ajudam a explicá-la visualmente.

## Revisão por IA

Toda peça visual gerada pode voltar para a IA antes da aprovação final.

O usuário pode:

- solicitar ajuste da peça inteira;
- solicitar ajuste de um card/frame específico;
- usar orientações rápidas como “mais clean”, “menos texto”, “mais premium”, “mais contraste”, “variar layouts” ou “transformar em comparação visual”;
- gerar uma nova variação sem perder a anterior.

A IA recebe a versão atual, o blueprint aprovado, o Brand Kit e a instrução do usuário. Em refinamentos, deve preservar tudo que não foi solicitado mudar.

## Versionamento

As versões são preservadas no Storage e identificadas por `V01`, `V02`, `V03` etc.

A ordem de produção guarda em `metadata`:

- `visual_spec_v2`;
- `visual_version`;
- `visual_revision_history`;
- `thumbnail_spec_v2`;
- `thumbnail_version`;
- `thumbnail_revision_history`.

Os assets guardam o número da versão em seus próprios metadados. ZIP e aprovação final usam somente a versão corrente.

## Segurança editorial

O Motor Visual não pode criar afirmações financeiras novas. Ele deve preservar a tese e os fatos aprovados e nunca inventar taxas, resultados, contemplações, garantias ou números.
