# Clipboard Image Paste in Chat Panel

> **Status:** PLAN
> **Goal:** Robin can Cmd+V use to a screenshot/image out the clipboard in the chat panel te plakken. The image is if preview getoond and meegestuurd with the bericht.

## Huidige Situatie

- Chat input is a `<textarea>` (text-only)
- `ChatMessage` interface has only `text: string`
- No image/attachment support in the chat flow
- Screenshots be opgeslagen in `~/Pictures/Tandem/` but can not in the chat geplakt be

## Wat er must gebeuren

4 lagen must aangepast be:

```
1. Renderer (shell/index.html)
   - Paste event listener op chat input
   - Image preview under the input field
   - Image meesturen bij sendMessage()

2. Data model (panel/manager.ts)
   - ChatMessage.image field (optional)
   - Image save to disk
   - Image meesturen in webhook

3. API (api/server.ts)
   - POST /chat accepteert image (base64)
   - GET /chat retourneert image pad

4. Display (shell/index.html)
   - Berichten with images tonen if <img> in the chat
```

## Claude Code Prompt

```
Read these files first:
- shell/index.html lines 567-614 (chat CSS styles)
- shell/index.html lines 1123-1130 (chat HTML structure)
- shell/index.html lines 2306-2355 (sendMessage function + input event listeners)
- shell/index.html lines 1900-1935 (appendMessage function)
- src/panel/manager.ts lines 13-18 (ChatMessage interface)
- src/panel/manager.ts lines 103-127 (addChatMessage + fireWebhook)
- src/api/server.ts search for "/chat" routes (GET and POST)

## Context
Tandem Browser has a chat panel (right sidebar) where Robin talks to Kees (AI wingman). The chat input is a <textarea>. Robin wants to paste images from clipboard (Cmd+V) into the chat, see a preview, and send them with the message. Images should be saved to disk and the file path stored in the ChatMessage.

The chat system has multiple backends (OpenClaw WebSocket, Claude API) managed by a ChatRouter. The sendMessage() function in the renderer handles both modes. For this feature, we focus on the OpenClaw backend path since that's how Kees receives messages.

## Task: Implement clipboard image paste in chat

### Step 1: Extend ChatMessage interface (panel/manager.ts)

Add optional image field:
```typescript
export interface ChatMessage {
  id: number;
  from: 'robin' | 'kees' | 'claude';
  text: string;
  timestamp: number;
  image?: string;  // relative path to saved image in ~/.tandem/chat-images/
}
```

### Step 2: Add image-aware addChatMessage (panel/manager.ts)

Add a new method and update the existing one:
```typescript
import path from 'path';
import os from 'os';

// Add to constructor or as class property:
private chatImagesDir = path.join(os.homedir(), '.tandem', 'chat-images');

// In constructor, ensure directory exists:
if (!fs.existsSync(this.chatImagesDir)) {
  fs.mkdirSync(this.chatImagesDir, { recursive: true });
}

/** Save a base64 image to disk, return the filename */
saveImage(base64Data: string): string {
  // Strip data URL prefix if present
  const raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const ext = base64Data.startsWith('data:image/png') ? 'png' : 'jpg';
  const filename = `chat-${Date.now()}.${ext}`;
  const filePath = path.join(this.chatImagesDir, filename);
  fs.writeFileSync(filePath, Buffer.from(raw, 'base64'));
  return filename;
}

/** Get full path to a chat image */
getImagePath(filename: string): string {
  return path.join(this.chatImagesDir, filename);
}
```

Update addChatMessage to accept optional image:
```typescript
addChatMessage(from: 'robin' | 'kees' | 'claude', text: string, image?: string): ChatMessage {
  const msg: ChatMessage = {
    id: ++this.chatCounter,
    from,
    text,
    timestamp: Date.now(),
    image,  // filename (not full path)
  };
  this.chatMessages.push(msg);
  this.saveChatHistory();
  this.win.webContents.send('chat-message', msg);
  if (from === 'kees' && this.keesTyping) {
    this.setKeesTyping(false);
  }
  this.fireWebhook(msg).catch(() => {});
  return msg;
}
```

### Step 3: Update fireWebhook to include image info (panel/manager.ts)

In the fireWebhook method, add image path to the webhook payload so Kees knows an image was attached:
```typescript
body: JSON.stringify({
  type: 'tandem-chat',
  text: `[Tandem Chat] Robin: ${msg.text}${msg.image ? ' [image attached: ' + msg.image + ']' : ''}`,
  metadata: {
    messageId: msg.id,
    from: msg.from,
    timestamp: msg.timestamp,
    source: 'tandem-browser',
    image: msg.image || null,
  },
}),
```

### Step 4: Update API routes (api/server.ts)

Update POST /chat to accept image:
```typescript
this.app.post('/chat', (req: Request, res: Response) => {
  const { text, from, image } = req.body;
  if (!text && !image) { res.status(400).json({ error: 'text or image required' }); return; }
  const sender: 'robin' | 'kees' | 'claude' = (from === 'robin') ? 'robin' : (from === 'claude') ? 'claude' : 'kees';
  try {
    let savedImage: string | undefined;
    if (image) {
      savedImage = this.panelManager.saveImage(image);
    }
    const msg = this.panelManager.addChatMessage(sender, text || '', savedImage);
    res.json({ ok: true, message: msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```

Add a route to serve chat images:
```typescript
/** Serve chat images */
this.app.get('/chat/image/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = this.panelManager.getImagePath(filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }
  res.sendFile(filePath);
});
```

### Step 5: Add IPC handler for image paste (main.ts)

Add a new IPC handler so the renderer can send images to PanelManager:
```typescript
ipcMain.handle('chat-send-image', async (_event, data: { text: string; image: string }) => {
  if (!panelManager) return { ok: false };
  const filename = panelManager.saveImage(data.image);
  const msg = panelManager.addChatMessage('robin', data.text || '', filename);
  return { ok: true, message: msg };
});
```

Also add to the ipcHandlers cleanup array (around line 250):
```typescript
const ipcHandlers = ['snap-for-kees', 'quick-screenshot', ..., 'chat-send-image'];
```

### Step 6: Add to preload.ts

```typescript
sendChatImage: (text: string, image: string) => ipcRenderer.invoke('chat-send-image', { text, image }),
```

### Step 7: Renderer - paste event + preview + send (shell/index.html)

This is the biggest change. Add these features to the chat area:

**A) CSS for image preview (add near the other .chat-* styles around line 583):**
```css
.chat-image-preview {
  position: relative;
  padding: 6px 12px;
  background: rgba(255,255,255,0.05);
  border-top: 1px solid rgba(255,255,255,0.1);
}
.chat-image-preview img {
  max-width: 200px;
  max-height: 150px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
}
.chat-image-preview .remove-preview {
  position: absolute;
  top: 2px;
  right: 8px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chat-image-preview .remove-preview:hover { background: rgba(255,0,0,0.6); }
.chat-msg img.chat-msg-image {
  max-width: 250px;
  max-height: 200px;
  border-radius: 6px;
  margin-top: 4px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
}
.chat-msg img.chat-msg-image:hover { border-color: var(--accent); }
```

**B) HTML: Add a preview container above the input (in the chat-input-wrap area, line ~1128):**

Change the chat input area from:
```html
<div class="chat-input-wrap">
  <textarea class="chat-input" id="chat-input" placeholder="Bericht about Kees..." rows="1"></textarea>
  <button class="chat-send-btn" id="chat-send-btn">▶</button>
</div>
```
To:
```html
<div id="chat-image-preview" class="chat-image-preview" style="display:none;"></div>
<div class="chat-input-wrap">
  <textarea class="chat-input" id="chat-input" placeholder="Bericht about Kees..." rows="1"></textarea>
  <button class="chat-send-btn" id="chat-send-btn">▶</button>
</div>
```

**C) JavaScript: Paste handler, preview management, and updated sendMessage (add in the chatRouter section):**

Add a variable to track the pending image:
```javascript
let pendingImage = null; // base64 data URL

const imagePreviewEl = document.getElementById('chat-image-preview');
```

Add paste event listener on the chat input:
```javascript
inputEl.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  for (const item or items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault(); // don't paste as text
      const blob = item.getAsFile();
      if (!blob) return;
      
      const reader = new FileReader();
      reader.onload = () => {
        pendingImage = reader.result; // data:image/png;base64,...
        showImagePreview(pendingImage);
      };
      reader.readAsDataURL(blob);
      return; // only handle first image
    }
  }
});

function showImagePreview(dataUrl) {
  imagePreviewEl.innerHTML = `
    <img src="${dataUrl}" alt="Preview">
    <button class="remove-preview" title="Remove image">✕</button>
  `;
  imagePreviewEl.style.display = 'block';
  imagePreviewEl.querySelector('.remove-preview').addEventListener('click', () => {
    clearImagePreview();
  });
}

function clearImagePreview() {
  pendingImage = null;
  imagePreviewEl.innerHTML = '';
  imagePreviewEl.style.display = 'none';
}
```

**D) Update sendMessage() to handle images:**

At the top or sendMessage(), after `const text = inputEl.value.trim();`:
```javascript
// If there's a pending image, send via IPC (not WebSocket)
if (pendingImage) {
  const imageData = pendingImage;
  clearImagePreview();
  inputEl.value = '';
  inputEl.style.height = '';
  
  // Show local preview immediately
  const robinMsg = appendMessage('user', text || '📷 Image', Date.now(), 'robin');
  robinMsg.dataset.localMessage = 'true';
  // Add image to the message bubble
  const msgText = robinMsg.querySelector('.msg-text');
  const img = document.createElement('img');
  img.src = imageData;
  img.className = 'chat-msg-image';
  img.addEventListener('click', () => window.open(imageData, '_blank'));
  msgText.appendChild(img);
  
  // Send to main process via IPC
  if (window.tandem?.sendChatImage) {
    window.tandem.sendChatImage(text, imageData);
  }
  return;
}
```

**IMPORTANT:** This `if (pendingImage)` block must come BEFORE the existing `if (!text) return;` check, because a user might paste an image without typing any text.

**E) Update appendMessage() to show images from history/incoming messages:**

In the appendMessage function, after the innerHTML assignment, check for image:
```javascript
function appendMessage(role, text, timestamp, source, image) {
  // ... existing code to create el and set innerHTML ...
  
  // Add image if present
  if (image) {
    const msgText = el.querySelector('.msg-text');
    const img = document.createElement('img');
    img.src = `http://localhost:8765/chat/image/${image}`;
    img.className = 'chat-msg-image';
    img.addEventListener('click', () => window.open(img.src, '_blank'));
    img.onerror = () => { img.style.display = 'none'; }; // hide if image fails to load
    msgText.appendChild(img);
  }
  
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}
```

Update ALL calls to appendMessage to pass the image parameter. Search for every `appendMessage(` call and add the image field. For history messages, it comes from `m.image`. For incoming chat-message events, it comes from `msg.image`. For locally typed messages (no image), pass undefined.

The key places to update:
1. History loading in switchBackend() — `appendMessage(m.role, m.text, m.timestamp, m.source, m.image)`
2. Incoming chat-message handler — `appendMessage(role, msg.text, msg.timestamp, source, msg.image)`
3. The onMessage handler — check if msg object has .image field

**F) Handle drag-and-drop as bonus (optional but easy):**
```javascript
inputEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

inputEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = reader.result;
      showImagePreview(pendingImage);
    };
    reader.readAsDataURL(file);
  }
});
```

## SELF-CHECK before finishing:

1. `npm run compile` — zero errors
2. Verify ChatMessage interface has optional `image?: string` field
3. Verify `~/.tandem/chat-images/` directory creation in PanelManager constructor
4. Verify saveImage() strips data URL prefix and writes correct binary
5. Verify path traversal protection in GET /chat/image/:filename
6. Verify paste event listener calls preventDefault() for image pastes (so no garbage text appears)
7. Verify clearImagePreview() is called after sending (no stale preview)
8. Verify appendMessage has the image parameter in ALL call sites (search for every `appendMessage(` call)
9. Verify the `if (pendingImage)` block is BEFORE `if (!text) return;` in sendMessage()
10. Verify IPC handler 'chat-send-image' is in the cleanup array
11. Count: should have changed ~6 files (panel/manager.ts, api/server.ts, main.ts, preload.ts, shell/index.html, and types if separate)

Do NOT run `npm start` or `npm run dev`.
Do NOT install any new npm packages.
```

## Verificatie na implementatie

```bash
# 1. Compile
npm run compile

# 2. Start Tandem
npm start

# 3. Test paste:
#    - Maak a screenshot (Cmd+Shift+4 op Mac)
#    - Klik in chat input
#    - Cmd+V
#    - Preview must verschijnen under the input field
#    - ✕ knop must preview verwijderen
#    - Type optional text erbij
#    - Enter → bericht + image appears in chat
#    - Kees ontvangt bericht with [image attached] via webhook

# 4. Test drag-and-drop:
#    - Sleep a PNG or Finder to the chat input field
#    - Preview must verschijnen

# 5. Test history:
#    - Herstart Tandem
#    - Eerder gestuurde images must visible are in chat history

# 6. Test API:
curl -s http://127.0.0.1:8765/chat?limit=3 | python3 -m json.tool
# Berichten with image field must a filename bevatten

# 7. Test image serving:
# Pak a filename out stap 6
curl -sf http://127.0.0.1:8765/chat/image/{filename} -o /tmp/test.png
open /tmp/test.png  # must the image tonen
```
