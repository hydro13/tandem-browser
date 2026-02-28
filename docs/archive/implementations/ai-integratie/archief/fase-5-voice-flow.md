# Fase 5: Voice Flow — Sessie Context

## Wat is dit?

Volledige pipeline: Robin spreekt → tekst → naar AI backend → antwoord in chat. Robin kan tegen Kees praten alsof het een persoon is.

## Huidige Voice Staat

### Wat al werkt:
- Voice indicator overlay (HTML + CSS in shell/index.html)
- `#voice-indicator` en `#voice-live-text` elementen bestaan
- Voice start/stop via API (`POST /voice/start`, `POST /voice/stop`)
- Preload bridge: `tandem.sendVoiceTranscript(text, isFinal)`
- Preload bridge: `tandem.sendVoiceStatus(listening)`
- Shortcut: Cmd+Shift+M (macOS) / Ctrl+Shift+M (Linux)

### Wat nog niet werkt / moet gebouwd:
- Automatisch doorsturen van voice transcript naar actieve AI backend
- Voice knop in Kees panel (naast chat input)
- Push-to-talk mode
- Text-to-speech voor AI antwoorden (optioneel)

## Web Speech API

Tandem gebruikt de Web Speech API (built-in in Chromium/Electron):

```javascript
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'nl-NL';  // of 'en-US'

recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    const isFinal = event.results[i].isFinal;

    if (isFinal) {
      // Stuur naar AI backend
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
1. Robin drukt Cmd+Shift+M (of klikt mic knop)
2. Voice indicator verschijnt
3. Web Speech API start
4. Interim results → toon in voice indicator
5. Final result → inject in chat als user bericht
6. Stuur naar actieve AI backend(s) via ChatRouter
7. AI antwoordt → verschijnt in chat
8. (Optioneel) AI antwoord → text-to-speech → Robin hoort het
```

### Mic Knop in Kees Panel

Voeg toe naast de chat input:

```html
<div class="chat-input-area">
  <textarea id="oc-input"></textarea>
  <button id="oc-voice" title="Voice input (Cmd+Shift+M)">🎙️</button>
  <button id="oc-send">▶</button>
</div>
```

### Push-to-Talk

Twee modes:
1. **Toggle:** Klik = start, klik = stop
2. **Push-to-talk:** Houd ingedrukt = luisteren, loslaten = stop

Implementeer beide, configureerbaar in settings.

### Text-to-Speech (Optioneel)

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'nl-NL';
utterance.rate = 1.0;
speechSynthesis.speak(utterance);
```

**Let op:** TTS kan irritant zijn. Maak het configureerbaar en default UIT.

## Platform Overwegingen

### Web Speech API Beschikbaarheid
- **macOS + Electron:** Werkt (gebruikt macOS speech services)
- **Linux + Electron:** Werkt MOGELIJK niet out-of-the-box
  - Chromium's Web Speech API vereist Google's speech servers
  - Alternatief: lokale speech-to-text (Whisper, Vosk)
  - **Fallback nodig** voor Linux

### Linux Voice Alternatieven
1. **Whisper (OpenAI):** Lokaal, gratis, goede kwaliteit
   - `npm install whisper-node` of system-level installatie
2. **Vosk:** Offline speech recognition
   - Lightweight, meerdere talen
3. **Google Cloud Speech:** Online, betaald maar betrouwbaar

**Aanbeveling:** Web Speech API als primair, met een configureerbare fallback voor Linux.

### Microfoon Permissies
- **macOS:** Electron vraagt automatisch (systeem dialog)
- **Linux:** PulseAudio/PipeWire permissies, meestal geen dialog nodig
- **Windows:** Systeem dialog voor mic access

## Bekende Valkuilen

1. **Web Speech API in Electron:** Kan onbetrouwbaar zijn, test grondig
2. **Taal detectie:** Default naar `nl-NL`, maar maak configureerbaar
3. **Achtergrond geluid:** Kan false positives geven, implementeer noise gate
4. **Interrupt handling:** Als Robin praat terwijl AI antwoord geeft, wat dan?
   - Aanbeveling: stop TTS, luister naar Robin
