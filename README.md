# TaskManager — Gestão de Equipe

Aplicativo de gerenciamento de tarefas em equipe com sincronização em tempo real via WebSocket.

## Como rodar localmente

```bash
npm install
npm start
```

Acesse: http://localhost:3001

## Como colocar online GRÁTIS (Render.com)

### Passo 1 — Subir no GitHub

1. Crie um repositório novo no GitHub (ex: `taskmanager`)
2. No terminal da sua máquina, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/taskmanager.git
git push -u origin main
```

### Passo 2 — Deploy no Render (grátis)

1. Acesse https://render.com e crie uma conta gratuita
2. Clique em **New → Web Service**
3. Conecte seu repositório do GitHub
4. Configure:
   - **Name:** taskmanager (ou qualquer nome)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Clique em **Create Web Service**
6. Aguarde o deploy (2-3 minutos)
7. Seu site estará online em: `https://taskmanager-XXXX.onrender.com`

## Estrutura do projeto

```
taskmanager/
├── public/
│   └── index.html    # Frontend completo
├── server.js          # Backend Node.js + WebSocket
├── package.json
└── .gitignore
```

## Funcionalidades

- ✅ Adicionar membros da equipe
- ✅ Criar, concluir e deletar tarefas
- ✅ Sincronização em tempo real (WebSocket)
- ✅ Progresso por membro e geral
- ✅ Notificações de atividade
- ✅ Interface responsiva (mobile/desktop)
