// Navigation highlighting
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');

function highlightCurrentSection() {
  const scrollY = window.scrollY + 100;
  
  sections.forEach((section, index) => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    
    if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
      navLinks.forEach(link => link.classList.remove('active'));
      navLinks[index].classList.add('active');
    }
  });
}

window.addEventListener('scroll', highlightCurrentSection);

// Smooth scroll for navigation
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('href').substring(1);
    const targetSection = document.getElementById(targetId);
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Shortcuts overlay trigger
function showShortcutsOverlay() {
  // Send message to main process to show shortcuts overlay
  if (window.electronAPI) {
    window.electronAPI.showShortcutsOverlay();
  }
}

// CSP forbids inline onclick handlers — bind the floating button here.
document.getElementById('help-shortcuts-btn')?.addEventListener('click', showShortcutsOverlay);

// Handle Cmd+? shortcut if pressed on this page
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === '?') {
    e.preventDefault();
    showShortcutsOverlay();
  }
});

// Theme sync is handled by shell/js/theme.js (loaded in <head>).
