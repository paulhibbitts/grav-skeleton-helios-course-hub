/**
 * Helios Theme - Appearance/Theme Switching
 *
 * Handles light/dark mode switching with system preference detection
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'helios-theme';

    /**
     * Get the current theme setting
     */
    function getTheme() {
        return localStorage.getItem(STORAGE_KEY) || 'system';
    }

    /**
     * Set and apply the theme
     */
    function setTheme(theme) {
        localStorage.setItem(STORAGE_KEY, theme);
        applyTheme(theme);
    }

    /**
     * Apply the theme to the document
     */
    function applyTheme(theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = theme === 'dark' || (theme === 'system' && prefersDark);

        document.documentElement.classList.toggle('dark', isDark);

        // Dispatch custom event for other scripts to react
        window.dispatchEvent(new CustomEvent('helios-theme-change', {
            detail: { theme, isDark }
        }));
    }

    /**
     * Initialize theme on page load
     */
    function init() {
        const theme = getTheme();
        applyTheme(theme);

        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (getTheme() === 'system') {
                applyTheme('system');
            }
        });
    }

    // Export functions for Alpine.js and other scripts
    window.heliosTheme = {
        get: getTheme,
        set: setTheme,
        apply: applyTheme
    };

    // Initialize
    init();
})();
