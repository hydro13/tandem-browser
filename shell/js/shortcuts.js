    // Shortcuts overlay functionality
    function showShortcutsOverlay() {
      const overlay = document.getElementById('shortcuts-overlay');
      overlay.classList.add('visible');
      document.getElementById('shortcuts-search').focus();

      // Clear search
      document.getElementById('shortcuts-search').value = '';
      filterShortcuts('');
    }

    function hideShortcutsOverlay() {
      const overlay = document.getElementById('shortcuts-overlay');
      overlay.classList.remove('visible');
    }

    function filterShortcuts(query) {
      const items = document.querySelectorAll('.shortcut-item');
      const lowerQuery = query.toLowerCase();

      items.forEach(item => {
        const searchText = item.getAttribute('data-search') || '';
        const descText = item.querySelector('.shortcut-desc')?.textContent || '';
        const combined = (searchText + ' ' + descText).toLowerCase();

        if (!query || combined.includes(lowerQuery)) {
          item.classList.remove('hidden');
        } else {
          item.classList.add('hidden');
        }
      });
    }

    // Search functionality
    document.getElementById('shortcuts-search').addEventListener('input', (e) => {
      filterShortcuts(e.target.value);
    });

    // Close overlay with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideShortcutsOverlay();
      }
    });

    // Close on backdrop click
    document.getElementById('shortcuts-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        hideShortcutsOverlay();
      }
    });

    // ═══════════════════════════════════════════════
    // Onboarding functionality
    // ═══════════════════════════════════════════════

    let currentOnboardingStep = 1;

    function showOnboarding() {
      const overlay = document.getElementById('onboarding-overlay');

      if (!overlay) {
        console.error('onboarding-overlay element not found in DOM');
        return;
      }

      overlay.classList.add('visible');
      showOnboardingStep(1);
    }

    function hideOnboarding() {
      const overlay = document.getElementById('onboarding-overlay');
      overlay.classList.remove('visible');
    }

    function showOnboardingStep(step) {
      currentOnboardingStep = step;

      // Hide all steps
      for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`onboarding-step-${i}`);
        if (stepEl) stepEl.style.display = 'none';
      }

      // Show current step
      const currentStep = document.getElementById(`onboarding-step-${step}`);
      if (currentStep) {
        currentStep.style.display = 'block';
      } else {
        console.error('onboarding-step-' + step + ' element not found');
      }

      // Update dots
      const dots = document.querySelectorAll('.onboarding-dots .dot');
      dots.forEach((dot, i) => {
        if (i === step - 1) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });

      // Update button states
      const prevBtn = document.getElementById('onboarding-prev');
      const nextBtn = document.getElementById('onboarding-next');
      const skipBtn = document.getElementById('onboarding-skip');

      if (prevBtn) prevBtn.disabled = step === 1;

      if (step === 4) {
        // Last step
        if (nextBtn) {
          nextBtn.textContent = 'Start!';
          nextBtn.setAttribute('data-final-step', 'true');
        }
        if (skipBtn) skipBtn.style.display = 'none';
      } else {
        if (nextBtn) {
          nextBtn.textContent = 'Volgende';
          nextBtn.removeAttribute('data-final-step');
        }
        if (skipBtn) skipBtn.style.display = 'block';
      }
    }

    // Register onboarding event listeners
    (() => {
      const nextBtn = document.getElementById('onboarding-next');
      const prevBtn = document.getElementById('onboarding-prev');
      const skipBtn = document.getElementById('onboarding-skip');

      if (nextBtn) nextBtn.addEventListener('click', () => {
        // Check if we're on the final step (step 4) or if button says "Start!"
        if (currentOnboardingStep === 4 || nextBtn.textContent === 'Start!' || nextBtn.getAttribute('data-final-step') === 'true') {
          // Final step - hide and save
          hideOnboarding();
          fetch('http://localhost:8765/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ general: { onboardingComplete: true } })
          });
        } else if (currentOnboardingStep < 4) {
          showOnboardingStep(currentOnboardingStep + 1);
        }
      });

      if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentOnboardingStep > 1) {
          showOnboardingStep(currentOnboardingStep - 1);
        }
      });

      if (skipBtn) skipBtn.addEventListener('click', () => {
        hideOnboarding();
        // Save that onboarding was completed
        fetch('http://localhost:8765/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ general: { onboardingComplete: true } })
        });
      });
    })();

    async function startChromeImport() {
      const statusEl = document.getElementById('import-status');

      try {
        statusEl.innerHTML = '📥 Importeren van Chrome bookmarks...';

        const bookmarksResp = await fetch('http://localhost:8765/import/chrome/bookmarks', { method: 'POST' });
        if (bookmarksResp.ok) {
          statusEl.innerHTML += '<br>✅ Bookmarks geïmporteerd';
        }

        statusEl.innerHTML += '<br>📚 Importing history...';
        const historyResp = await fetch('http://localhost:8765/import/chrome/history', { method: 'POST' });
        if (historyResp.ok) {
          statusEl.innerHTML += '<br>✅ History imported';
        }

        statusEl.innerHTML += '<br>🍪 Importeren van cookies...';
        const cookiesResp = await fetch('http://localhost:8765/import/chrome/cookies', { method: 'POST' });
        if (cookiesResp.ok) {
          statusEl.innerHTML += '<br>✅ Cookies geïmporteerd';
        } else {
          statusEl.innerHTML += '<br>⚠️ Cookies kunnen niet geïmporteerd worden (encrypted)';
        }

        statusEl.innerHTML += '<br><br>🎉 Import voltooid!';

        setTimeout(() => {
          nextOnboardingStep();
        }, 2000);

      } catch (error) {
        statusEl.innerHTML = '❌ Import mislukt. Chrome moet gesloten zijn om data te importeren.';
      }
    }

    async function completeOnboarding() {
      try {
        // Mark onboarding as complete
        await fetch('http://localhost:8765/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            general: {
              onboardingComplete: true
            }
          })
        });

        hideOnboarding();

        // Show Copilot panel after a brief moment
        setTimeout(() => {
          if (window.tandem && window.tandem.openPanel) {
            window.tandem.openPanel();
          }
        }, 1000);

      } catch (error) {
        hideOnboarding();
      }
    }

    // Check if onboarding should be shown
    async function checkOnboarding() {
      try {
        const response = await fetch('http://localhost:8765/config');
        if (response.ok) {
          const config = await response.json();
          const onboardingComplete = config.general?.onboardingComplete || false;

          if (!onboardingComplete) {
            // Show onboarding after a brief delay
            setTimeout(showOnboarding, 1500);
          }
        } else {
          // If no config exists, show onboarding
          setTimeout(showOnboarding, 1500);
        }
      } catch (error) {
        // If API is not ready, show onboarding
        setTimeout(showOnboarding, 1500);
      }
    }

    // Start onboarding check
    setTimeout(checkOnboarding, 2000);

    // ═══════════════════════════════════════════════
    // Theme management
    // ═══════════════════════════════════════════════

    async function loadThemeFromConfig() {
      try {
        const response = await fetch('http://localhost:8765/config');
        if (response.ok) {
          const config = await response.json();
          const theme = config.theme || 'dark';
          applyTheme(theme);
        }
      } catch (error) {
        // Default dark theme used (config load failed)
      }
    }

    function applyTheme(theme) {
      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else if (theme === 'system') {
        document.documentElement.setAttribute('data-theme', 'system');
      } else {
        document.documentElement.removeAttribute('data-theme'); // Default dark
      }
    }

    // Load theme on startup
    setTimeout(loadThemeFromConfig, 100);

    // ═══════════════════════════════════════════════
    // Password Vault UI Logic
    // ═══════════════════════════════════════════════
    const vaultBtn = document.getElementById('vault-toggle-btn');
    const vaultOverlay = document.getElementById('vault-overlay');
    const vaultClose = document.getElementById('vault-close');
    const vaultLockedView = document.getElementById('vault-locked-view');
    const vaultUnlockedView = document.getElementById('vault-unlocked-view');
    const vaultUnlockBtn = document.getElementById('vault-unlock-btn');
    const vaultLockBtn = document.getElementById('vault-lock-btn');
    const vaultMasterPassword = document.getElementById('vault-master-password');
    const vaultErrorMsg = document.getElementById('vault-error-msg');

    let isVaultUnlocked = false;

    async function checkVaultStatus() {
      try {
        const res = await fetch('http://localhost:8765/passwords/status');
        if (!res.ok) return;
        const data = await res.json();
        isVaultUnlocked = data.unlocked;

        if (data.isNewVault) {
          vaultMasterPassword.placeholder = "Create New Master Password";
          vaultUnlockBtn.textContent = "Initialize Vault";
        } else {
          vaultMasterPassword.placeholder = "Master Password";
          vaultUnlockBtn.textContent = "Unlock Vault";
        }

        updateVaultView();
      } catch (err) {
        console.error('Failed to check vault status', err);
      }
    }

    function updateVaultView() {
      if (isVaultUnlocked) {
        vaultLockedView.style.display = 'none';
        vaultUnlockedView.style.display = 'block';
        vaultBtn.textContent = '🔓';
        vaultBtn.style.color = 'var(--success)';
      } else {
        vaultLockedView.style.display = 'block';
        vaultUnlockedView.style.display = 'none';
        vaultBtn.textContent = '🔒';
        vaultBtn.style.color = 'var(--text-dim)';
        vaultMasterPassword.value = '';
        vaultErrorMsg.style.display = 'none';
      }
    }

    if (vaultBtn) {
      vaultBtn.addEventListener('click', () => {
        checkVaultStatus();
        vaultOverlay.style.display = 'flex';
        if (!isVaultUnlocked) vaultMasterPassword.focus();
      });
    }

    if (vaultClose) {
      vaultClose.addEventListener('click', () => {
        vaultOverlay.style.display = 'none';
      });
    }

    if (vaultUnlockBtn) {
      vaultUnlockBtn.addEventListener('click', async () => {
        const password = vaultMasterPassword.value;
        if (!password) {
          vaultErrorMsg.textContent = "Password cannot be empty";
          vaultErrorMsg.style.display = 'block';
          return;
        }

        try {
          const res = await fetch('http://localhost:8765/passwords/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            vaultErrorMsg.textContent = data.error || "Incorrect master password";
            vaultErrorMsg.style.display = 'block';
            return;
          }

          const data = await res.json();
          if (data.success) {
            isVaultUnlocked = true;
            updateVaultView();
          }
        } catch (err) {
          vaultErrorMsg.textContent = "Connection error";
          vaultErrorMsg.style.display = 'block';
        }
      });
    }

    if (vaultLockBtn) {
      vaultLockBtn.addEventListener('click', async () => {
        try {
          await fetch('http://localhost:8765/passwords/lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          isVaultUnlocked = false;
          updateVaultView();
        } catch (err) {
          console.error(err);
        }
      });
    }

    if (vaultMasterPassword) {
      vaultMasterPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') vaultUnlockBtn.click();
      });
    }

    // Initial check after startup
    setTimeout(checkVaultStatus, 1000);

