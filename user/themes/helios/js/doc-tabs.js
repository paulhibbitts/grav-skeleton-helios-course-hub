/**
 * Doc Tabs - Tab switching with optional sync across pages
 */
(function() {
    const STORAGE_KEY = 'helios-doc-tabs';

    /**
     * Get stored tab preferences from localStorage
     */
    function getStoredPreferences() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    /**
     * Save tab preference to localStorage
     */
    function savePreference(label) {
        const prefs = getStoredPreferences();
        // Store the timestamp to track which label was most recently selected
        prefs[label] = Date.now();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch {
            // Silently fail if localStorage is not available
        }
    }

    /**
     * Activate a tab by index within a tab container
     */
    function activateTab(container, index) {
        const buttons = container.querySelectorAll('.doc-tab-button');
        const panels = container.querySelectorAll('.doc-tab-panel');

        buttons.forEach((btn, i) => {
            const isActive = i === index;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel, i) => {
            const isActive = i === index;
            panel.classList.toggle('active', isActive);
            panel.hidden = !isActive;
        });
    }

    /**
     * Activate tabs by label across all synced tab containers
     */
    function activateTabsByLabel(label, sourceContainer) {
        document.querySelectorAll('.doc-tabs[data-sync-labels="true"]').forEach(container => {
            if (container === sourceContainer) return;

            const buttons = container.querySelectorAll('.doc-tab-button');
            buttons.forEach((btn, index) => {
                if (btn.dataset.tabLabel === label) {
                    activateTab(container, index);
                }
            });
        });
    }

    /**
     * Initialize a tab container
     */
    function initTabContainer(container) {
        const buttons = container.querySelectorAll('.doc-tab-button');
        const syncLabels = container.dataset.syncLabels === 'true';

        // If sync is enabled, check for stored preference
        if (syncLabels) {
            const prefs = getStoredPreferences();
            let matchedIndex = -1;
            let matchedTime = 0;

            buttons.forEach((btn, index) => {
                const label = btn.dataset.tabLabel;
                if (prefs[label] && prefs[label] > matchedTime) {
                    matchedIndex = index;
                    matchedTime = prefs[label];
                }
            });

            if (matchedIndex >= 0) {
                activateTab(container, matchedIndex);
            }
        }

        // Add click handlers
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                activateTab(container, index);

                if (syncLabels) {
                    const label = btn.dataset.tabLabel;
                    savePreference(label);
                    activateTabsByLabel(label, container);
                }
            });
        });
    }

    /**
     * Initialize all tab containers on the page
     */
    function init() {
        document.querySelectorAll('.doc-tabs').forEach(initTabContainer);
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-initialize after HTMX content swaps
    document.addEventListener('htmx:afterSettle', (e) => {
        // Only initialize tabs within the swapped content
        const target = e.detail.target;
        if (target) {
            target.querySelectorAll('.doc-tabs').forEach(initTabContainer);
        }
    });

    // Handle storage events for cross-tab sync
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
            const prefs = getStoredPreferences();
            document.querySelectorAll('.doc-tabs[data-sync-labels="true"]').forEach(container => {
                const buttons = container.querySelectorAll('.doc-tab-button');
                let matchedIndex = -1;
                let matchedTime = 0;

                buttons.forEach((btn, index) => {
                    const label = btn.dataset.tabLabel;
                    if (prefs[label] && prefs[label] > matchedTime) {
                        matchedIndex = index;
                        matchedTime = prefs[label];
                    }
                });

                if (matchedIndex >= 0) {
                    activateTab(container, matchedIndex);
                }
            });
        }
    });
})();
