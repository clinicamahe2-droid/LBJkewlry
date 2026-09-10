# LB jewelry

Loja e painel administrativo da LB jewelry.

## Rodar no computador

```bash
npm install
cp .env.example .env
```

Edite o `.env` com uma senha forte e uma `SESSION_SECRET` longa. Depois:

```bash
npm start
```

- Loja: http://localhost:3480
- Painel: http://localhost:3480/admin

No primeiro acesso local, se `ADMIN_PASSWORD` não estiver no `.env`, a senha gerada aparece no terminal e em `server/data/.admin-credentials.txt` (esse arquivo não vai para o GitHub).

## O que sobe no GitHub

Só o código da loja (`site/`, `server/`) e as imagens usadas. Pastas de scrape (`luxuryds`, `vivara interno`, etc.) ficam de fora.

## Subir no GitHub

No Cursor, na pasta do projeto:

```bash
git init
git add .
git commit -m "Loja LB jewelry pronta para deploy"
```

Crie um repositório vazio no GitHub e:

```bash
git remote add origin https://github.com/SEU-USUARIO/lb-jewelry.git
git branch -M main
git push -u origin main
```

## Subir na Vercel

1. Acesse [vercel.com](https://vercel.com) e importe o repositório.
2. Framework preset: **Other**.
3. Em Environment Variables, cadastre:

| Nome | Valor |
| --- | --- |
| `ADMIN_USER` | `admin` (ou outro usuário) |
| `ADMIN_PASSWORD` | senha forte do painel |
| `SESSION_SECRET` | texto longo e aleatório |

4. Deploy.

A loja abre na URL da Vercel. O painel fica em `/admin`.

### Limite importante da Vercel

A Vercel não guarda arquivo em disco de forma permanente. Produtos e banners do **seed** sobem com o site. Alterações feitas no painel (estoque, vendas, upload novo) podem sumir no próximo deploy ou cold start.

Para operação diária do estoque com persistência, o próximo passo é um servidor com disco (Railway, Render ou VPS). A Vercel serve bem para colocar a vitrine no ar agora.

Uploads de vídeo grandes também podem falhar na Vercel (limite de corpo da requisição). Prefira imagens no painel se estiver nesse ambiente.
