# Fontes do Missão Saber

Nunito e Fredoka são servidas pelo próprio app com `next/font/local`, sem consulta ao Google Fonts durante a compilação. Isso elimina a falha observada do Turbopack ao interpretar URLs dinâmicas do serviço de fontes. A integração segue a [documentação de fontes locais do Next.js](https://nextjs.org/docs/app/getting-started/fonts#local-fonts).

Os arquivos vieram do [repositório oficial Google Fonts](https://github.com/google/fonts), no commit registrado em `sources.json`. As licenças OFL estão junto das fontes. Os arquivos variáveis completos foram apenas convertidos de TTF para WOFF2 com FontTools 4.60.1 e Brotli 1.2.0, preservando glifos, caracteres e eixos de variação. O mapa de caracteres foi comparado após a conversão, incluindo os acentos usados em português. Não há instalação ou conversão de fontes no build do app.

Para reproduzir, baixe a URL `source` de cada fonte indicada em `sources.json`, confira `sourceSha256` e execute com as versões acima:

```python
from fontTools.ttLib import TTFont
font = TTFont("fonte.ttf")
font.flavor = "woff2"
font.save("fonte.woff2")
```

`sha256` registra o arquivo distribuído. As duas fontes somam 187.448 bytes antes da compressão HTTP; são carregadas uma vez e reutilizadas pelo navegador.
