/**
 * Helios Theme - Table of Contents Scroll Spy
 *
 * Highlights the current section in the table of contents based on scroll position.
 * Works with page-toc plugin's anchor generation.
 */

(function() {
    'use strict';

    /**
     * Alpine.js component for TOC scroll spy
     */
    function tocScrollSpy() {
        return {
            activeId: '',
            headings: [],
            tocLinks: [],
            observer: null,
            scrollHandler: null,

            init() {
                // Get all headings that have IDs within the main content
                this.headings = Array.from(
                    document.querySelectorAll('article h1[id], article h2[id], article h3[id], article h4[id], article h5[id], article h6[id]')
                );

                // Get all TOC links
                this.tocLinks = Array.from(document.querySelectorAll('[data-toc-link]'));

                if (this.headings.length === 0) return;

                // Set initial active to first heading or from URL hash
                const hash = window.location.hash.slice(1);
                if (hash && this.headings.find(h => h.id === hash)) {
                    this.activeId = hash;
                } else {
                    this.activeId = this.headings[0]?.id || '';
                }

                // Use IntersectionObserver for scroll spy
                this.setupObserver();

                // Also handle hash changes
                window.addEventListener('hashchange', () => {
                    const hash = window.location.hash.slice(1);
                    if (hash) {
                        this.activeId = hash;
                    }
                });

                // Smooth scroll to heading when clicking TOC links
                this.setupSmoothScroll();
            },

            setupObserver() {
                const headerOffset = 100;

                const options = {
                    root: null,
                    rootMargin: `-${headerOffset}px 0px -80% 0px`,
                    threshold: 0
                };

                this.observer = new IntersectionObserver((entries) => {
                    const intersecting = entries.filter(e => e.isIntersecting);

                    if (intersecting.length > 0) {
                        const topEntry = intersecting.reduce((prev, current) => {
                            return prev.boundingClientRect.top < current.boundingClientRect.top ? prev : current;
                        });
                        this.activeId = topEntry.target.id;
                    } else {
                        const scrollY = window.scrollY + headerOffset;
                        let closestHeading = null;
                        let closestDistance = Infinity;

                        for (const heading of this.headings) {
                            const rect = heading.getBoundingClientRect();
                            const headingTop = rect.top + window.scrollY;

                            if (headingTop <= scrollY) {
                                const distance = scrollY - headingTop;
                                if (distance < closestDistance) {
                                    closestDistance = distance;
                                    closestHeading = heading;
                                }
                            }
                        }

                        if (closestHeading) {
                            this.activeId = closestHeading.id;
                        }
                    }
                }, options);

                this.headings.forEach(heading => {
                    this.observer.observe(heading);
                });

                this.scrollHandler = this.throttle(() => {
                    const scrolledToBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 50);
                    if (scrolledToBottom && this.headings.length > 0) {
                        this.activeId = this.headings[this.headings.length - 1].id;
                    }
                }, 100);

                window.addEventListener('scroll', this.scrollHandler, { passive: true });
            },

            setupSmoothScroll() {
                this.tocLinks.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const targetId = link.getAttribute('data-toc-link');
                        const target = document.getElementById(targetId);

                        if (target) {
                            this.activeId = targetId;

                            const headerOffset = 80;
                            const elementPosition = target.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.scrollY - headerOffset;

                            window.scrollTo({
                                top: offsetPosition,
                                behavior: 'smooth'
                            });

                            history.pushState(null, null, `#${targetId}`);
                        }
                    });
                });
            },

            throttle(func, limit) {
                let inThrottle;
                return function(...args) {
                    if (!inThrottle) {
                        func.apply(this, args);
                        inThrottle = true;
                        setTimeout(() => inThrottle = false, limit);
                    }
                };
            },

            destroy() {
                if (this.observer) {
                    this.observer.disconnect();
                }
                if (this.scrollHandler) {
                    window.removeEventListener('scroll', this.scrollHandler);
                }
            }
        };
    }

    // Register Alpine component - handle both cases
    if (window.Alpine) {
        // Alpine already loaded
        Alpine.data('tocScrollSpy', tocScrollSpy);
    } else {
        // Wait for Alpine to initialize
        document.addEventListener('alpine:init', () => {
            Alpine.data('tocScrollSpy', tocScrollSpy);
        });
    }

    // Also expose globally for debugging
    window.tocScrollSpy = tocScrollSpy;
})();
