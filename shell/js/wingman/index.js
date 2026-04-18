/**
 * Wingman module entry point — all wingman UI + alerts + chat.
 *
 * Loaded from: shell/index.html as <script type="module" src="js/wingman/index.js">
 * window exports (set across the family): chatRouter, dismissAlert,
 *   openWingmanPanel, toggleWingmanPanel, updatePanelLayout.
 *   This file sets: chatRouter (from ./chat.js's initChat() return value).
 *   dismissAlert is set by ./alerts.js.
 *   openWingmanPanel, toggleWingmanPanel, updatePanelLayout are set by ./panel.js.
 */
    import { initAlerts } from './alerts.js';
    import { initScreenshot, captureScreenshotMode } from './screenshot.js';
    import { initPanel } from './panel.js';
    import { initChat } from './chat.js';

    const renderer = window.__tandemRenderer;
    if (!renderer) {
      console.error('[wingman] Missing renderer bridge');
      throw new Error('[wingman] Missing renderer bridge');
    }

    initAlerts(renderer);
    initScreenshot();

    function getTabs() {
      return renderer.getTabs();
    }

    // ═══════════════════════════════════════════════
    // Wingman Panel
    // ═══════════════════════════════════════════════

    // Forward declarations — reassigned below after initPanel(). The
    // `isWingmanPanelOpen` sentinel returns false so any accidental
    // pre-init call doesn't throw a TDZ ReferenceError.
    let isWingmanPanelOpen = () => false;
    let panelToggleBtn = null;
    let wingmanBadge = null;
    let wingmanBadgePressTimer = null;

    const activityEl = document.getElementById('activity-feed');
    const handoffListEl = document.getElementById('handoff-list');
    const handoffEmptyEl = document.getElementById('handoff-empty');
    const handoffCountEl = document.getElementById('handoff-count');
    const activityTabButton = document.querySelector('[data-panel-tab="activity"]');
    const openHandoffs = new Map();
    const unacknowledgedHandoffs = new Set();
    const HANDOFF_ATTENTION_ESCALATION_MS = 12_000;
    let handoffAttentionEscalationTimer = null;
    let handoffAttentionEscalated = false;

    function formatHandoffStatus(status) {
      const labels = {
        needs_human: 'Needs Human',
        blocked: 'Blocked',
        waiting_approval: 'Waiting Approval',
        ready_to_resume: 'Ready To Resume',
        completed_review: 'Completed Review',
        resolved: 'Resolved',
      };
      return labels[status] || status;
    }

    function formatHandoffTime(timestamp) {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString('nl-BE', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    function getHandoffAttentionLevel(handoff) {
      if (!handoff || !handoff.open || handoff.status === 'resolved') return 'none';
      if (typeof handoff.attentionLevel === 'string') return handoff.attentionLevel;
      if (handoff.status === 'blocked' || handoff.status === 'waiting_approval') return 'urgent';
      if (handoff.status === 'needs_human') return 'action';
      if (handoff.status === 'ready_to_resume' || handoff.status === 'completed_review') return 'review';
      return 'action';
    }

    function getHandoffAttentionRank(handoff) {
      const level = getHandoffAttentionLevel(handoff);
      return level === 'urgent' ? 3 : level === 'action' ? 2 : level === 'review' ? 1 : 0;
    }

    function getSortedOpenHandoffs() {
      return Array.from(openHandoffs.values())
        .sort((a, b) => {
          const rankDelta = getHandoffAttentionRank(b) - getHandoffAttentionRank(a);
          if (rankDelta !== 0) return rankDelta;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
    }

    function clearHandoffAttentionTimer() {
      if (handoffAttentionEscalationTimer) {
        clearTimeout(handoffAttentionEscalationTimer);
        handoffAttentionEscalationTimer = null;
      }
    }

    function updateActivityTabBadge() {
      const count = openHandoffs.size;
      if (handoffCountEl) {
        handoffCountEl.textContent = String(count);
      }
      if (activityTabButton) {
        activityTabButton.textContent = count > 0 ? `Activity (${count})` : 'Activity';
      }
    }

    function updateWingmanAttentionUI() {
      const count = openHandoffs.size;
      const isOpen = isWingmanPanelOpen();
      const topHandoff = getSortedOpenHandoffs()[0] || null;
      const topLevel = topHandoff ? getHandoffAttentionLevel(topHandoff) : 'none';
      const closedState = count === 0
        ? 'idle'
        : unacknowledgedHandoffs.size > 0
          ? (handoffAttentionEscalated ? 'escalated' : 'active')
          : 'pending';

      const baseTitle = count === 0
        ? null
        : count === 1
          ? `1 open handoff${topHandoff?.title ? `: ${topHandoff.title}` : ''}`
          : `${count} open handoffs${topHandoff?.title ? ` — ${topHandoff.title}` : ''}`;

      for (const element of [wingmanBadge, panelToggleBtn]) {
        if (!element) continue;
        element.classList.remove(
          'has-open-handoffs',
          'attention-pending',
          'attention-active',
          'attention-escalated',
          'attention-level-review',
          'attention-level-action',
          'attention-level-urgent',
        );
        if (count > 0 && !isOpen) {
          element.classList.add('has-open-handoffs', `attention-${closedState}`, `attention-level-${topLevel}`);
          element.dataset.handoffCount = String(count);
        } else {
          delete element.dataset.handoffCount;
        }
      }

      const badgeTitle = count === 0
        ? 'Right-click for settings'
        : isOpen
          ? `${baseTitle}. Wingman panel is open.`
          : closedState === 'escalated'
            ? `${baseTitle}. Wingman is still waiting for you.`
            : closedState === 'active'
              ? `${baseTitle}. Wingman needs you.`
              : `${baseTitle}. Open when you are ready.`;
      wingmanBadge.title = badgeTitle;
      if (panelToggleBtn) {
        panelToggleBtn.title = count === 0 ? 'Toggle Wingman panel' : badgeTitle;
      }
    }

    function scheduleHandoffAttentionEscalation() {
      clearHandoffAttentionTimer();

      if (isWingmanPanelOpen() || unacknowledgedHandoffs.size === 0) {
        handoffAttentionEscalated = false;
        updateWingmanAttentionUI();
        return;
      }

      const tracked = Array.from(unacknowledgedHandoffs)
        .map(id => openHandoffs.get(id))
        .filter(Boolean);

      if (tracked.length === 0) {
        handoffAttentionEscalated = false;
        updateWingmanAttentionUI();
        return;
      }

      const now = Date.now();
      const oldestAge = tracked.reduce((maxAge, handoff) => {
        const age = Math.max(0, now - (handoff.updatedAt || handoff.createdAt || now));
        return Math.max(maxAge, age);
      }, 0);
      const remaining = HANDOFF_ATTENTION_ESCALATION_MS - oldestAge;

      if (remaining <= 0) {
        handoffAttentionEscalated = true;
        updateWingmanAttentionUI();
        return;
      }

      handoffAttentionEscalated = false;
      updateWingmanAttentionUI();
      handoffAttentionEscalationTimer = setTimeout(() => {
        handoffAttentionEscalated = true;
        updateWingmanAttentionUI();
        scheduleHandoffAttentionEscalation();
      }, remaining);
    }

    function acknowledgeVisibleHandoffs() {
      for (const handoffId of openHandoffs.keys()) {
        unacknowledgedHandoffs.delete(handoffId);
      }
      handoffAttentionEscalated = false;
      scheduleHandoffAttentionEscalation();
    }

    ({ isWingmanPanelOpen, panelToggleBtn, wingmanBadge } = initPanel({
      hooks: {
        getPreferredTabOnOpen: () => openHandoffs.size > 0 ? 'activity' : 'chat',
        onPanelOpened: () => acknowledgeVisibleHandoffs(),
        onPanelClosed: () => scheduleHandoffAttentionEscalation(),
      },
    }));

    // ═══════════════════════════════════════════════
    // Wingman badge → right-click or long-press → open settings.
    // Registered after initPanel so `wingmanBadge` is resolved; the
    // badge single-click (bound inside initPanel) still fires correctly
    // because browser event order on a physical click is
    // mousedown → mouseup → click, not listener-registration order.
    wingmanBadge.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.openSettings?.();
    });
    wingmanBadge.addEventListener('mousedown', () => {
      wingmanBadgePressTimer = setTimeout(() => window.openSettings?.(), 600);
    });
    wingmanBadge.addEventListener('mouseup', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.addEventListener('mouseleave', () => { clearTimeout(wingmanBadgePressTimer); });
    wingmanBadge.style.cursor = 'pointer';
    wingmanBadge.title = 'Right-click for settings';

    if (window.tandem) {
      async function activateHandoff(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/activate`, { method: 'POST' });
      }

      async function updateHandoffStatus(handoffId, payload) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      async function resolveHandoff(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/resolve`, { method: 'POST' });
      }

      async function markHandoffReady(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/ready`, { method: 'POST' });
      }

      async function resumeHandoff(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/resume`, { method: 'POST' });
      }

      async function approveHandoff(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/approve`, { method: 'POST' });
      }

      async function rejectHandoff(handoffId) {
        await fetch(`http://localhost:8765/handoffs/${handoffId}/reject`, { method: 'POST' });
      }

      async function hydrateHandoff(handoff) {
        if (!handoff || !handoff.id) return handoff;
        if (handoff.workspaceName || handoff.tabTitle || handoff.tabUrl) return handoff;
        try {
          const response = await fetch(`http://localhost:8765/handoffs/${handoff.id}`);
          if (!response.ok) return handoff;
          return await response.json();
        } catch {
          return handoff;
        }
      }

      function renderHandoffs() {
        if (!handoffListEl || !handoffEmptyEl) return;
        handoffListEl.innerHTML = '';

        const handoffs = getSortedOpenHandoffs();

        handoffEmptyEl.style.display = handoffs.length === 0 ? 'block' : 'none';

        for (const handoff of handoffs) {
          const card = document.createElement('div');
          card.className = `handoff-card status-${handoff.status}`;
          const meta = [];
          if (handoff.reason) meta.push(`<span class="handoff-pill">Reason: ${escapeHtml(handoff.reason)}</span>`);
          if (handoff.workspaceName || handoff.workspaceId) meta.push(`<span class="handoff-pill">Workspace: ${escapeHtml(handoff.workspaceName || handoff.workspaceId)}</span>`);
          if (handoff.tabTitle || handoff.tabId) meta.push(`<span class="handoff-pill">Tab: ${escapeHtml(handoff.tabTitle || handoff.tabId)}</span>`);
          if (handoff.source || handoff.agentId) meta.push(`<span class="handoff-pill">Source: ${escapeHtml(handoff.source || handoff.agentId)}</span>`);
          if (handoff.actionLabel) meta.push(`<span class="handoff-pill">${escapeHtml(handoff.actionLabel)}</span>`);

          const actionButtons = ['<button class="primary" data-action="open">Open Context</button>'];
          if (handoff.status === 'waiting_approval') {
            actionButtons.push('<button data-action="approve">Approve</button>');
            actionButtons.push('<button data-action="reject">Reject</button>');
          } else if (handoff.status === 'ready_to_resume') {
            actionButtons.push('<button data-action="resume">Resume Agent</button>');
          } else if (handoff.status === 'needs_human' || handoff.status === 'blocked') {
            actionButtons.push('<button data-action="ready">Mark Ready</button>');
          }
          actionButtons.push(`<button data-action="resolve">${handoff.status === 'completed_review' ? 'Mark Reviewed' : 'Resolve'}</button>`);

          card.innerHTML = `
            <div class="handoff-topline">
              <span class="handoff-status">${escapeHtml(formatHandoffStatus(handoff.status))}</span>
              <span class="handoff-time">${escapeHtml(formatHandoffTime(handoff.updatedAt))}</span>
            </div>
            <div class="handoff-title">${escapeHtml(handoff.title || 'Untitled handoff')}</div>
            <div class="handoff-body">${escapeHtml(handoff.body || '')}</div>
            <div class="handoff-meta">${meta.join('')}</div>
            <div class="handoff-actions">
              ${actionButtons.join('')}
            </div>
          `;

          card.querySelector('[data-action="open"]').addEventListener('click', async () => {
            try {
              await activateHandoff(handoff.id);
            } catch (e) {
              console.error('activateHandoff failed:', e);
            }
          });

          const readyButton = card.querySelector('[data-action="ready"]');
          if (readyButton) {
            readyButton.addEventListener('click', async () => {
              try {
                await markHandoffReady(handoff.id);
              } catch (e) {
                console.error('markHandoffReady failed:', e);
              }
            });
          }

          const resumeButton = card.querySelector('[data-action="resume"]');
          if (resumeButton) {
            resumeButton.addEventListener('click', async () => {
              try {
                await resumeHandoff(handoff.id);
              } catch (e) {
                console.error('resumeHandoff failed:', e);
              }
            });
          }

          const approveButton = card.querySelector('[data-action="approve"]');
          if (approveButton) {
            approveButton.addEventListener('click', async () => {
              try {
                await approveHandoff(handoff.id);
              } catch (e) {
                console.error('approveHandoff failed:', e);
              }
            });
          }

          const rejectButton = card.querySelector('[data-action="reject"]');
          if (rejectButton) {
            rejectButton.addEventListener('click', async () => {
              try {
                await rejectHandoff(handoff.id);
              } catch (e) {
                console.error('rejectHandoff failed:', e);
              }
            });
          }

          card.querySelector('[data-action="resolve"]').addEventListener('click', async () => {
            try {
              await resolveHandoff(handoff.id);
            } catch (e) {
              console.error('resolveHandoff failed:', e);
            }
          });

          handoffListEl.appendChild(card);
        }

        updateActivityTabBadge();
        updateWingmanAttentionUI();
      }

      async function applyHandoffUpdate(handoff) {
        if (!handoff || !handoff.id) return;
        const hydrated = await hydrateHandoff(handoff);
        if (hydrated.open) {
          openHandoffs.set(hydrated.id, hydrated);
          if (isWingmanPanelOpen()) {
            unacknowledgedHandoffs.delete(hydrated.id);
          } else {
            unacknowledgedHandoffs.add(hydrated.id);
          }
        } else {
          openHandoffs.delete(hydrated.id);
          unacknowledgedHandoffs.delete(hydrated.id);
        }
        renderHandoffs();
        scheduleHandoffAttentionEscalation();
      }

      async function loadOpenHandoffs() {
        try {
          const response = await fetch('http://localhost:8765/handoffs?openOnly=true');
          const data = await response.json();
          openHandoffs.clear();
          unacknowledgedHandoffs.clear();
          for (const handoff of data.handoffs || []) {
            if (handoff.open) {
              openHandoffs.set(handoff.id, handoff);
            }
          }
          renderHandoffs();
          scheduleHandoffAttentionEscalation();
        } catch (e) {
          console.error('loadOpenHandoffs failed:', e);
        }
      }

      void loadOpenHandoffs();

      window.tandem.onActivityEvent((event) => {
        if (!activityEl) return;
        const icons = { navigate: '🧭', click: '👆', scroll: '📜', input: '⌨️', 'tab-switch': '🔀', 'tab-open': '➕', 'tab-close': '✖️', handoff: '🤝' };
        const icon = icons[event.type] || '•';
        const time = new Date(event.timestamp).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let text = event.type;
        if (event.type === 'handoff' && event.data.title) text = `handoff: ${event.data.title}${event.data.status ? ` (${event.data.status})` : ''}`;
        else if (event.data.url) text = `${event.type}: ${event.data.url}`;
        else if (event.data.selector) text = `${event.type}: ${event.data.selector}`;
        else if (event.data.title) text = `${event.type}: ${event.data.title}`;

        const source = typeof event.data.source === 'string' && event.data.source.trim()
          ? event.data.source.trim()
          : 'user';
        const sourceEmoji = source === 'user' ? '👤' : '🤖';
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `<span class="a-icon">${icon}</span><span class="a-source ${source}">${sourceEmoji}</span><span class="a-text">${escapeHtml(text)}</span><span class="a-time">${time}</span>`;
        activityEl.appendChild(item);
        activityEl.scrollTop = activityEl.scrollHeight;
        // Keep max 200 items
        while (activityEl.children.length > 200) activityEl.removeChild(activityEl.firstChild);
      });

      if (window.tandem.onHandoffUpdated) {
        window.tandem.onHandoffUpdated((data) => {
          void applyHandoffUpdate(data.handoff);
        });
      }

      // Tab source changes (🧀/👤 indicator) + AI tab visual border
      window.tandem.onTabSourceChanged((data) => {
        for (const [id, entry] of getTabs()) {
          if (id === data.tabId) {
            const sourceEl = entry.tabEl.querySelector('.tab-source');
            if (sourceEl) {
              if (data.source && data.source !== 'user') {
                sourceEl.textContent = '🤖';
                sourceEl.title = `${data.source} controls this tab — click to take over`;
                sourceEl.style.display = '';
              } else {
                sourceEl.textContent = '';
                sourceEl.title = '';
                sourceEl.style.display = 'none';
              }
            }
            // Visual indicator: purple bottom border for AI tabs
            if (data.source && data.source !== 'user') {
              entry.tabEl.style.borderBottom = '2px solid #7c3aed';
            } else {
              entry.tabEl.style.borderBottom = '';
            }
          }
        }
      });

      // User claims an AI tab by focusing it (click on tab header)
      // The click handler already calls focusTab, we hook into it to also claim
      const origTabClickHandler = (tabId) => {
        // Check if this is an AI tab
        const entry = getTabs().get(tabId);
        if (entry) {
          const sourceEl = entry.tabEl.querySelector('.tab-source');
          if (sourceEl && sourceEl.textContent === '🤖') {
            // Claim the tab for User
            fetch('http://localhost:8765/tabs/source', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tabId, source: 'user' })
            }).catch(() => { });
          }
        }
      };
      // Hook into existing tab click by patching focusTab handler
      const _origFocusTab = window.__tandemTabs.focusTab;
      window.__tandemTabs.focusTab = function (tabId) {
        const shouldClaim = typeof window.__tandemTabs.consumeUserOwnershipClaim === 'function'
          ? window.__tandemTabs.consumeUserOwnershipClaim()
          : false;
        if (shouldClaim) {
          origTabClickHandler(tabId);
        }
        return _origFocusTab.call(window.__tandemTabs, tabId);
      };

      // Open URL in new tab (from popup redirect)
      window.tandem.onOpenUrlInNewTab((url) => {
        if (url) window.tandem.newTab(url);
      });

      // Wingman chat injection from context menu — fill input but let user review before sending
      window.tandem.onWingmanChatInject((text) => {
        // Switch to chat tab in panel
        const chatTab = document.querySelector('[data-panel-tab="chat"]');
        if (chatTab) chatTab.click();
        // Fill chat input (user reviews and presses Enter/Send)
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
          chatInput.value = text;
          chatInput.dispatchEvent(new Event('input'));
          chatInput.focus();
        }
      });

      // Bookmark status changed from context menu
      window.tandem.onBookmarkStatusChanged(async (data) => {
        const bookmarkStar = document.getElementById('btn-bookmark');
        if (bookmarkStar) {
          bookmarkStar.classList.toggle('bookmarked', data.bookmarked);
          bookmarkStar.textContent = data.bookmarked ? '★' : '☆';
        }
      });
      window.tandem.onScreenshotModeSelected((mode) => {
        void captureScreenshotMode(mode);
      });

    }

    // ═══════════════════════════════════════════════
    // Chat Router — Multi-backend chat (Phase 3)
    // ═══════════════════════════════════════════════
    const chatRouter = initChat();

    // ═══════════════════════════════════════════════
    // Emergency stop + Approval System
    // ═══════════════════════════════════════════════
    (() => {
      const noodremBtn = document.getElementById('noodrem-btn');
      const approvalContainer = document.getElementById('approval-container');

      // Emergency stop — debounced emergency stop (prevents spam)
      let _noodremLast = 0;
      function fireNoodrem() {
        const now = Date.now();
        if (now - _noodremLast < 2000) return; // 2s debounce
        _noodremLast = now;
        if (window.tandem && window.tandem.emergencyStop) {
          window.tandem.emergencyStop();
        } else {
          fetch('http://localhost:8765/emergency-stop', { method: 'POST' }).catch(() => { });
        }
      }

      if (noodremBtn) {
        noodremBtn.addEventListener('click', fireNoodrem);
      }

      // Escape key = emergency stop (global handler, always works)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          fireNoodrem();
        }
      }, true);

      // Listen for approval requests from main process
      if (window.tandem && window.tandem.onApprovalRequest) {
        window.tandem.onApprovalRequest((data) => {
          showApprovalCard(data);
        });
      }

      // Mirror: when the approval is resolved via ANY other path (Activity
      // panel approve/reject, API route auto-resolve, etc.), the inline
      // Chat card for the same requestId must dismiss itself so the two
      // Wingman surfaces stay in sync. Without this, a user rejecting via
      // Activity still saw the "Wingman wants to perform an action" card
      // in Chat until they clicked it there too.
      if (window.tandem && window.tandem.onApprovalResponse) {
        window.tandem.onApprovalResponse((data) => {
          if (!approvalContainer || !data || !data.requestId) return;
          const card = approvalContainer.querySelector(
            `.approval-card[data-request-id="${data.requestId}"]`,
          );
          if (card) {
            card.remove();
            if (approvalContainer.children.length === 0) {
              approvalContainer.style.display = 'none';
            }
          }
        });
      }

      function showApprovalCard(data) {
        if (!approvalContainer) return;
        approvalContainer.style.display = 'block';

        const card = document.createElement('div');
        card.className = 'approval-card';
        card.dataset.requestId = data.requestId;

        const riskClass = data.riskLevel === 'high' ? 'risk-high' : 'risk-medium';
        const riskLabel = data.riskLevel === 'high' ? 'Hoog risico' : 'Medium risico';
        const actionDesc = data.action ? `${data.action.type}: ${JSON.stringify(data.action.params || {}).slice(0, 80)}` : '';

        card.innerHTML = `
          <div class="approval-title">🤖 Wingman wants to perform an action:</div>
          <div class="approval-desc">${escapeHtmlSimple(data.description || '')}</div>
          <div class="approval-desc" style="font-family:monospace;font-size:10px;">${escapeHtmlSimple(actionDesc)}</div>
          <span class="approval-risk ${riskClass}">${riskLabel}</span>
          <div class="approval-actions">
            <button class="btn-approve" data-task="${data.taskId}" data-step="${data.stepId}">✅ Goedkeuren</button>
            <button class="btn-reject" data-task="${data.taskId}" data-step="${data.stepId}">❌ Afwijzen</button>
          </div>
        `;

        card.querySelector('.btn-approve').addEventListener('click', () => {
          fetch(`http://localhost:8765/tasks/${data.taskId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: data.stepId })
          }).catch(() => { });
          card.remove();
          if (approvalContainer.children.length === 0) approvalContainer.style.display = 'none';
        });

        card.querySelector('.btn-reject').addEventListener('click', () => {
          fetch(`http://localhost:8765/tasks/${data.taskId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: data.stepId })
          }).catch(() => { });
          card.remove();
          if (approvalContainer.children.length === 0) approvalContainer.style.display = 'none';
        });

        approvalContainer.appendChild(card);
      }

      function escapeHtmlSimple(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      // Emergency stop clears all approval cards
      if (window.tandem) {
        const origOnEmergency = window.tandem.onTabSourceChanged; // listen for emergency-stop event via IPC
      }
      // Also poll for emergency stop events (backup)
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'emergency-stop' && approvalContainer) {
          approvalContainer.innerHTML = '';
          approvalContainer.style.display = 'none';
        }
      });
    })();

    window.chatRouter = chatRouter;
