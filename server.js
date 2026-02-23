const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CORES E AVATARES ────────────────────────────────────────
const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#ef4444','#14b8a6'];
const AVATARS = ['👤','👩','👨','🧑','👩‍💻','👨‍💻','🧑‍💼','👩‍🎨'];
let colorIdx = 0;

// ── ESTADO EM MEMÓRIA ───────────────────────────────────────
let db = {
  members: [],
  tasks: [],
  notifications: [],
  pushSubscriptions: [],
};

// ── HELPERS ─────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID();
}

function buildState() {
  const members = db.members.map(m => {
    const tasks = db.tasks.filter(t => t.assignedTo === m.id);
    const done  = tasks.filter(t => t.done).length;
    return {
      ...m,
      tasks,
      completedAll: tasks.length > 0 && done === tasks.length,
    };
  });

  const allTasks = db.tasks;
  const totalDone = allTasks.filter(t => t.done).length;

  return {
    members,
    stats: {
      total:   allTasks.length,
      done:    totalDone,
      members: db.members.length,
      devices: db.pushSubscriptions.length,
    },
    notifications: db.notifications.slice(-20).reverse(),
  };
}

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function broadcastState() {
  broadcast('state', buildState());
}

function addNotification(title, body = '') {
  db.notifications.push({ id: uid(), title, body, at: Date.now() });
  if (db.notifications.length > 50) db.notifications = db.notifications.slice(-50);
}

// ── WEBSOCKET ────────────────────────────────────────────────
wss.on('connection', ws => {
  ws.send(JSON.stringify({ event: 'init', data: buildState() }));
});

// ── API: ESTADO ──────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  res.json(buildState());
});

// ── API: MEMBROS ─────────────────────────────────────────────
app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Nome inválido' });

  const member = {
    id:     uid(),
    name:   name.trim().slice(0, 30),
    color:  COLORS[colorIdx % COLORS.length],
    avatar: AVATARS[colorIdx % AVATARS.length],
    createdAt: Date.now(),
  };
  colorIdx++;
  db.members.push(member);

  addNotification('Novo membro', `${member.name} entrou na equipe`);
  broadcastState();
  res.json(member);
});

app.delete('/api/members/:id', (req, res) => {
  db.members = db.members.filter(m => m.id !== req.params.id);
  db.tasks   = db.tasks.filter(t => t.assignedTo !== req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// ── API: TAREFAS ─────────────────────────────────────────────
app.post('/api/tasks', (req, res) => {
  const { title, assignedTo, priority = 'media' } = req.body;
  if (!title || !assignedTo) return res.status(400).json({ error: 'Campos obrigatórios' });

  const member = db.members.find(m => m.id === assignedTo);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });

  const task = {
    id:         uid(),
    title:      title.trim().slice(0, 80),
    assignedTo,
    priority:   ['alta','media','baixa'].includes(priority) ? priority : 'media',
    done:       false,
    createdAt:  Date.now(),
  };
  db.tasks.push(task);

  addNotification('Nova tarefa', `"${task.title}" → ${member.name}`);
  broadcastState();
  res.json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

  if (typeof req.body.done === 'boolean') {
    task.done = req.body.done;
    const member = db.members.find(m => m.id === task.assignedTo);
    if (task.done) {
      addNotification('Tarefa concluída ✅', `"${task.title}"${member ? ' por ' + member.name : ''}`);
    }
  }

  broadcastState();
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// ── API: VAPID (chave fake para não quebrar o frontend) ──────
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZJMvEZdRdN4DXHuNDdKYIbWy9A0' });
});

// ── API: PUSH SUBSCRIBE ──────────────────────────────────────
app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: 'Subscription inválida' });
  const exists = db.pushSubscriptions.find(s => s.endpoint === sub.endpoint);
  if (!exists) db.pushSubscriptions.push(sub);
  broadcastState();
  res.json({ devices: db.pushSubscriptions.length });
});

app.post('/api/push/unsubscribe', (req, res) => {
  db.pushSubscriptions = db.pushSubscriptions.filter(s => s.endpoint !== req.body.endpoint);
  broadcastState();
  res.json({ ok: true });
});

// ── API: NOTIFICAÇÃO DE TESTE ────────────────────────────────
app.post('/api/notify/test', (req, res) => {
  addNotification('🔔 Teste', 'Notificação de teste enviada com sucesso!');
  broadcastState();
  res.json({ devices: db.pushSubscriptions.length });
});

// ── FALLBACK (SPA) ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── INICIAR ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ TaskManager rodando em http://localhost:${PORT}`);
});
