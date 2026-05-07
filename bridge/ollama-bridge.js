/**
 * Ollama → Tandem Bridge
 * Conecta Qwen3-VL local (via Ollama) à API do Tandem Browser.
 * Loop: comando do usuário → screenshot → Ollama decide ação → executa no Tandem.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-vl:8b';
const TANDEM_URL = process.env.TANDEM_URL || 'http://127.0.0.1:8765';
const MAX_STEPS = 15;

// Lê token do Tandem
function readToken() {
  const p = path.join(os.homedir(), 'AppData', 'Roaming', 'Tandem Browser', 'api-token');
  try { return fs.readFileSync(p, 'utf8').trim(); }
  catch (e) { console.error('❌ Token Tandem não encontrado em', p); process.exit(1); }
}
const TOKEN = readToken();

const tandemHeaders = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function tandem(method, endpoint, body) {
  const opts = { method, headers: tandemHeaders };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${TANDEM_URL}${endpoint}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function getScreenshot() {
  const res = await fetch(`${TANDEM_URL}/screenshot`, { headers: tandemHeaders });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

async function getPageState() {
  const tabs = await tandem('GET', '/tabs/list');
  const content = await tandem('GET', '/page-content');
  let url = '', title = '', text = '';
  if (tabs.ok && tabs.data?.tabs) {
    const active = tabs.data.tabs.find(t => t.active) || tabs.data.tabs[0];
    if (active) { url = active.url || ''; title = active.title || ''; }
  }
  if (content.ok) {
    text = (typeof content.data === 'string' ? content.data : content.data?.text || content.data?.content || '').slice(0, 3000);
  }
  return { url, title, text };
}

const SYSTEM_PROMPT = `You are an AI agent controlling a real web browser (Tandem Browser).
You see a screenshot of the current page and a description of its state.
Choose ONE action per step. Return strict JSON: { "thought": "...", "action": { ... } }.

Available actions:
- navigate: { "type": "navigate", "url": "https://..." }
- click_text: { "type": "click_text", "text": "Gmail" }  — clicks visible text
- click_at: { "type": "click_at", "x": 234, "y": 567 }   — clicks viewport coordinates
- type: { "type": "type", "text": "hello" }              — types in focused input
- press: { "type": "press", "key": "Enter" }             — Enter, Tab, Escape, ArrowDown, etc
- scroll: { "type": "scroll", "direction": "down" }       — up|down|top|bottom
- wait: { "type": "wait", "ms": 1500 }
- done: { "type": "done", "reason": "...", "success": true } — task finished

Rules:
- Use the screenshot to understand the page visually.
- Prefer click_text. If text is duplicated or invisible, use click_at with coordinates from the screenshot.
- For known sites, navigate is faster than clicking through.
- If an action had no visible effect, try a different approach. Don't repeat the same action.
- Return done when goal is met or impossible.`;

async function askOllama(history, screenshotB64) {
  const userMsg = history[history.length - 1];
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMsg.content, images: screenshotB64 ? [screenshotB64] : undefined },
  ];
  const body = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    format: 'json',
    keep_alive: '15m',
    options: { num_ctx: 8192 },
  };
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama erro ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content || '';
}

function parseAction(raw) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    return { thought: parsed.thought || '', action: parsed.action || null };
  } catch { return { thought: raw.slice(0, 200), action: null }; }
}

async function executeAction(action) {
  switch (action.type) {
    case 'navigate':
      return tandem('POST', '/navigate', { url: action.url });
    case 'click_text':
      return tandem('POST', '/find/click', { text: action.text });
    case 'click_at':
      return tandem('POST', '/click', { x: action.x, y: action.y });
    case 'type':
      return tandem('POST', '/type', { text: action.text });
    case 'press':
      return tandem('POST', '/press-key', { key: action.key });
    case 'scroll':
      return tandem('POST', '/scroll', { direction: action.direction });
    case 'wait':
      await new Promise(r => setTimeout(r, action.ms || 1000));
      return { ok: true, data: { waited: action.ms } };
    case 'done':
      return { ok: true, done: true, data: action };
    default:
      return { ok: false, data: { error: `Ação desconhecida: ${action.type}` } };
  }
}

async function runCommand(goal) {
  console.log(`\n🎯 OBJETIVO: ${goal}\n`);
  const history = [];
  let lastUrl = '';

  for (let step = 1; step <= MAX_STEPS; step++) {
    process.stdout.write(`📷 Passo ${step}: capturando tela... `);
    const screenshot = await getScreenshot();
    const state = await getPageState();
    process.stdout.write('✓ ');

    const stateMsg = `GOAL: ${goal}\n\nCURRENT STATE:\nURL: ${state.url}\nTitle: ${state.title}\nText snippet: ${state.text.slice(0, 800)}\n\nSTEP ${step} of ${MAX_STEPS}: pick the next action.`;
    history.push({ role: 'user', content: stateMsg });

    process.stdout.write('🧠 IA pensando... ');
    const t0 = Date.now();
    let raw;
    try { raw = await askOllama(history, screenshot); }
    catch (e) { console.log(`\n❌ ${e.message}`); return; }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`✓ (${dt}s)\n`);

    const { thought, action } = parseAction(raw);
    if (thought) console.log(`💭 ${thought}`);
    if (!action) { console.log('⚠️ IA não retornou ação válida — abortando.'); return; }

    if (action.type === 'done') {
      console.log(`\n✅ FIM: ${action.reason} (sucesso=${action.success})`);
      return;
    }

    console.log(`⚡ Executando: ${action.type}(${JSON.stringify(action).slice(0, 120)})`);
    const result = await executeAction(action);
    history.push({ role: 'assistant', content: JSON.stringify({ thought, action }) });
    history.push({ role: 'user', content: `Action result: ${JSON.stringify(result.data).slice(0, 400)}` });

    // Pequena espera pra página reagir
    await new Promise(r => setTimeout(r, 1200));

    // Detecta se URL mudou (sinal de progresso)
    if (state.url !== lastUrl) lastUrl = state.url;
  }
  console.log('\n⚠️ Atingiu limite de passos.');
}

// CLI loop
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🤖 Tandem + Ollama Bridge');
  console.log(`  Modelo: ${OLLAMA_MODEL}`);
  console.log(`  Tandem: ${TANDEM_URL}`);
  console.log('═══════════════════════════════════════════════');
  console.log('Digite um comando em linguagem natural. "sair" para fechar.\n');

  // Verifica conexões
  try {
    const ok1 = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!ok1.ok) throw new Error('Ollama não respondeu');
    const ok2 = await tandem('GET', '/tabs/list');
    if (!ok2.ok) throw new Error(`Tandem não respondeu (status ${ok2.status})`);
    console.log('✅ Ollama e Tandem conectados.\n');
  } catch (e) {
    console.error('❌ Falha de conexão:', e.message);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question('\n💬 Você: ', async (line) => {
    const cmd = line.trim();
    if (!cmd) return ask();
    if (cmd.toLowerCase() === 'sair' || cmd.toLowerCase() === 'exit') { rl.close(); return; }
    try { await runCommand(cmd); } catch (e) { console.error('Erro:', e.message); }
    ask();
  });
  ask();
}

main();
