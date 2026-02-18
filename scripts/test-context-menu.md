# Context Menu Test Protocol — Tandem Browser

## Setup
1. Start Tandem: `npm start`
2. Open a test page with links, images, input fields
   Recommended: https://www.w3schools.com/html/html_links.asp

## Test Cases

### TC1: Empty Page Background
- [ ] Right-click on empty space → menu with Back, Forward, Reload, etc.
- [ ] Back is disabled when no history
- [ ] Forward is disabled when no forward history
- [ ] Reload reloads the page
- [ ] Save As... opens save dialog
- [ ] Print... opens print dialog
- [ ] View Page Source opens source in new tab
- [ ] Inspect Element opens DevTools at correct location
- [ ] Summarize Page with Kees → opens panel, sends message
- [ ] Bookmark this Page → toggles bookmark, star updates

### TC2: Links
- [ ] Right-click on link → link items at top of menu
- [ ] Open Link in New Tab opens a new tab with the link URL
- [ ] Copy Link Address → verify clipboard content
- [ ] Copy Link Text → verify clipboard content
- [ ] Save Link As... → download starts
- [ ] Bookmark Link → bookmark added

### TC3: Images
- [ ] Right-click on image → image items appear
- [ ] Open Image in New Tab works
- [ ] Save Image As... → download starts
- [ ] Copy Image → pasteable in another app
- [ ] Copy Image Address → verify clipboard

### TC4: Text Selection
- [ ] Select text → right-click → Copy + Search Google items
- [ ] Copy works
- [ ] Search Google opens search results in new tab
- [ ] Long selection text is truncated in menu label

### TC5: Input Fields
- [ ] Right-click in text input → edit items (Undo, Redo, Cut, Copy, Paste, etc.)
- [ ] Undo is grayed out when nothing to undo
- [ ] Cut/Copy/Paste work correctly
- [ ] Paste as Plain Text works
- [ ] Select All selects all text in the field
- [ ] In a contenteditable div: same behavior
- [ ] Text selected in input → "Search Google" also available

### TC6: Tab Context Menu
- [ ] Right-click on a tab → tab context menu appears
- [ ] New Tab opens a new tab
- [ ] Reload Tab reloads the clicked tab (not necessarily the active one)
- [ ] Duplicate Tab opens same URL in new tab
- [ ] Mute/Unmute Tab toggles audio muting
- [ ] Close Tab closes the clicked tab
- [ ] Close Other Tabs closes all other tabs
- [ ] Close Tabs to Right closes only tabs to the right
- [ ] Reopen Closed Tab reopens the last closed tab
- [ ] Reopen Closed Tab is grayed out when no closed tabs
- [ ] With only 1 tab: Close Other Tabs is grayed out
- [ ] On rightmost tab: Close Tabs to Right is grayed out

### TC7: Kees AI Items
- [ ] "Ask Kees about Selection" visible when text selected
- [ ] Clicking opens panel and sends selection to chat
- [ ] "Ask Kees about this Image" visible on images
- [ ] "Summarize Page with Kees" always visible
- [ ] Panel opens automatically when Kees item clicked

### TC8: Edge Cases
- [ ] Right-click on newtab page → minimal menu (no nav/save/print)
- [ ] Right-click on settings page → minimal menu
- [ ] Fast triple right-click → no crashes or double menus
- [ ] Very long selection → "Search Google for ..." is truncated
- [ ] Image that is also a link → both link and image sections visible
- [ ] Video element → Open/Save/Copy Video items
- [ ] Audio element → Open/Save/Copy Audio items
- [ ] about:blank page → full menu still works
- [ ] Remove Bookmark shown when page is already bookmarked
