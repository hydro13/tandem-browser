# DevTools API — Manual Test Protocol

## Setup
1. Start Tandem: `npm start`
2. Navigate to a content-rich page (e.g., https://news.ycombinator.com)
3. Wait for page to fully load

## Test Scenarios

### T1: Console Capture Round-Trip
1. Open Tandem, navigate to any page
2. `curl http://127.0.0.1:8765/devtools/console` — should return entries (may be empty)
3. In the page, open browser console and type: `console.error("TEST_ERROR")`
   Or via API: `curl -X POST http://127.0.0.1:8765/devtools/evaluate -H 'Content-Type: application/json' -d '{"expression":"console.error(\"TEST_ERROR\")"}'`
4. `curl http://127.0.0.1:8765/devtools/console?level=error` — should contain TEST_ERROR
5. `curl http://127.0.0.1:8765/devtools/console?search=TEST` — should find it
6. `curl -X POST http://127.0.0.1:8765/devtools/console/clear`
7. `curl http://127.0.0.1:8765/devtools/console` — should be empty

### T2: Network Inspection
1. Navigate to a page that makes API calls (e.g., https://news.ycombinator.com)
2. `curl http://127.0.0.1:8765/devtools/network` — should show requests
3. `curl 'http://127.0.0.1:8765/devtools/network?type=XHR'` — filter XHR/Fetch
4. Pick a requestId from the response
5. `curl http://127.0.0.1:8765/devtools/network/{requestId}/body` — should return body
6. `curl 'http://127.0.0.1:8765/devtools/network?failed=true'` — show failures

### T3: DOM Queries
1. Navigate to https://example.com
2. `curl -X POST http://127.0.0.1:8765/devtools/dom/query -H 'Content-Type: application/json' -d '{"selector":"h1"}'`
   — should return the h1 with "Example Domain"
3. `curl -X POST http://127.0.0.1:8765/devtools/dom/xpath -H 'Content-Type: application/json' -d '{"expression":"//p"}'`
   — should return paragraph elements

### T4: Storage
1. Navigate to a site with cookies (e.g., https://google.com)
2. `curl http://127.0.0.1:8765/devtools/storage`
3. Verify cookies array is populated
4. Check localStorage/sessionStorage objects

### T5: Performance
1. `curl http://127.0.0.1:8765/devtools/performance`
2. Verify metrics object contains JSHeapUsedSize, Documents, Nodes, etc.

### T6: Tab Switch
1. Open two tabs
2. Focus tab 1, run console query
3. Focus tab 2, run console query
4. Verify the CDP auto-detaches from tab 1 and re-attaches to tab 2
5. Check /devtools/status shows correct tabId

### T7: DevTools Window Conflict
1. Click "Inspect Element" on a page (opens DevTools)
2. `curl http://127.0.0.1:8765/devtools/status` — should show attached=true
3. `curl http://127.0.0.1:8765/devtools/console` — should still work
4. Close DevTools window
5. `curl http://127.0.0.1:8765/devtools/console` — should auto-re-attach

### T8: Error Handling
1. Close all tabs
2. `curl http://127.0.0.1:8765/devtools/console` — should return graceful error or empty
3. `curl -X POST http://127.0.0.1:8765/devtools/dom/query -H 'Content-Type: application/json' -d '{}'`
   — should return 400 (missing selector)
4. `curl -X POST http://127.0.0.1:8765/devtools/cdp -H 'Content-Type: application/json' -d '{"method":"NonExistent.method"}'`
   — should return 500 with error message
