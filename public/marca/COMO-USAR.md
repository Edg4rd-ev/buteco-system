# Marca — Buteco Seu Barba (versão de interface)

Redesenho flat e vetorial para uso em tela. Não substitui o logo original
em impresso e redes sociais — resolve o que ele não resolve: tamanho
pequeno, fundo escuro e peso de arquivo.

| Arquivo | Onde usar |
|---|---|
| `logo-seu-barba.svg` | login, abertura, menu da gestão, favicon |
| `logo-seu-barba-32/180/192/512/1024.png` | favicon, ícone do iPhone (180), manifest do PWA |
| `logo-seu-barba-icone.svg`, `icone-*.png` | **fora de uso** — sobra da versão sem nome |

> Decisão do dono (set/2026): o app usa **sempre o logo com o nome**, inclusive
> no favicon e no ícone de instalação, mesmo onde o texto fica pequeno demais
> pra ler. Os PNGs de 32/180/192 foram reduzidos do de 1024 (o `gerar_logo.py`
> ainda não gera esses tamanhos).
| `gerar_logo.py` | regenera tudo |

## Duas versões, por quê

Abaixo de ~80px o texto vira borrão. A versão ícone mantém coroa, anel e
caneca — a silhueta de tampinha continua reconhecível, que é o que um
favicon precisa.

## Texto em curvas

Convertido em `<path>` com a Oswald 600. O logo desenha igual em favicon,
`<img>`, e-mail e máquina sem a fonte. **Não troque por `<text>`.**
Para mudar o texto, rode o gerador de novo:

```bash
pip install fonttools cairosvg
# baixe Oswald[wght].ttf do repositório google/fonts como oswald.ttf
python3 gerar_logo.py
```

## Cores

```
carvão  #1B1F23    aço     #3A474F    aço escuro #2A343B
dourado #F5B31E    âmbar   #C8860E    creme      #F2E8D5
```

## Evitar

- Sombra ou gradiente imitando o 3D: a versão de tela é plana de propósito
- Versão com texto abaixo de 80px
- Recolorir fora da paleta
