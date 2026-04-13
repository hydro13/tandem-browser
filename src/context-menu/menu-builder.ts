import type { WebContents} from 'electron';
import { Menu, MenuItem, clipboard, dialog, webContents } from 'electron';
import type { ContextMenuParams, ContextMenuDeps } from './types';
import { getPasswordManager } from '../passwords/manager';
import { createLogger } from '../utils/logger';
import { IpcChannels } from '../shared/ipc-channels';

const log = createLogger('ContextMenu');

/** Protocols that should never be opened/downloaded */
const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'vbscript:'];

const SEARCH_ENGINE = {
  name: 'Google',
  url: 'https://www.google.com/search?q=',
};

/** Check if a URL is safe to open in a new tab or download */
function isSafeURL(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trim();
  return !BLOCKED_PROTOCOLS.some(p => lower.startsWith(p));
}

/**
 * Builds Electron Menu instances based on the right-click context.
 * Each add*Items method handles a specific context type (link, image, etc.).
 * Methods are added incrementally per implementation phase.
 */
export class ContextMenuBuilder {
  private deps: ContextMenuDeps;

  constructor(deps: ContextMenuDeps) {
    this.deps = deps;
  }

  /**
   * Build the full context menu for the given params.
   * Dispatches to context-specific builders in order: specific → general.
   */
  build(params: ContextMenuParams, wc: WebContents): Menu {
    const menu = new Menu();
    const url = wc.getURL();

    // Phase 6: Internal/shell pages get a minimal menu
    if (url.startsWith('file://') && url.includes('/shell/')) {
      this.addInternalPageItems(menu, params, wc);
      return menu;
    }

    if (params.isEditable) {
      // Phase 3: Input/textarea/contenteditable — edit items first
      this.addEditableItems(menu, params, wc);
      // Also allow "Search Google" if text is selected inside the field
      if (params.selectionText) {
        this.addSeparator(menu);
        this.addSearchItem(menu, params);
      }
    } else {
      // Phase 2: Context-specific items (link, image, selection)
      this.addLinkItems(menu, params, wc);
      this.addImageItems(menu, params, wc);
      // Phase 6: Video/Audio items
      this.addMediaItems(menu, params, wc);
      this.addSelectionItems(menu, params, wc);
    }

    // Phase 1: Navigation + tool items (always present)
    if (menu.items.length > 0 && menu.items.some(i => i.type !== 'separator')) {
      this.addSeparator(menu);
    }
    this.addNavigationItems(menu, params, wc);
    this.addSeparator(menu);
    this.addToolItems(menu, params, wc);

    // Phase 5: Tandem-specific items (Wingman AI, Bookmark, Screenshot)
    this.addTandemItems(menu, params, wc);

    // Phase 7: Pinboard items
    this.addPinboardItems(menu, params, wc);

    return menu;
  }

  // ═══ Phase 2: Link Items ═══

  /** Open in New Tab, Copy Link Address/Text, Save Link, Bookmark Link */
  private addLinkItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (!params.linkURL) return;

    if (isSafeURL(params.linkURL)) {
      menu.append(new MenuItem({
        label: 'Open Link in New Tab',
        click: () => this.deps.tabManager.openTab(params.linkURL),
      }));
    }
    menu.append(new MenuItem({
      label: 'Copy Link Address',
      click: () => clipboard.writeText(params.linkURL),
    }));
    if (params.linkText) {
      menu.append(new MenuItem({
        label: 'Copy Link Text',
        click: () => clipboard.writeText(params.linkText),
      }));
    }

    this.addSeparator(menu);

    if (isSafeURL(params.linkURL)) {
      menu.append(new MenuItem({
        label: 'Save Link As...',
        click: () => { if (!wc.isDestroyed()) wc.downloadURL(params.linkURL); },
      }));
    }
    menu.append(new MenuItem({
      label: 'Bookmark Link',
      click: () => {
        this.deps.bookmarkManager.add(params.linkText || params.linkURL, params.linkURL);
      },
    }));
  }

  // ═══ Phase 2: Image Items ═══

  /** Open Image in New Tab, Save/Copy Image, Copy Image Address */
  private addImageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (params.mediaType !== 'image') return;

    this.addSeparator(menu);

    if (isSafeURL(params.srcURL)) {
      menu.append(new MenuItem({
        label: 'Open Image in New Tab',
        click: () => this.deps.tabManager.openTab(params.srcURL),
      }));
      menu.append(new MenuItem({
        label: 'Save Image As...',
        click: () => { if (!wc.isDestroyed()) wc.downloadURL(params.srcURL); },
      }));
    }
    menu.append(new MenuItem({
      label: 'Copy Image',
      click: () => { if (!wc.isDestroyed()) wc.copyImageAt(params.x, params.y); },
    }));
    menu.append(new MenuItem({
      label: 'Copy Image Address',
      click: () => clipboard.writeText(params.srcURL),
    }));
  }

  // ═══ Phase 2: Selection Items ═══

  /** Copy selection, Search Google for selection */
  private addSelectionItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (!params.selectionText) return;

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      click: () => { if (!wc.isDestroyed()) wc.copy(); },
    }));

    const truncated = params.selectionText.length > 30
      ? params.selectionText.substring(0, 30) + '...'
      : params.selectionText;
    menu.append(new MenuItem({
      label: `Search ${SEARCH_ENGINE.name} for "${truncated}"`,
      click: () => {
        const query = encodeURIComponent(params.selectionText);
        void this.deps.tabManager.openTab(`${SEARCH_ENGINE.url}${query}`);
      },
    }));
  }

  // ═══ Phase 3: Editable Field Items ═══

  /** Undo, Redo, Cut, Copy, Paste, Paste Plain Text, Delete, Select All */
  private addEditableItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    const guard = (fn: () => void) => () => { if (!wc.isDestroyed()) fn(); };

    menu.append(new MenuItem({
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      enabled: params.editFlags.canUndo,
      click: guard(() => wc.undo()),
    }));
    menu.append(new MenuItem({
      label: 'Redo',
      accelerator: 'CmdOrCtrl+Shift+Z',
      enabled: params.editFlags.canRedo,
      click: guard(() => wc.redo()),
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      enabled: params.editFlags.canCut,
      click: guard(() => wc.cut()),
    }));
    menu.append(new MenuItem({
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      enabled: params.editFlags.canCopy,
      click: guard(() => wc.copy()),
    }));
    menu.append(new MenuItem({
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      enabled: params.editFlags.canPaste,
      click: guard(() => wc.paste()),
    }));
    menu.append(new MenuItem({
      label: 'Paste as Plain Text',
      accelerator: 'CmdOrCtrl+Shift+V',
      enabled: params.editFlags.canPaste,
      click: guard(() => wc.pasteAndMatchStyle()),
    }));
    menu.append(new MenuItem({
      label: 'Delete',
      enabled: params.editFlags.canDelete,
      click: guard(() => wc.delete()),
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Select All',
      accelerator: 'CmdOrCtrl+A',
      enabled: params.editFlags.canSelectAll,
      click: guard(() => wc.selectAll()),
    }));

    // Password Manager Autofill
    if (getPasswordManager().isVaultUnlocked) {
      this.addSeparator(menu);
      const url = new URL(params.pageURL || wc.getURL());
      const domain = url.hostname;

      const identities = getPasswordManager().getIdentitiesForDomain(domain);

      if (identities.length > 0) {
        const vaultMenu = new Menu();
        for (const id of identities) {
          vaultMenu.append(new MenuItem({
            label: id.username,
            click: guard(() => {
              // Note: robust autofill requires a content script.
              // For a simple editable context menu, we can just insert the password text where the cursor is,
              // or send an IPC message to fill the whole form if we detect username/password fields.
              // For now, we paste the password.
              if (id.payload && typeof id.payload.password === 'string') {
                clipboard.writeText(id.payload.password);
                wc.paste();
              }
            })
          }));
        }

        menu.append(new MenuItem({
          label: 'Autofill Password',
          submenu: vaultMenu
        }));
      }

      menu.append(new MenuItem({
        label: 'Generate New Password',
        click: guard(() => {
          const { PasswordCrypto } = require('../security/crypto');
          const pswd = PasswordCrypto.generatePassword(24);
          clipboard.writeText(pswd);
          wc.paste();
          // Optionally notify user
        })
      }));
    }
  }

  /** Search Google item — used standalone for editable fields with selection */
  private addSearchItem(menu: Menu, params: ContextMenuParams): void {
    if (!params.selectionText) return;

    const truncated = params.selectionText.length > 30
      ? params.selectionText.substring(0, 30) + '...'
      : params.selectionText;
    menu.append(new MenuItem({
      label: `Search ${SEARCH_ENGINE.name} for "${truncated}"`,
      click: () => {
        const query = encodeURIComponent(params.selectionText);
        void this.deps.tabManager.openTab(`${SEARCH_ENGINE.url}${query}`);
      },
    }));
  }

  // ═══ Phase 1: Navigation Items ═══

  /** Back, Forward, Reload — always visible */
  private addNavigationItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    menu.append(new MenuItem({
      label: 'Back',
      accelerator: 'Alt+Left',
      enabled: wc.navigationHistory.canGoBack(),
      click: () => { if (!wc.isDestroyed()) wc.navigationHistory.goBack(); },
    }));
    menu.append(new MenuItem({
      label: 'Forward',
      accelerator: 'Alt+Right',
      enabled: wc.navigationHistory.canGoForward(),
      click: () => { if (!wc.isDestroyed()) wc.navigationHistory.goForward(); },
    }));
    menu.append(new MenuItem({
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: () => { if (!wc.isDestroyed()) wc.reload(); },
    }));
  }

  // ═══ Phase 1: Tool Items ═══

  /** Save As, Print, View Page Source, Inspect Element */
  private addToolItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    menu.append(new MenuItem({
      label: 'Save As...',
      accelerator: 'CmdOrCtrl+S',
      click: () => { this.handleSaveAs(wc).catch(e => log.warn('Save As failed:', e.message)); },
    }));
    menu.append(new MenuItem({
      label: 'Print...',
      accelerator: 'CmdOrCtrl+P',
      click: () => { if (!wc.isDestroyed()) wc.print(); },
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'View Page Source',
      accelerator: 'CmdOrCtrl+U',
      click: () => {
        if (wc.isDestroyed()) return;
        const url = wc.getURL();
        void this.deps.tabManager.openTab(`view-source:${url}`);
      },
    }));
    menu.append(new MenuItem({
      label: 'Inspect Element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => { if (!wc.isDestroyed()) wc.inspectElement(params.x, params.y); },
    }));
  }

  /** Handle Save As via system dialog + savePage */
  private async handleSaveAs(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return;
    const title = wc.getTitle() || 'page';
    const safeName = title.replace(/[^a-z0-9_\- ]/gi, '').substring(0, 60) || 'page';

    const result = await dialog.showSaveDialog(this.deps.win, {
      defaultPath: `${safeName}.html`,
      filters: [
        { name: 'Web Page, Complete', extensions: ['html'] },
        { name: 'Web Page, HTML Only', extensions: ['htm'] },
      ],
    });

    if (!result.canceled && result.filePath) {
      if (wc.isDestroyed()) return;
      const saveType = result.filePath.endsWith('.htm') ? 'HTMLOnly' : 'HTMLComplete';
      await wc.savePage(result.filePath, saveType as 'HTMLComplete' | 'HTMLOnly').catch((err) => {
        log.warn('Save page failed:', err.message);
      });
    }
  }

  // ═══ Phase 5: Tandem-specific Items ═══

  /** Wingman AI integration, Quick Bookmark, Screenshot */
  private addTandemItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    this.addSeparator(menu);

    // Wingman AI items
    if (params.selectionText) {
      // eslint-disable-next-line no-control-regex
      const safeText = params.selectionText.replace(/[\u0000-\u001f]/g, ' ').trim();
      const truncatedForPrompt = safeText.length > 500 ? safeText.substring(0, 500) + '...' : safeText;
      menu.append(new MenuItem({
        label: 'Ask Wingman about Selection',
        click: () => {
          this.deps.panelManager.togglePanel(true);
          this.deps.win.webContents.send(IpcChannels.WINGMAN_CHAT_INJECT,
            `What can you tell me about this: "${truncatedForPrompt}"`
          );
        },
      }));
    }

    if (params.mediaType === 'image' && params.srcURL) {
      // eslint-disable-next-line no-control-regex
      const safeSrc = params.srcURL.replace(/[\u0000-\u001f]/g, '').trim();
      menu.append(new MenuItem({
        label: 'Ask Wingman about this Image',
        click: () => {
          this.deps.panelManager.togglePanel(true);
          this.deps.win.webContents.send(IpcChannels.WINGMAN_CHAT_INJECT,
            `Analyze this image: ${safeSrc}`
          );
        },
      }));
    }

    menu.append(new MenuItem({
      label: 'Summarize Page with Wingman',
      click: async () => {
        if (wc.isDestroyed()) return;
        this.deps.panelManager.togglePanel(true);

        let excerpt = '';
        try {
          excerpt = await wc.executeJavaScript(`
            (() => {
              const title = document.title || '';
              const body = document.body?.innerText || '';
              const trimmed = body.substring(0, 2000);
              return title + '\\n\\n' + trimmed;
            })()
          `);
        } catch { /* page may have navigated away */ }

        const prompt = excerpt
          ? 'Please summarize this page:\\n\\n' + excerpt
          : 'Please summarize the current page for me.';

        this.deps.win.webContents.send(IpcChannels.WINGMAN_CHAT_INJECT, prompt);
      },
    }));

    menu.append(new MenuItem({
      label: 'Screenshot this Page',
      click: () => {
        this.deps.win.webContents.send(IpcChannels.SHORTCUT, 'quick-screenshot');
      },
    }));

    this.addSeparator(menu);

    // Quick Bookmark toggle — re-read state at click time to avoid stale toggle
    const pageUrl = wc.getURL();
    const pageTitle = wc.getTitle();
    const isBookmarkedNow = this.deps.bookmarkManager.isBookmarked(pageUrl);
    menu.append(new MenuItem({
      label: isBookmarkedNow ? 'Remove Bookmark' : 'Bookmark this Page',
      accelerator: 'CmdOrCtrl+D',
      click: () => {
        const currentlyBookmarked = this.deps.bookmarkManager.isBookmarked(pageUrl);
        if (currentlyBookmarked) {
          const existing = this.deps.bookmarkManager.findByUrl(pageUrl);
          if (existing) this.deps.bookmarkManager.remove(existing.id);
        } else {
          this.deps.bookmarkManager.add(pageTitle || pageUrl, pageUrl);
        }
        // Notify renderer to update bookmark star
        this.deps.win.webContents.send(IpcChannels.BOOKMARK_STATUS_CHANGED, {
          url: pageUrl,
          bookmarked: !currentlyBookmarked,
        });
      },
    }));
  }

  // ═══ Phase 6: Media Items (Video/Audio) ═══

  /** Open/Save/Copy address for video and audio elements */
  private addMediaItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (params.mediaType !== 'video' && params.mediaType !== 'audio') return;

    this.addSeparator(menu);

    const label = params.mediaType === 'video' ? 'Video' : 'Audio';
    if (isSafeURL(params.srcURL)) {
      menu.append(new MenuItem({
        label: `Open ${label} in New Tab`,
        click: () => this.deps.tabManager.openTab(params.srcURL),
      }));
      menu.append(new MenuItem({
        label: `Save ${label} As...`,
        click: () => { if (!wc.isDestroyed()) wc.downloadURL(params.srcURL); },
      }));
    }
    menu.append(new MenuItem({
      label: `Copy ${label} Address`,
      click: () => clipboard.writeText(params.srcURL),
    }));
  }

  // ═══ Phase 6: Internal Page Items ═══

  /** Minimal context menu for shell pages (newtab, settings, bookmarks, help) */
  private addInternalPageItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    if (params.isEditable) {
      this.addEditableItems(menu, params, wc);
    } else if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => { if (!wc.isDestroyed()) wc.copy(); },
      }));
    }

    if (params.linkURL && isSafeURL(params.linkURL)) {
      this.addSeparator(menu);
      menu.append(new MenuItem({
        label: 'Open Link in New Tab',
        click: () => this.deps.tabManager.openTab(params.linkURL),
      }));
      menu.append(new MenuItem({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      }));

      if (wc.getURL().includes('newtab.html')) {
        const isQuickLink = this.deps.configManager.isQuickLink(params.linkURL);
        menu.append(new MenuItem({
          label: isQuickLink ? 'Remove from Quick Links' : 'Add to Quick Links',
          click: () => {
            if (isQuickLink) {
              this.deps.configManager.removeQuickLink(params.linkURL);
            } else {
              this.deps.configManager.addQuickLink(params.linkText || this.getQuickLinkLabel(params.linkURL), params.linkURL);
            }
            if (!wc.isDestroyed()) {
              void wc.executeJavaScript(`
                window.dispatchEvent(new CustomEvent('tandem-quick-links-changed'));
              `).catch(() => {});
            }
          },
        }));
      }
    }

    this.addSeparator(menu);
    menu.append(new MenuItem({
      label: 'Inspect Element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => { if (!wc.isDestroyed()) wc.inspectElement(params.x, params.y); },
    }));
  }

  // ═══ Phase 4: Tab Context Menu ═══

  /** Build context menu for right-clicking on a tab in the tab bar */
  buildTabContextMenu(tabId: string): Menu {
    const menu = new Menu();
    const allTabs = this.deps.tabManager.listTabs();
    const tab = allTabs.find(t => t.id === tabId);
    if (!tab) return menu;

    const tabIndex = allTabs.indexOf(tab);

    menu.append(new MenuItem({
      label: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      click: () => this.deps.tabManager.openTab(),
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Reload Tab',
      click: () => {
        const wc = webContents.fromId(tab.webContentsId);
        if (wc && !wc.isDestroyed()) wc.reload();
      },
    }));
    const dupWc = webContents.fromId(tab.webContentsId);
    const dupUrl = (dupWc && !dupWc.isDestroyed()) ? dupWc.getURL() : tab.url;
    menu.append(new MenuItem({
      label: 'Duplicate Tab',
      enabled: !!(dupUrl && dupUrl !== 'about:blank'),
      click: () => {
        const wc = webContents.fromId(tab.webContentsId);
        const currentUrl = (wc && !wc.isDestroyed()) ? wc.getURL() : tab.url;
        void this.deps.tabManager.openTab(currentUrl);
      },
    }));
    if (dupUrl && /^https?:\/\//i.test(dupUrl)) {
      const isQuickLink = this.deps.configManager.isQuickLink(dupUrl);
      menu.append(new MenuItem({
        label: isQuickLink ? 'Remove from Quick Links' : 'Add to Quick Links',
        click: () => {
          if (isQuickLink) {
            this.deps.configManager.removeQuickLink(dupUrl);
          } else {
            this.deps.configManager.addQuickLink(tab.title || this.getQuickLinkLabel(dupUrl), dupUrl);
          }
        },
      }));
    }
    menu.append(new MenuItem({
      label: tab.pinned ? 'Unpin Tab' : 'Pin Tab',
      click: () => {
        const currentTab = this.deps.tabManager.getTab(tabId);
        if (currentTab?.pinned) {
          this.deps.tabManager.unpinTab(tabId);
        } else {
          this.deps.tabManager.pinTab(tabId);
        }
      },
    }));
    const tabWc = webContents.fromId(tab.webContentsId);
    const isMuted = tabWc && !tabWc.isDestroyed() ? tabWc.isAudioMuted() : false;
    menu.append(new MenuItem({
      label: isMuted ? 'Unmute Tab' : 'Mute Tab',
      click: () => {
        // Re-read mute state at click time to avoid stale toggle
        const wc = webContents.fromId(tab.webContentsId);
        if (wc && !wc.isDestroyed()) wc.setAudioMuted(!wc.isAudioMuted());
      },
    }));
    const currentSource = this.deps.tabManager.getTabSource(tabId);
    const isAgentControlled = currentSource !== null && currentSource !== 'user';
    menu.append(new MenuItem({
      label: isAgentControlled
        ? `Take back from ${currentSource === 'wingman' ? 'Wingman' : currentSource}`
        : 'Let Wingman handle this tab',
      click: () => {
        const nextSource = this.deps.tabManager.getTabSource(tabId);
        const newSource = nextSource !== null && nextSource !== 'user' ? 'user' : 'wingman';
        this.deps.tabManager.setTabSource(tabId, newSource);
      },
    }));

    // Emoji badge
    const currentEmoji = this.deps.tabManager.getEmoji(tabId);
    const popularEmojis = [
      '🔥', '⭐', '💡', '🚀', '✅', '❌', '⚠️', '🎯', '💬', '📌',
      '📚', '🧪', '🔧', '🎨', '📊', '🔒', '👀', '💰', '🎵', '❤️',
      '🏠', '📧', '🛒', '📝', '🗂️', '🌍', '☁️', '📸', '🎮', '🤖',
      '🧠', '🔍', '📅', '🎁', '🏷️', '⏰', '🔔', '💻', '📱', '🎬',
      '🍕', '☕', '🌟', '💎', '🦊', '🐛', '🏗️', '📦', '🔗', '🏆',
    ];

    const emojiSubmenu = Menu.buildFromTemplate(
      popularEmojis.map(emoji => ({
        label: emoji,
        click: () => this.deps.tabManager.setEmoji(tabId, emoji),
      }))
    );

    if (currentEmoji) {
      emojiSubmenu.insert(0, new MenuItem({ type: 'separator' }));
      emojiSubmenu.insert(0, new MenuItem({
        label: 'Remove Emoji',
        click: () => this.deps.tabManager.clearEmoji(tabId),
      }));
    }

    menu.append(new MenuItem({
      label: currentEmoji ? `Emoji: ${currentEmoji}` : 'Set Emoji...',
      submenu: emojiSubmenu,
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Close Tab',
      accelerator: 'CmdOrCtrl+W',
      click: () => this.deps.tabManager.closeTab(tabId),
    }));
    menu.append(new MenuItem({
      label: 'Close Other Tabs',
      enabled: allTabs.length > 1,
      click: async () => {
        for (const t of allTabs.filter(t => t.id !== tabId)) {
          try { await this.deps.tabManager.closeTab(t.id); } catch { /* tab may already be closed */ }
        }
      },
    }));
    menu.append(new MenuItem({
      label: 'Close Tabs to Right',
      enabled: tabIndex < allTabs.length - 1,
      click: async () => {
        for (const t of allTabs.slice(tabIndex + 1)) {
          try { await this.deps.tabManager.closeTab(t.id); } catch { /* tab may already be closed */ }
        }
      },
    }));

    this.addSeparator(menu);

    menu.append(new MenuItem({
      label: 'Reopen Closed Tab',
      accelerator: 'CmdOrCtrl+Shift+T',
      enabled: this.deps.tabManager.hasClosedTabs(),
      click: () => this.deps.tabManager.reopenClosedTab(),
    }));

    return menu;
  }

  // ═══ Phase 7: Pinboard Items ═══

  /** Add "Save to Pinboard" items based on context. Shows submenu with available boards. */
  private addPinboardItems(menu: Menu, params: ContextMenuParams, wc: WebContents): void {
    const boards = this.deps.pinboardManager.listBoards();
    if (boards.length === 0) return;

    this.addSeparator(menu);

    const notifyAdded = (boardId: string) => {
      this.deps.win.webContents.send(IpcChannels.PINBOARD_ITEM_ADDED, boardId);
    };

    // Save page to Pinboard (always available)
    menu.append(new MenuItem({
      label: 'Save Page to Pinboard',
      submenu: boards.map(board => ({
        label: `${board.emoji} ${board.name}`,
        click: async () => {
          await this.deps.pinboardManager.addItem(board.id, {
            type: 'link',
            url: params.pageURL,
            title: wc.getTitle(),
            sourceUrl: params.pageURL,
          });
          notifyAdded(board.id);
        }
      }))
    }));

    // Save link to Pinboard
    if (params.linkURL && isSafeURL(params.linkURL)) {
      menu.append(new MenuItem({
        label: 'Save Link to Pinboard',
        submenu: boards.map(board => ({
          label: `${board.emoji} ${board.name}`,
          click: async () => {
            await this.deps.pinboardManager.addItem(board.id, {
              type: 'link',
              url: params.linkURL,
              title: params.linkText || params.linkURL,
              sourceUrl: params.pageURL,
            });
            notifyAdded(board.id);
          }
        }))
      }));
    }

    // Save image to Pinboard
    if (params.mediaType === 'image' && params.srcURL) {
      menu.append(new MenuItem({
        label: 'Save Image to Pinboard',
        submenu: boards.map(board => ({
          label: `${board.emoji} ${board.name}`,
          click: async () => {
            await this.deps.pinboardManager.addItem(board.id, {
              type: 'image',
              url: params.srcURL,
              sourceUrl: params.pageURL,
            });
            notifyAdded(board.id);
          }
        }))
      }));
    }

    // Save selection to Pinboard
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Save Selection to Pinboard',
        submenu: boards.map(board => ({
          label: `${board.emoji} ${board.name}`,
          click: async () => {
            await this.deps.pinboardManager.addItem(board.id, {
              type: 'quote',
              content: params.selectionText,
              sourceUrl: params.pageURL,
            });
            notifyAdded(board.id);
          }
        }))
      }));
    }
  }

  /** Append a separator only if the menu already has items (avoids leading separators) */
  private addSeparator(menu: Menu): void {
    if (menu.items.length > 0 && menu.items[menu.items.length - 1].type !== 'separator') {
      menu.append(new MenuItem({ type: 'separator' }));
    }
  }

  private getQuickLinkLabel(url: string): string {
    try {
      const { hostname } = new URL(url);
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}
