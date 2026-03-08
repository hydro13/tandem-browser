# Phase 5: Voice Flow — Sessie Context

## Wat is this?

Volledige pipeline: Robin spreekt → text → to AI backend → antwoord in chat. Robin can tegen Kees praten alsof the a persoon is.

## Huidige Voice Staat

### Wat already works:
- Voice indicator overlay (HTML + CSS in shell/index.html)
- `#voice-indicator` and `#voice-live-text` elementen bestaan
- Voice start/stop via API (`POST /voice/start`, `POST /voice/stop`)
- Preload bridge: `tandem.sendVoiceTranscript(text, isFinal)`
- Preload bridge: `tandem.sendVoiceStatus(listening)`
- Shortcut: Cmd+Shift+M (macOS) / Ctrl+Shift+M (Linux)

### Wat still not works / must built:
- Automatisch doorsturen or voice transcript to actieve AI backend
- Voice knop in Kees panel (next to chat input)
- Push-to-talk mode
- Text-to-speech for AI antwoorden (optional)

## Web Speech API

Tandem uses the Web Speech API (built-in in Chromium/Electron):

```javascript
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'nl-NL';  // or 'and-US'

recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    const isFinal = event.results[i].isFinal;

    if (isFinal) {
      // Stuur to AI backend
      chatRouter.sendMessage(transcript);
    } else {
      // Toon interim text
      voiceLiveText.textContent = transcript;
    }
  }
};
```

## Implementatie

### Voice → Chat Pipeline

```
1. Robin drukt Cmd+Shift+M (or clicks mic knop)
2. Voice indicator appears
3. Web Speech API start
4. Interim results → toon in voice indicator
5. Final result → inject in chat if user bericht
6. Stuur to actieve AI backend(s) via ChatRouter
7. AI antwoordt → appears in chat
8. (Optioneel) AI antwoord → text-to-speech → Robin belongs the
```

### Mic Knop in Kees Panel

Voeg toe next to the chat input:

```html
<div class="chat-input-area">
  <textarea id="oc-input"></textarea>
  <button id="oc-voice" title="Voice input (Cmd+Shift+M)">🎙️</button>
  <button id="oc-send">▶</button>
</div>
```

### Push-to-Talk

Twee modes:
1. **Toggle:** Klik = start, click = stop
2. **Push-to-talk:** Houd ingedrukt = luisteren, loslaten = stop

Implementeer beide, configureerbaar in settings.

### Text-to-Speech (Optioneel)

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'nl-NL';
utterance.rate = 1.0;
speechSynthesis.speak(utterance);
```

**Let op:** TTS can irritant are. Maak the configureerbaar and default UIT.

## Platform Considerations

### Web Speech API Availableheid
- **macOS + Electron:** Works (uses macOS speech services)
- **Linux + Electron:** Works MOGELIJK not out-or-the-box
  - Chromium's Web Speech API requires Google's speech servers
  - Alternatief: lokale speech-to-text (Whisper, Vosk)
  - **Fallback nodig** for Linux

### Linux Voice Alternatieven
1. **Whisper (OpenAI):** Local, gratis, goede kwaliteit
   - `npm install whisper-node` or system-level installatie
2. **Vosk:** Offline speech recognition
   - Lightweight, multiple talen
3. **Google Cloud Speech:** Online, betaald but betrouwbaar

**Aanbeveling:** Web Speech API if primair, with a configureerbare fallback for Linux.

### Microfoon Permissies
- **macOS:** Electron asks automatisch (system dialog)
- **Linux:** PulseAudio/PipeWire permissies, meestal no dialog nodig
- **Windows:** System dialog for mic access

## Bekende Valkuilen

1. **Web Speech API in Electron:** Can onbetrouwbaar are, test grondig
2. **Taal detection:** Default to `nl-NL`, but maak configureerbaar
3. **Achtergrond geluid:** Can false positives geven, implementeer noise gate
4. **Interrupt handling:** If Robin praat terwijl AI antwoord geeft, wat then?
   - Aanbeveling: stop TTS, luister to Robin
