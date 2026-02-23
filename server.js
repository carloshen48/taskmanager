const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CORES E AVATARES ────────────────────────────────────────
const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#ef4444','#14b8a6','#f97316','#06b6d4'];
const AVATARS = ['👤','👩','👨','🧑','👩‍💻','👨‍💻','🧑‍💼','👩‍🎨','🧑‍🎤','👩‍🔬'];
let colorIdx = 0;

// ── METAS DE ROTINA DIÁRIA PADRÃO ───────────────────────────
const ROTINA_PADRAO = [
  { id: 'banho',    titulo: '🚿 Tomar banho' },
  { id: 'dentes',   titulo: '🪥 Escovar os dentes' },
  { id: 'cama',     titulo: '🛏️ Arrumar a cama' },
  { id: 'roupa',    titulo: '👕 Guardar a roupa' },
  { id: 'quarto',   titulo: '🧹 Organizar o quarto' },
];

// ── ESTADO EM MEMÓRIA ───────────────────────────────────────
let db = {
  members: [],       // { id, name, color, avatar, createdAt, rotina: [{...meta, feito: bool}] }
  tasks: [],
  notifications: [],
  pushSubscriptions: [],
};

// ── ONLINE ───────────────────────────────────────────────────
const onlineClients = new Map();

function parseDevice(ua = '') {
  if (/Mobile|Android|iPhone/i.test(ua)) return '📱 Mobile';
  if (/iPad|Tablet/i.test(ua))           return '📟 Tablet';
  return '🖥️ Desktop';
}
function parseBrowser(ua = '') {
  if (/Edg\//i.test(ua))     return 'Edge';
  if (/Chrome/i.test(ua))    return 'Chrome';
  if (/Firefox/i.test(ua))   return 'Firefox';
  if (/Safari/i.test(ua))    return 'Safari';
  if (/OPR|Opera/i.test(ua)) return 'Opera';
  return 'Navegador';
}
function getOnlineUsers() {
  return Array.from(onlineClients.values()).map(c => ({
    id: c.id, device: c.device, browser: c.browser, joinedAt: c.joinedAt,
  }));
}

// ── HELPERS ─────────────────────────────────────────────────
function uid() { return crypto.randomUUID(); }

function novaRotina() {
  return ROTINA_PADRAO.map(m => ({ ...m, feito: false }));
}

function buildState() {
  const members = db.members.map(m => {
    const tasks = db.tasks.filter(t => t.assignedTo === m.id);
    const done  = tasks.filter(t => t.done).length;
    const rotinaFeita = m.rotina.filter(r => r.feito).length;
    return {
      ...m,
      tasks,
      completedAll: tasks.length > 0 && done === tasks.length,
      rotinaTotal: m.rotina.length,
      rotinaFeita,
    };
  });

  const allTasks = db.tasks;
  const online = getOnlineUsers();

  return {
    members,
    stats: {
      total:   allTasks.length,
      done:    allTasks.filter(t => t.done).length,
      members: db.members.length,
      online:  online.length,
    },
    onlineUsers: online,
    notifications: db.notifications.slice(-20).reverse(),
  };
}

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
function broadcastState() { broadcast('state', buildState()); }

function addNotification(title, body = '') {
  db.notifications.push({ id: uid(), title, body, at: Date.now() });
  if (db.notifications.length > 50) db.notifications = db.notifications.slice(-50);
}

// ── WEBSOCKET ────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const ua = req.headers['user-agent'] || '';
  onlineClients.set(ws, { id: uid(), device: parseDevice(ua), browser: parseBrowser(ua), joinedAt: Date.now() });
  ws.send(JSON.stringify({ event: 'init', data: buildState() }));
  broadcastState();
  ws.on('close', () => { onlineClients.delete(ws); broadcastState(); });
  ws.on('error', () => { onlineClients.delete(ws); });
});

// ── API ──────────────────────────────────────────────────────
app.get('/api/state', (req, res) => res.json(buildState()));

// Membros
app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Nome inválido' });
  const member = {
    id: uid(),
    name: name.trim().slice(0, 30),
    color: COLORS[colorIdx % COLORS.length],
    avatar: AVATARS[colorIdx % AVATARS.length],
    createdAt: Date.now(),
    rotina: novaRotina(),
  };
  colorIdx++;
  db.members.push(member);
  addNotification('Novo membro', `${member.name} entrou`);
  broadcastState();
  res.json(member);
});

app.delete('/api/members/:id', (req, res) => {
  db.members = db.members.filter(m => m.id !== req.params.id);
  db.tasks   = db.tasks.filter(t => t.assignedTo !== req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// Tarefas
app.post('/api/tasks', (req, res) => {
  const { title, assignedTo, priority = 'media' } = req.body;
  if (!title || !assignedTo) return res.status(400).json({ error: 'Campos obrigatórios' });
  const member = db.members.find(m => m.id === assignedTo);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  const task = {
    id: uid(), title: title.trim().slice(0, 80),
    assignedTo, priority: ['alta','media','baixa'].includes(priority) ? priority : 'media',
    done: false, createdAt: Date.now(),
  };
  db.tasks.push(task);
  addNotification('Nova tarefa', `"${task.title}" → ${member.name}`);
  broadcastState();
  res.json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Não encontrada' });
  if (typeof req.body.done === 'boolean') {
    task.done = req.body.done;
    const member = db.members.find(m => m.id === task.assignedTo);
    if (task.done) addNotification('✅ Tarefa concluída', `"${task.title}"${member?' por '+member.name:''}`);
  }
  broadcastState();
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// Rotina diária
app.patch('/api/members/:memberId/rotina/:metaId', (req, res) => {
  const member = db.members.find(m => m.id === req.params.memberId);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  const meta = member.rotina.find(r => r.id === req.params.metaId);
  if (!meta) return res.status(404).json({ error: 'Meta não encontrada' });
  if (typeof req.body.feito === 'boolean') {
    meta.feito = req.body.feito;
    if (meta.feito) addNotification('🎯 Rotina', `${member.name} concluiu: ${meta.titulo}`);
  }
  broadcastState();
  res.json(meta);
});

// Reset rotina diária (todas as metas de um membro)
app.post('/api/members/:memberId/rotina/reset', (req, res) => {
  const member = db.members.find(m => m.id === req.params.memberId);
  if (!member) return res.status(404).json({ error: 'Membro não encontrado' });
  member.rotina.forEach(r => r.feito = false);
  broadcastState();
  res.json({ ok: true });
});

// Notificação teste
app.post('/api/notify/test', (req, res) => {
  addNotification('🔔 Teste', 'Notificação de teste!');
  broadcastState();
  res.json({ ok: true });
});

// VAPID fake
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZJMvEZdRdN4DXHuNDdKYIbWy9A0' });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Rodando em http://localhost:${PORT}`));
