/**
 * Helios Theme - HTMX Navigation Helpers
 *
 * Handles post-swap updates for HTMX navigation:
 * - Reinitializes JavaScript components on new content
 * - Updates TOC content
 * - Updates navigation active states
 * - Manages page title updates
 * - Preserves sidebar scroll position
 *
 * Scripts can listen for 'helios:content-loaded' event to reinitialize
 * when new content is loaded via HTMX.
 */

(function() {
    'use strict';

    /**
     * Setup delegated event handlers for dynamic content
     * These work for elements added after page load (via HTMX)
     */
    function setupDelegatedHandlers() {
        // Delegated click handler - catches clicks on elements added dynamically
        document.addEventListener('click', function(evt) {
            // Handle codesh copy buttons
            const codeshCopy = evt.target.closest('.codesh-copy');
            if (codeshCopy) {
                evt.preventDefault();
                handleCodeshCopy(codeshCopy);
                return;
            }

            // Handle codesh group tabs
            const codeshTab = evt.target.closest('.codesh-group-tab');
            if (codeshTab) {
                evt.preventDefault();
                handleCodeshTab(codeshTab);
                return;
            }
        });
    }

    /**
     * Handle codesh copy button click (delegated)
     */
    async function handleCodeshCopy(button) {
        const group = button.closest('.codesh-group');
        const block = button.closest('.codesh-block');

        let codeEl;
        if (group) {
            const activePanel = group.querySelector('.codesh-group-panel.active');
            codeEl = activePanel ? activePanel.querySelector('code') : null;
        } else if (block) {
            codeEl = block.querySelector('.codesh-code code');
        }

        if (!codeEl) return;

        try {
            const clone = codeEl.cloneNode(true);
            clone.querySelectorAll('.line-number').forEach(el => el.remove());

            await navigator.clipboard.writeText(clone.textContent);

            // Show success state
            const textEl = button.querySelector('.codesh-copy-text');
            const iconEl = button.querySelector('.codesh-copy-icon');

            if (textEl) {
                const originalText = textEl.textContent;
                textEl.textContent = 'Copied!';
                button.classList.add('copied');

                if (iconEl) {
                    iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
                }

                setTimeout(function() {
                    textEl.textContent = originalText;
                    button.classList.remove('copied');
                    if (iconEl) {
                        iconEl.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>';
                    }
                }, 2000);
            }

        } catch (err) {
            console.error('[HTMX Nav] Failed to copy code:', err);
        }
    }

    /**
     * Handle codesh group tab click (delegated)
     */
    function handleCodeshTab(tabButton) {
        const group = tabButton.closest('.codesh-group');
        if (!group) return;

        const tabId = tabButton.dataset.tab;
        const tabTitle = tabButton.textContent.trim();

        // Update tab active states
        group.querySelectorAll('.codesh-group-tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Update panel active states
        group.querySelectorAll('.codesh-group-panel').forEach(function(panel) {
            panel.classList.toggle('active', panel.dataset.panel === tabId);
        });

        // Sync with other groups
        const syncKey = group.dataset.sync;
        if (syncKey) {
            try {
                const stored = JSON.parse(localStorage.getItem('codesh-tabs') || '{}');
                stored[syncKey] = tabTitle;
                localStorage.setItem('codesh-tabs', JSON.stringify(stored));
            } catch (e) {}

            // Sync other groups with same key
            document.querySelectorAll('.codesh-group[data-sync="' + syncKey + '"]').forEach(function(otherGroup) {
                if (otherGroup === group) return;
                const matchingTab = Array.from(otherGroup.querySelectorAll('.codesh-group-tab'))
                    .find(function(tab) { return tab.textContent.trim() === tabTitle; });
                if (matchingTab) {
                    matchingTab.click();
                }
            });
        }
    }

    /**
     * Initialize HTMX event listeners
     */
    function init() {
        // Setup delegated event handlers for dynamic content
        setupDelegatedHandlers();

        // Before HTMX request - save sidebar scroll position
        document.body.addEventListener('htmx:beforeRequest', function(evt) {
            const sidebar = document.querySelector('nav[aria-label="Main navigation"]');
            if (sidebar) {
                sessionStorage.setItem('htmx_sidebar_scroll', sidebar.scrollTop);
            }
        });

        // After content is swapped
        document.body.addEventListener('htmx:afterSwap', function(evt) {
            // Only process if this was our main content swap
            if (evt.detail.target.id !== 'htmx-swap-target') return;

            // Update TOC first (before Alpine init since TOC has Alpine components)
            updateToc();

            // Update navigation active states
            updateNavActiveStates();

            // Update page title
            updatePageTitle();

            // Restore sidebar scroll position
            restoreSidebarScroll();

            // Scroll content to top
            window.scrollTo({ top: 0, behavior: 'instant' });

            // Reinitialize all JavaScript components
            reinitializeComponents(evt.detail.target);
        });

        // After HTMX fully settles (includes out-of-band swaps)
        document.body.addEventListener('htmx:afterSettle', function(evt) {
            if (evt.detail.target.id !== 'htmx-swap-target') return;

            // Dispatch custom event for any scripts that want to reinitialize
            dispatchContentLoadedEvent(evt.detail.target);
        });

        // Handle HTMX errors - fall back to full page load
        document.body.addEventListener('htmx:responseError', function(evt) {
            console.error('HTMX navigation error:', evt.detail);
            window.location.href = evt.detail.pathInfo.requestPath;
        });
    }

    /**
     * Reinitialize all JavaScript components after content swap
     */
    function reinitializeComponents(container) {
        // 1. Initialize Alpine.js components in new content
        reinitializeAlpine(container);

        // 2. Initialize code blocks (heliosCode)
        reinitializeCodeBlocks(container);

        // 3. Reinitialize TOC scroll spy
        reinitializeTocScrollSpy();

        // 4. Reinitialize doc-tabs if present
        reinitializeDocTabs(container);

        // 5. Process any inline scripts in the response
        // (HTMX handles this automatically for scripts in swapped content)
    }

    /**
     * Reinitialize Alpine.js components
     */
    function reinitializeAlpine(container) {
        if (!window.Alpine) return;

        // Find all elements with x-data in the container and initialize them
        const alpineElements = container.querySelectorAll('[x-data]');
        alpineElements.forEach(function(el) {
            // Skip if already initialized
            if (el._x_dataStack) return;
            Alpine.initTree(el);
        });

        // Also reinitialize TOC container if it was updated
        const tocContainer = document.getElementById('htmx-toc-container');
        if (tocContainer) {
            const tocAlpineEls = tocContainer.querySelectorAll('[x-data]');
            tocAlpineEls.forEach(function(el) {
                if (!el._x_dataStack) {
                    Alpine.initTree(el);
                }
            });
        }
    }

    /**
     * Reinitialize code blocks
     * Note: Codesh provides server-side syntax highlighting, so code blocks
     * come pre-highlighted and don't need JavaScript re-initialization.
     */
    function reinitializeCodeBlocks(container) {
        // No-op: Codesh handles syntax highlighting server-side
    }

    /**
     * Reinitialize doc-tabs
     */
    function reinitializeDocTabs(container) {
        if (window.heliosDocTabs && typeof window.heliosDocTabs.init === 'function') {
            window.heliosDocTabs.init();
        }
    }

    /**
     * Dispatch custom event for scripts to listen for
     */
    function dispatchContentLoadedEvent(container) {
        // Dispatch on the container
        container.dispatchEvent(new CustomEvent('helios:content-loaded', {
            bubbles: true,
            detail: { container: container, htmx: true }
        }));

        // Also dispatch on window for global listeners
        window.dispatchEvent(new CustomEvent('helios:content-loaded', {
            detail: { container: container, htmx: true }
        }));
    }

    /**
     * Update TOC content from the response template
     */
    function updateToc() {
        const tocTemplate = document.getElementById('htmx-toc-template');
        const tocContainer = document.getElementById('htmx-toc-container');

        if (tocTemplate && tocContainer) {
            const stickyWrapper = tocContainer.querySelector('.sticky');
            if (stickyWrapper) {
                // Destroy existing TOC scroll spy first
                const existingToc = stickyWrapper.querySelector('[x-data="tocScrollSpy()"]');
                if (existingToc && existingToc._x_dataStack) {
                    const data = Alpine.$data(existingToc);
                    if (data && typeof data.destroy === 'function') {
                        data.destroy();
                    }
                }

                // Update content
                stickyWrapper.innerHTML = tocTemplate.innerHTML;
            }
        }
    }

    /**
     * Update navigation active states based on response data
     */
    function updateNavActiveStates() {
        const navStateEl = document.getElementById('htmx-nav-state');
        if (!navStateEl) return;

        try {
            const state = JSON.parse(navStateEl.textContent);
            const activeRoute = state.route;

            // Remove all active classes from nav links and containers
            document.querySelectorAll('.nav-link.active, .nav-link-container.active').forEach(function(el) {
                el.classList.remove('active');
            });

            // Add active class to matching elements
            document.querySelectorAll('[data-nav-route="' + activeRoute + '"]').forEach(function(el) {
                el.classList.add('active');
            });

            // Expand parent sections for the active item
            expandParentSections(activeRoute);
        } catch (e) {
            console.error('[HTMX Nav] Error updating nav state:', e);
        }
    }

    /**
     * Expand parent navigation sections for the active route
     */
    function expandParentSections(activeRoute) {
        const activeLink = document.querySelector('.nav-link[data-nav-route="' + activeRoute + '"]');
        if (!activeLink) return;

        // Walk up the DOM to find and expand parent nav-items
        let parent = activeLink.closest('.nav-item');
        while (parent) {
            // Find the Alpine.js data on this element and set expanded = true
            if (parent._x_dataStack && parent._x_dataStack[0]) {
                const data = parent._x_dataStack[0];
                if (typeof data.expanded !== 'undefined') {
                    data.expanded = true;
                    // Also update localStorage to persist the state
                    if (data.key) {
                        localStorage.setItem(data.key, 'true');
                    }
                }
            }
            // Move to parent nav-item
            parent = parent.parentElement ? parent.parentElement.closest('.nav-item') : null;
        }
    }

    /**
     * Update page title from nav state
     */
    function updatePageTitle() {
        const navStateEl = document.getElementById('htmx-nav-state');
        if (!navStateEl) return;

        try {
            const state = JSON.parse(navStateEl.textContent);
            if (state.appendSiteTitle && state.title && state.siteTitle) {
                document.title = state.title + ' | ' + state.siteTitle;
            } else if (state.title) {
                document.title = state.title;
            } else if (state.siteTitle) {
                document.title = state.siteTitle;
            }
        } catch (e) {
            console.error('[HTMX Nav] Error updating page title:', e);
        }
    }

    /**
     * Restore sidebar scroll position
     */
    function restoreSidebarScroll() {
        const saved = sessionStorage.getItem('htmx_sidebar_scroll');
        if (saved) {
            const sidebar = document.querySelector('nav[aria-label="Main navigation"]');
            if (sidebar) {
                sidebar.scrollTop = parseInt(saved, 10);
            }
        }
    }

    /**
     * Reinitialize TOC scroll spy Alpine component
     */
    function reinitializeTocScrollSpy() {
        if (!window.Alpine) return;

        const tocContainer = document.getElementById('htmx-toc-container');
        if (!tocContainer) return;

        // Find the TOC nav element with scroll spy
        const tocNav = tocContainer.querySelector('[x-data="tocScrollSpy()"]');
        if (!tocNav) return;

        // Initialize if not already initialized
        if (!tocNav._x_dataStack) {
            Alpine.initTree(tocNav);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose utilities for debugging and external use
    window.heliosHtmx = {
        updateToc: updateToc,
        updateNavActiveStates: updateNavActiveStates,
        reinitializeTocScrollSpy: reinitializeTocScrollSpy,
        reinitializeComponents: reinitializeComponents,
        updatePageTitle: updatePageTitle,
        dispatchContentLoadedEvent: dispatchContentLoadedEvent
    };
})();
