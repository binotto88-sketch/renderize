# AI Providers — Renderize

## Provider: fal.ai

Renderize usa [fal.ai](https://fal.ai) como provedor de renderização de imagens.

### Modelos disponíveis

| Model ID | Descrição | Custo típico |
|---|---|---|
| `fal-ai/flux/dev` | FLUX.1 Dev — qualidade alta, default | ~$0.025/img |
| `fal-ai/flux/schnell` | FLUX.1 Schnell — rápido, menor custo | ~$0.003/img |
| `fal-ai/stable-diffusion-v3-medium` | SD3 Medium | ~$0.035/img |
| `fal-ai/aura-flow` | AuraFlow v0.3 | ~$0.006/img |

### Configuração

1. Crie conta em https://fal.ai
2. Gere uma API key em **Settings → API Keys**
3. Adicione como secret no Supabase:
   ```bash
   supabase secrets set FAL_API_KEY=fal_...
   ```

### Parâmetros suportados pela `process-render`

```json
{
  "prompt": "string (obrigatório)",
  "negative_prompt": "string (opcional)",
  "model": "fal-ai/flux/dev",
  "width": 1024,
  "height": 1024,
  "steps": 28,
  "guidance_scale": 3.5,
  "seed": null
}
```

### Adicionando novos providers

Para adicionar um novo provider (ex: Replicate), crie um adapter dentro de `process-render/index.ts` que respeita a interface:

```ts
interface ProviderAdapter {
  run(model: string, input: RenderInput): Promise<{ imageUrl: string }>
}
```
