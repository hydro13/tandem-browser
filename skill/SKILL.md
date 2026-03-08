# Tandem Browser - OpenClaw Skill

Tandem Browser is a specialized Electron browser designed for AI-human symbiosis. It provides a comprehensive HTTP API for automated web browsing, content extraction, and workflow automation while maintaining human oversight and anti-detection capabilities.

## Quick Start

**Base URL:** `http://localhost:8765`
**Authentication:** None required (localhost only)
**API Style:** RESTful JSON

## Core Capabilities

### 1. Navigation & Page Interaction
```bash
# Navigate to a URL
curl -X POST http://localhost:8765/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Click an element
curl -X POST http://localhost:8765/click \
  -H "Content-Type: application/json" \
  -d '{"selector": ".button", "x": 100, "y": 200}'

# Type text
curl -X POST http://localhost:8765/type \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "selector": "input[type=\"text\"]"}'

# Take screenshot
curl -X GET http://localhost:8765/screenshot \
  -o screenshot.png
```

### 2. Content Extraction ⭐ NEW
```bash
# Extract structured content from current page
curl -X POST http://localhost:8765/content/extract

# Extract from specific URL (headless)
curl -X POST http://localhost:8765/content/extract/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://linkedin.com/in/johndoe"}'
```

**Returns structured JSON for:**
- **Articles:** title, author, date, body (markdown), images
- **Profiles:** name, headline, experience, education (LinkedIn, etc.)
- **Products:** name, price, description, reviews (Amazon, etc.)
- **Search Results:** query, results array with title/url/snippet
- **Generic:** title, text content, images, links

### 3. Multi-step Workflows ⭐ NEW
```bash
# Run a predefined workflow
curl -X POST http://localhost:8765/workflow/run \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "linkedin-profile-scan", "variables": {"username": "johndoe"}}'

# Check workflow status
curl -X GET http://localhost:8765/workflow/status/exec123

# Stop running workflow
curl -X POST http://localhost:8765/workflow/stop \
  -H "Content-Type: application/json" \
  -d '{"executionId": "exec123"}'
```

**Workflow Steps:**
- `navigate` - Go to URL
- `wait` - Wait for condition or duration
- `click` - Click element
- `type` - Type text
- `extract` - Extract data to variables
- `screenshot` - Take screenshot
- `scroll` - Scroll page
- `condition` - Conditional branching (if/else/goto)

### 4. Login State Management ⭐ NEW
```bash
# Check login status for domain
curl -X GET http://localhost:8765/auth/state/linkedin.com

# Get all login states
curl -X GET http://localhost:8765/auth/states

# Check current page login status
curl -X POST http://localhost:8765/auth/check
```

**Login Detection:**
- Automatically detects login/logout state
- Recognizes login pages
- Tracks username when logged in
- Confidence scoring for reliability

## Common Workflows

### Browse and Extract Article
```bash
# 1. Navigate to article
curl -X POST http://localhost:8765/navigate \
  -d '{"url": "https://techcrunch.com/article-url"}'

# 2. Wait for load
sleep 3

# 3. Extract structured content
curl -X POST http://localhost:8765/content/extract
```

### LinkedIn Profile Extraction
```bash
# Navigate and extract in one call (headless)
curl -X POST http://localhost:8765/content/extract/url \
  -d '{"url": "https://linkedin.com/in/username"}'
```

### Fill and Submit Form
```bash
# 1. Navigate to form page
curl -X POST http://localhost:8765/navigate \
  -d '{"url": "https://example.com/contact"}'

# 2. Fill form fields
curl -X POST http://localhost:8765/type \
  -d '{"selector": "#name", "text": "John Doe"}'
curl -X POST http://localhost:8765/type \
  -d '{"selector": "#email", "text": "john@example.com"}'

# 3. Submit form
curl -X POST http://localhost:8765/click \
  -d '{"selector": "button[type=\"submit\"]"}'
```

### Multi-step Workflow Example
```json
{
  "name": "LinkedIn Profile Scan",
  "description": "Navigate to LinkedIn profile and extract information",
  "steps": [
    {
      "id": "nav1",
      "type": "navigate",
      "params": {"url": "https://linkedin.com/in/{{username}}"},
      "description": "Navigate to profile"
    },
    {
      "id": "wait1", 
      "type": "wait",
      "params": {"duration": 3000},
      "description": "Wait for page load"
    },
    {
      "id": "check_login",
      "type": "condition", 
      "params": {
        "condition": "elementExists",
        "selector": ".login-form",
        "onTrue": "abort",
        "onFalse": "continue"
      },
      "description": "Check if logged in"
    },
    {
      "id": "extract1",
      "type": "extract",
      "params": {"saveAs": "profile_data"},
      "description": "Extract profile information"
    },
    {
      "id": "screenshot1",
      "type": "screenshot", 
      "params": {"filename": "profile-{{username}}.png"},
      "description": "Take screenshot"
    }
  ]
}
```

## Advanced Features

### Page Memory & Context
```bash
# Get site memory for domain
curl -X GET http://localhost:8765/memory/site/linkedin.com

# Search across all visited pages
curl -X GET "http://localhost:8765/memory/search?q=artificial+intelligence"

# Get recent browsing context
curl -X GET http://localhost:8765/context/recent
```

### Tab Management
```bash
# Open new tab
curl -X POST http://localhost:8765/tabs/open \
  -d '{"url": "https://example.com"}'

# List all tabs
curl -X GET http://localhost:8765/tabs/list

# Focus specific tab
curl -X POST http://localhost:8765/tabs/focus \
  -d '{"tabId": "tab123"}'
```

### Headless Browsing
```bash
# Open headless tab (invisible)
curl -X POST http://localhost:8765/headless/open \
  -d '{"url": "https://example.com"}'

# Get content from headless tab
curl -X GET http://localhost:8765/headless/content/head123

# Show headless tab to user if needed
curl -X POST http://localhost:8765/headless/show \
  -d '{"headlessId": "head123"}'
```

### Network Monitoring
```bash
# Get network traffic log
curl -X GET http://localhost:8765/network/log

# Discover APIs on current site
curl -X GET http://localhost:8765/network/apis
```

### Voice Integration
```bash
# Start voice recognition
curl -X POST http://localhost:8765/voice/start

# Get voice status and transcript
curl -X GET http://localhost:8765/voice/status
```

## Error Handling

All endpoints return JSON responses with consistent error format:

```json
{
  "success": false,
  "error": "Element not found",
  "code": "ELEMENT_NOT_FOUND",
  "details": {
    "selector": ".non-existent",
    "timestamp": "2026-02-11T15:23:45Z"
  }
}
```

Common error codes:
- `NAVIGATION_FAILED` - URL could not be loaded
- `ELEMENT_NOT_FOUND` - CSS selector matched no elements
- `TIMEOUT` - Operation timed out
- `CAPTCHA_DETECTED` - Human intervention needed
- `LOGIN_REQUIRED` - Authentication needed

## Anti-Detection Features

Tandem is designed to be undetectable:
- ✅ Human-like timing and mouse movements
- ✅ Real Chrome fingerprint (WebGL, Canvas, Audio)
- ✅ Event.isTrusted = true for all interactions
- ✅ No injected DOM elements visible to pages
- ✅ Persistent cookies and sessions
- ✅ Behavioral learning from human usage

**⚠️ Always respect website terms or service and robots.txt**

## Best Practices

1. **Wait for page loads:** Add delays after navigation
2. **Check login state:** Use `/auth/check` before sensitive operations  
3. **Handle captchas:** Use `/wingman-alert` system for human intervention
4. **Use workflows:** For complex multi-step tasks
5. **Monitor confidence:** Check extraction confidence scores
6. **Graceful failures:** Always handle error responses

## Configuration

Tandem stores configuration in `~/.tandem/config.json`:
- Screenshot destinations
- Voice recognition language
- Stealth settings
- Behavioral learning preferences

## Dependencies

- Node.js 14+
- Electron
- Chrome/Chromium engine
- macOS (primary), Linux (experimental)

## Support

For issues or feature requests, contact the development team or check the project repository at `hydro13/tandem-browser`.

---

*Last updated: February 2026*
*API Version: 5.0 (Phase 5 OpenClaw Integration)*