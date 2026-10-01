/**
 * Theme Initialization Script
 * Must load synchronously (no defer/async) to prevent FOUC.
 * Sets the initial theme state before any rendering occurs.
 */
(function () {
  'use strict';
  
  /**
   * Safely get theme preference from localStorage
   * @returns {string|null} Theme preference or null if not available
   */
  function getStoredTheme() {
    try {
      return localStorage.getItem('theme');
    } catch (error) {
      // localStorage may be blocked by privacy settings
      console.warn('[Theme-Init] Storage not available:', error.message);
      return null;
    }
  }

  /**
   * Apply theme to document element
   * @param {string} theme - Theme to apply ('dark' or 'light')
   */
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      // Default to light theme or remove dark theme
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // Initialize theme from storage or use system preference
  const storedTheme = getStoredTheme();
  
  // Check if user has explicitly set a theme preference
  if (storedTheme === 'dark') {
    applyTheme('dark');
  } else if (storedTheme === 'light') {
    applyTheme('light');
  } else {
    // Use system preference as fallback
    try {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (darkModeMediaQuery.matches) {
        applyTheme('dark');
      }
    } catch (error) {
      // matchMedia not available, default to light theme
      console.warn('[Theme-Init] System preference detection failed:', error.message);
    }
  }

  // Log initialization for debugging
  if (typeof console !== 'undefined') {
    console.log(`[Theme-Init] Theme initialized to: ${storedTheme || 'system preference'}`);
  }
}());
