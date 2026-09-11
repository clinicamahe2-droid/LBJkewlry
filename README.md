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
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **service_role** (só no servidor) |

4. Deploy.

A loja abre na URL da Vercel. O painel fica em `/admin`.

## Supabase (persistência)

Com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` configurados, produtos, estoque, vendas, fiado e clientes ficam no banco — não somem no redeploy da Vercel.

1. No [Supabase](https://supabase.com), abra **SQL Editor** e rode o arquivo `server/supabase/schema.sql`.
2. Em **Settings → API**, copie a **service_role** key (nunca coloque no front).
3. Cadastre as variáveis no `.env` local e na Vercel.
4. Migre os dados atuais (opcional):

```bash
npm run migrate:supabase
```

Sem Supabase configurado, o projeto continua usando `catalog.json` localmente.

Uploads de mídia (banners) ainda ficam em `site/assets/uploads/` — na Vercel, prefira imagens leves ou use Supabase Storage no futuro.
