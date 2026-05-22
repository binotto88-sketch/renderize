# AI Providers — Renderize

## Provider: fal.ai

Renderize usa [fal.ai](https://fal.ai) como engine de renderização arquitetônica.

### Modelos disponíveis

| Model ID | Descrição | Créditos | Entrada |
|---|---|---|---|
| `fal-ai/flux/schnell` | Rápido, qualidade boa — rascunhos/testes | 1 | Texto |
| `fal-ai/flux/dev` | FLUX.1 Dev — qualidade alta, padrão | 1 | Texto |
| `fal-ai/flux-pro` | FLUX Pro — qualidade profissional | 2 | Texto |
| `fal-ai/flux-pro/v1.1` | FLUX Pro v1.1 — melhor que Pro | 2 | Texto |
| `fal-ai/flux-pro/v1.1-ultra` | FLUX Pro Ultra — máxima qualidade, grandes formatos | 3 | Texto |
| `fal-ai/flux/dev/image-to-image` | Imagem→render — modifica referência | 1 | Texto + imagem |
| `fal-ai/flux-pro/canny` | Croqui/CAD→render — preserva linhas (edge detection) | 2 | Texto + croqui |
| `fal-ai/flux-pro/depth` | Foto→render — preserva profundidade (depth map) | 2 | Texto + foto |

### Recomendação por caso de uso

| Caso | Modelo recomendado |
|---|---|
| Teste rápido de conceito | `flux/schnell` |
| Estudo de volumetria | `flux/dev` |
| Apresentação para cliente | `flux-pro/v1.1` |
| Prancha de concurso / portfólio | `flux-pro/v1.1-ultra` |
| Croqui à mão → render fotorrealista | `flux-pro/canny` |
| Planta/corte CAD → perspectiva | `flux-pro/canny` |
| Foto existente → reforma proposta | `flux/dev/image-to-image` |
| Maquete física → render | `flux-pro/depth` |

### Configuração

```bash
supabase secrets set FAL_API_KEY=fal_...
```

---

## Parâmetros da `process-render`

### Parâmetros base

```jsonc
{
  "prompt": "Casa térrea com telhado borboleta, fachada de tijolos aparentes",  // obrigatório
  "model": "fal-ai/flux-pro/v1.1",   // padrão: fal-ai/flux/dev
  "width": 1920,                      // padrão: 1920
  "height": 1080,                     // padrão: 1080
  "steps": 28,                        // 1–100
  "guidance_scale": 3.5,
  "seed": null                        // fixar seed para reproduzir resultado
}
```

### Parâmetros arquitetônicos (todos opcionais)

```jsonc
{
  "render_type": "text-to-image",     // "text-to-image" | "sketch-to-render" | "image-to-image"
  "reference_image_url": "https://...",  // obrigatório para canny / depth / image-to-image
  "strength": 0.9,                    // 0–1: quanto preservar da imagem de referência

  "typology": "Residência unifamiliar",   // livre: "Edifício corporativo", "Museu", etc.
  "style_preset": "contemporary",         // ver opções abaixo
  "perspective": "exterior_facade",       // ver opções abaixo
  "time_of_day": "golden_hour",           // ver opções abaixo
  "atmosphere": "clear",                  // ver opções abaixo
  "environment": "urban"                  // ver opções abaixo
}
```

### Opções de `style_preset`

| Valor | Descrição |
|---|---|
| `contemporary` | Linhas limpas, materiais modernos, planta aberta |
| `minimalist` | Formas puras, paleta contida, contraste vazio/sólido |
| `brutalist` | Concreto bruto aparente, massas geométricas monumentais |
| `neoclassical` | Colunas, simetria, proporções clássicas |
| `biophilic` | Paredes verdes, materiais naturais, integração com a natureza |
| `industrial` | Estrutura metálica aparente, materiais crus, estética loft |
| `tropical` | Beirais profundos, ventilação natural, madeira local, vegetação |
| `japanese` | Wabi-sabi, madeira natural, jardim zen, fluxo interior-exterior |

### Opções de `perspective`

| Valor | Descrição |
|---|---|
| `exterior_facade` | Elevação frontal, perspectiva de fachada |
| `exterior_corner` | Vista de canto, dois pontos de fuga |
| `interior` | Perspectiva interna, fotografa o espaço por dentro |
| `aerial` | Vista aérea / drone, top-down |
| `street_level` | Nível pedestre, escala humana, contexto urbano |
| `garden` | Vista do jardim, exterior fundos |

### Opções de `time_of_day`

| Valor | Descrição |
|---|---|
| `golden_hour` | Final de tarde, sombras longas, tons âmbar |
| `midday` | Sol a pino, sombras duras, céu azul |
| `dusk` | Blue hour, interior aceso, céu degradê |
| `night` | Cena noturna, iluminação artificial |
| `overcast` | Nublado, luz difusa suave |
| `dawn` | Amanhecer, névoa, luz fria |

### Opções de `atmosphere`

| Valor | Descrição |
|---|---|
| `clear` | Céu limpo, cores vibrantes |
| `dramatic` | Nuvens dramáticas, atmosfera cinematográfica |
| `foggy` | Neblina matinal, qualidade etérea |
| `rainy` | Dia chuvoso, superfícies molhadas, reflexos |

### Opções de `environment`

| Valor | Descrição |
|---|---|
| `urban` | Contexto urbano denso, rua, edifícios vizinhos |
| `suburban` | Bairro residencial, rua arborizada |
| `nature` | Entorno natural, floresta, paisagem verde |
| `waterfront` | Beira-mar ou rio, água refletindo |
| `desert` | Paisagem árida, vegetação esparsa |
| `mountain` | Terreno montanhoso, paisagem alpina |

---

## Exemplo completo — croqui de arquiteto → render profissional

```jsonc
{
  "prompt": "Residência de dois pavimentos com varanda integrada à sala de estar, janelas do piso ao teto, jardim interno com espelho d'água",
  "model": "fal-ai/flux-pro/canny",
  "render_type": "sketch-to-render",
  "reference_image_url": "https://seu-bucket.supabase.co/sketches/planta-v2.jpg",
  "strength": 0.88,
  "width": 1920,
  "height": 1080,
  "typology": "Residência unifamiliar",
  "style_preset": "contemporary",
  "perspective": "exterior_facade",
  "time_of_day": "golden_hour",
  "atmosphere": "clear",
  "environment": "suburban"
}
```

O sistema monta automaticamente o prompt técnico completo antes de chamar o fal.ai — o arquiteto só descreve o projeto, o Renderize cuida da engenharia de prompt.

---

## Adicionando novos modelos

Edite `MODEL_CREDITS` e `IMAGE_INPUT_MODELS` em `process-render/index.ts` e atualize esta tabela.
