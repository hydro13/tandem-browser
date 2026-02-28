# Liquid Glass Lite — Testing Guide

## Quick Start

```bash
cd ~/genx/tandem-browser
npm run start
```

The browser should launch with glass effects already applied!

## What to Look For

### 1. Tab Bar Glass
- Open a new tab and navigate to a colorful website (e.g., https://stripe.com)
- Switch tabs — you should see the page content **blurred through the tab bar**
- The tab bar should have a semi-transparent, glassy appearance
- Active tab should have a subtle inner glow on hover

**Expected:**
```
[Blurred website content visible through tabs]
┌─────────────────────────────────────────┐
│ [Tab 1] [Tab 2*] [Tab 3] [+]           │ ← Semi-transparent!
└─────────────────────────────────────────┘
```

### 2. Toolbar Glass
- The toolbar (back/forward/reload/URL bar) should have a glass background
- Buttons should have a **gel-like press** when clicked:
  - Click a button → it scales down slightly (0.97)
  - Release → it springs back with a bounce
- Hover over buttons → subtle inner glow should follow your cursor

**Test interactions:**
- Click back button several times → watch the gel press
- Hover over bookmark star → inner glow appears
- Type in URL bar → glass background stays consistent

### 3. Copilot Panel Glass
- Click the Copilot toggle on the right edge (or press configured shortcut)
- The panel should **slide in with a glass effect**
- This is the **strongest glass** — lots of blur, shows page content behind
- Resize the panel → glass effect maintains

**Expected:**
```
                              ┌─────────────────┐
   [Page content visible] →   │ ◐ COPILOT       │ ← Glass!
   [through the panel]         │                 │
                              │  [Chat UI]      │
                              │                 │
                              └─────────────────┘
```

### 4. Overlays
- Press voice input button (if configured) → voice indicator overlay should materialize
- The overlay should have a **materialization animation**:
  - Not just fading in opacity
  - Blur intensity goes from 0 → full over 400ms
- Background should be visible but very blurred

### 5. Settings Page
- Navigate to `tandem://settings`
- Scroll to the **Appearance** section
- Look for **"✨ Liquid Glass Effects"** section

**Test controls:**
1. **Toggle "Enable Liquid Glass"**
   - Turn off → all glass effects should disappear instantly
   - Turn on → glass effects reapply smoothly
   
2. **Adjust "Glass blur intensity" slider**
   - Drag from 10 to 30
   - Glass effects should update **in real-time** as you drag
   - Value display should update (e.g., "20px")

3. **Refraction slider** (currently disabled)
   - Should be visible but grayed out
   - Has note about requiring full LGL package

## Visual Quality Checklist

- [ ] No jagged edges on glass surfaces
- [ ] Blur is smooth and consistent
- [ ] No flickering or tearing
- [ ] Shadows give proper depth
- [ ] Light/dark mode both look good
- [ ] Tints match theme (dark tint in dark mode, light in light)
- [ ] Animations are smooth (60fps)
- [ ] No performance degradation

## Performance Testing

### FPS Check
1. Open DevTools (F12)
2. Go to Performance tab
3. Start recording
4. Interact with glass elements (switch tabs, open panel, etc.)
5. Stop recording
6. Check FPS — should be **solid 60fps**

### GPU Memory
1. Open DevTools → More Tools → Rendering
2. Enable "Paint flashing"
3. Interact with glass elements
4. **Expected:** Minimal repaints (only on state changes)

### CPU Usage
```bash
# In another terminal
top -pid $(pgrep -f "Electron")
```

**Expected:** <5% CPU when idle, <15% during interactions

## Theme Testing

### Dark Mode (Default)
```bash
# Should already be active
```
- Glass has dark tint: `rgba(30, 30, 30, 0.55)`
- Shadows are deep
- Inner glows are white

### Light Mode
1. Go to Settings → Appearance
2. Set "Color scheme" to "☀️ Light"
3. Glass should switch to light tint: `rgba(255, 255, 255, 0.45)`
4. Shadows should be softer
5. Inner glows should be dark

### System Mode
1. Set "Color scheme" to "🔄 System"
2. Change your macOS appearance (System Settings → Appearance)
3. Browser glass should adapt automatically

## Accessibility Testing

### Reduced Motion
1. Go to macOS System Settings → Accessibility → Display
2. Enable "Reduce motion"
3. Relaunch Tandem Browser
4. **Expected:**
   - No gel press animations
   - No materialization animations
   - Glass effects still visible (static)
   - State changes are instant

### Keyboard Navigation
- Tab through buttons → glass effects should still look good
- Focus indicators should be visible over glass

## Edge Cases

### Empty Tab
- New tab with no content → glass over white/dark background
- Should still look intentional, not broken

### Very Busy Pages
- Navigate to a very colorful page (e.g., https://www.apple.com)
- Glass should make content readable, not a distraction
- If too distracting → reduce blur in settings

### Resizing Window
- Resize browser window rapidly
- Glass should maintain quality
- No flickering or artifacts

### Multiple Tabs Open
- Open 10+ tabs
- Glass performance should stay consistent
- No slowdown

## Settings Persistence

1. Set blur to 25px
2. Close browser completely
3. Reopen browser
4. **Expected:** Blur is still 25px (saved to localStorage)

## Browser Support

### Confirmed Working
- [x] macOS (Electron 40.6.0 with Chromium 128+)

### Should Work (not tested yet)
- [ ] Windows (Electron)
- [ ] Linux (Electron)

### Known Limitations
- Older browsers without `backdrop-filter` support → solid backgrounds (graceful degradation)

## Troubleshooting

### Glass effects not visible
1. Check console: Any errors from `lgl-integration.js`?
2. Check localStorage: `localStorage.getItem('tandem.appearance.liquidGlass')`
3. Try toggling in settings

### Performance issues
1. Open DevTools → Performance
2. Record a profile
3. Look for long tasks or jank
4. Report findings with profile

### Blur not updating from settings
1. Check that the slider is wired correctly
2. Check console for `[LGL]` messages
3. Try refreshing the page

## Success Criteria

✅ **Integration is successful if:**

1. Tab bar shows page content through glass
2. Toolbar has glass background with gel-like buttons
3. Copilot panel has strong glass effect
4. Settings toggle enables/disables all effects
5. Blur slider updates effects in real-time
6. All animations are smooth (60fps)
7. Light/dark themes both look beautiful
8. No console errors
9. No performance degradation

## Known Issues / Future Work

### Current Limitations (CSS-first tier)
- No real lensing/refraction (just blur)
- No dynamic distortion on interaction
- No per-element refraction control

### When @mblock/liquid-glass is integrated
- [ ] Uncomment dependency in package.json
- [ ] Implement `enableWebGLLensing()` in lgl-integration.js
- [ ] Enable refraction slider in settings
- [ ] Add WebGL canvas layers for lensing
- [ ] Update performance note

## Reporting Issues

If you find bugs or visual issues:

1. Take a screenshot showing the problem
2. Note your OS and Electron version
3. Check console for errors
4. Try in a fresh user profile
5. Document steps to reproduce

## Demo Video Checklist

When recording the demo:

- [ ] Show tab bar glass with colorful page
- [ ] Open/close copilot panel (slide animation)
- [ ] Click buttons (gel press effect)
- [ ] Hover over active tab (inner glow)
- [ ] Adjust blur slider in settings (live update)
- [ ] Toggle light/dark mode (tint adaptation)
- [ ] Show voice overlay (if available)
- [ ] Demonstrate smooth 60fps performance

**Recommended pages for demo:**
- https://stripe.com (colorful, modern)
- https://linear.app (dark theme, beautiful)
- https://www.apple.com (busy, tests readability)

---

**Status:** Ready to test! Launch the browser and enjoy the glass. ✨
