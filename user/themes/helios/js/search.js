/**
 * Helios Theme - Search Functionality
 *
 * Handles search modal and keyboard shortcuts
 */

(function() {
    'use strict';

    /**
     * Initialize keyboard shortcuts for search
     */
    function initSearchShortcuts() {
        // Listen for Cmd+K / Ctrl+K
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();

                // Toggle search modal via Alpine.js
                const searchButton = document.querySelector('[\\@click="searchOpen = true"]');
                if (searchButton) {
                    searchButton.click();
                }
            }
        });
    }

    /**
     * Highlight matching text in search results
     */
    function highlightMatch(text, query) {
        if (!query || !text) return text;

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        initSearchShortcuts();
    });

    // Export for external use
    window.heliosSearch = {
        highlightMatch
    };
})();
