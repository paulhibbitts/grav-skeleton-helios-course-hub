/**
 * SVG Icons - Editor Pro Integration
 * Enhances the svg-icon shortcode modal with an icon picker
 */
(function() {
    'use strict';

    console.log('SVG Icons: Editor Pro integration loaded');

    const BATCH_SIZE = 50;

    // Reuse the API class from svgicon-field.js
    class SvgIconAPI {
        constructor(endpoint) {
            this.endpoint = endpoint;
            this.sets = null;
            this.securityToken = window.GravAdmin?.config?.security_token;
        }

        async getSets() {
            if (this.sets) return this.sets;
            const url = new URL(this.endpoint, window.location.origin);
            url.searchParams.set('mode', 'sets');
            const response = await this.request(url);
            this.sets = response.sets || [];
            return this.sets;
        }

        async getIcons(params) {
            const url = new URL(this.endpoint, window.location.origin);
            url.searchParams.set('mode', 'icons');
            url.searchParams.set('set', params.set || 'tabler');
            url.searchParams.set('offset', params.offset || 0);
            url.searchParams.set('limit', params.limit || BATCH_SIZE);
            if (params.search) url.searchParams.set('q', params.search);
            return this.request(url);
        }

        async request(url) {
            const options = { method: 'GET', credentials: 'same-origin', headers: {} };
            if (this.securityToken) options.headers['X-Grav-Nonce'] = this.securityToken;
            const response = await fetch(url.toString(), options);
            if (!response.ok) throw new Error(`Request failed: ${response.status}`);
            return response.json();
        }
    }

    // Icon Picker Modal for Editor Pro
    class EditorProIconPicker {
        constructor() {
            // Use base_url_relative which includes the full path like /grav-helios/admin
            const baseUrl = window.GravAdmin?.config?.base_url_relative || '/admin';
            const endpoint = baseUrl + '/svg-icons';
            console.log('SVG Icons: API endpoint', endpoint);
            this.api = new SvgIconAPI(endpoint);
            this.baseUrl = window.GravAdmin?.config?.base_url_simple || '';
            this.callback = null;
            this.currentSet = 'tabler';
            this.searchQuery = '';
            this.offset = 0;
            this.total = 0;
            this.loading = false;
            this.observer = null;
            this._build();
        }

        _build() {
            this.element = document.createElement('div');
            this.element.className = 'svgicon-picker-modal';
            this.element.innerHTML = `
                <div class="svgicon-picker-overlay"></div>
                <div class="svgicon-picker-dialog">
                    <div class="svgicon-picker-header">
                        <h3>Select Icon</h3>
                        <button type="button" class="svgicon-picker-close">&times;</button>
                    </div>
                    <div class="svgicon-picker-controls">
                        <select class="svgicon-picker-set"></select>
                        <input type="search" class="svgicon-picker-search" placeholder="Search icons..." />
                    </div>
                    <div class="svgicon-picker-grid"></div>
                    <div class="svgicon-picker-footer"></div>
                </div>
            `;

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .svgicon-picker-modal { position: fixed; inset: 0; z-index: 100001; display: none; }
                .svgicon-picker-modal.is-open { display: block; }
                .svgicon-picker-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
                .svgicon-picker-dialog {
                    position: relative; margin: 5vh auto; width: 90%; max-width: 700px; max-height: 90vh;
                    background: #fff; border-radius: 8px; display: flex; flex-direction: column;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                }
                .svgicon-picker-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
                }
                .svgicon-picker-header h3 { margin: 0; font-size: 18px; color: #1f2937; }
                .svgicon-picker-close {
                    background: none; border: none; font-size: 24px; cursor: pointer;
                    color: #6b7280; line-height: 1;
                }
                .svgicon-picker-close:hover { color: #1f2937; }
                .svgicon-picker-controls {
                    display: flex; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #e5e7eb;
                }
                .svgicon-picker-set, .svgicon-picker-search {
                    padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;
                    height: auto; margin: 0; color: #1f2937; background: #fff;
                }
                .svgicon-picker-set { min-width: 180px; margin-bottom: 0 !important; }
                .svgicon-picker-search::placeholder { color: #9ca3af; }
                .svgicon-picker-search { flex: 1; }
                .svgicon-picker-grid {
                    flex: 1; overflow-y: auto; padding: 16px; display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 12px;
                    min-height: 300px; max-height: 50vh;
                }
                .svgicon-picker-icon {
                    display: flex; flex-direction: column; align-items: center; gap: 6px;
                    padding: 12px 8px; background: #f9fafb; border: 2px solid transparent;
                    border-radius: 8px; cursor: pointer; transition: all 0.15s;
                }
                .svgicon-picker-icon:hover { border-color: #6366f1; background: #eef2ff; }
                .svgicon-picker-icon img { width: 32px; height: 32px; }
                .svgicon-picker-icon span {
                    font-size: 11px; color: #6b7280; text-align: center;
                    word-break: break-all; line-height: 1.2;
                }
                .svgicon-picker-footer { padding: 12px 20px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
                .svgicon-picker-status { grid-column: 1/-1; text-align: center; padding: 20px; color: #6b7280; }
                .svgicon-picker-sentinel { height: 1px; grid-column: 1/-1; }
            `;
            document.head.appendChild(style);

            this.overlay = this.element.querySelector('.svgicon-picker-overlay');
            this.closeBtn = this.element.querySelector('.svgicon-picker-close');
            this.setSelect = this.element.querySelector('.svgicon-picker-set');
            this.searchInput = this.element.querySelector('.svgicon-picker-search');
            this.grid = this.element.querySelector('.svgicon-picker-grid');
            this.footer = this.element.querySelector('.svgicon-picker-footer');

            this.status = document.createElement('div');
            this.status.className = 'svgicon-picker-status';
            this.grid.appendChild(this.status);

            this.sentinel = document.createElement('div');
            this.sentinel.className = 'svgicon-picker-sentinel';
            this.grid.appendChild(this.sentinel);

            this.overlay.addEventListener('click', () => this.close());
            this.closeBtn.addEventListener('click', () => this.close());
            this.setSelect.addEventListener('change', () => {
                this.currentSet = this.setSelect.value;
                this.loadIcons(true);
            });

            let debounce;
            this.searchInput.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    this.searchQuery = this.searchInput.value.trim();
                    this.loadIcons(true);
                }, 250);
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.element.classList.contains('is-open')) {
                    this.close();
                }
            });
        }

        async open(callback, currentValue) {
            this.callback = callback;
            this.searchQuery = '';
            this.searchInput.value = '';

            document.body.appendChild(this.element);
            this.element.classList.add('is-open');

            this.status.textContent = 'Loading...';
            this.status.style.display = 'block';

            try {
                const sets = await this.api.getSets();
                this.populateSets(sets);

                // Try to detect current set from value
                if (currentValue) {
                    const parts = currentValue.split('/');
                    if (parts.length > 1) {
                        const possibleSet = parts.slice(0, -1).join('/');
                        if (sets.find(s => s.id === possibleSet)) {
                            this.currentSet = possibleSet;
                        }
                    }
                }
                this.setSelect.value = this.currentSet;
                await this.loadIcons(true);
            } catch (err) {
                this.status.textContent = 'Failed to load icons';
                console.error(err);
            }
        }

        close() {
            this.element.classList.remove('is-open');
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            setTimeout(() => {
                if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
            }, 150);
        }

        populateSets(sets) {
            this.setSelect.innerHTML = sets.map(s =>
                `<option value="${s.id}">${s.name} (${s.count})</option>`
            ).join('');
        }

        async loadIcons(reset = false) {
            if (this.loading) return;
            this.loading = true;

            if (reset) {
                this.offset = 0;
                this.grid.innerHTML = '';
                this.grid.appendChild(this.status);
                this.grid.appendChild(this.sentinel);
                if (this.observer) {
                    this.observer.disconnect();
                    this.observer = null;
                }
            }

            this.status.textContent = 'Loading...';
            this.status.style.display = 'block';

            try {
                const response = await this.api.getIcons({
                    set: this.currentSet,
                    offset: this.offset,
                    limit: BATCH_SIZE,
                    search: this.searchQuery
                });

                this.total = response.total || 0;
                const icons = response.icons || [];

                this.renderIcons(icons);
                this.offset += icons.length;

                if (this.offset < this.total) {
                    this.attachObserver();
                }

                this.footer.textContent = this.total > 0
                    ? `Showing ${Math.min(this.offset, this.total)} of ${this.total}`
                    : '';

                this.status.style.display = this.total === 0 ? 'block' : 'none';
                this.status.textContent = this.total === 0 ? 'No icons found' : '';
            } catch (err) {
                this.status.textContent = 'Failed to load icons';
                console.error(err);
            } finally {
                this.loading = false;
            }
        }

        renderIcons(icons) {
            const base = (this.baseUrl + '/user/plugins/svg-icons/icons').replace(/\/+$/, '');
            const fragment = document.createDocumentFragment();

            icons.forEach(item => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'svgicon-picker-icon';
                btn.innerHTML = `
                    <img src="${base}/${item.value}" alt="${item.name}" />
                    <span>${item.name}</span>
                `;
                btn.addEventListener('click', () => {
                    if (this.callback) {
                        this.callback(item.name, this.currentSet);
                    }
                    this.close();
                });
                fragment.appendChild(btn);
            });

            this.grid.insertBefore(fragment, this.sentinel);
        }

        attachObserver() {
            if (this.observer) return;
            this.observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !this.loading && this.offset < this.total) {
                    this.loadIcons(false);
                }
            }, { root: this.grid, threshold: 0.1 });
            this.observer.observe(this.sentinel);
        }
    }

    // Singleton instance
    let pickerInstance = null;

    function getIconPicker() {
        if (!pickerInstance) {
            pickerInstance = new EditorProIconPicker();
        }
        return pickerInstance;
    }

    // Enhance Editor Pro shortcode modals for svg-icon
    function enhanceSvgIconModal() {
        // Watch for modal elements being added to DOM
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.textContent?.includes('SVG Icon')) {
                        setTimeout(() => enhanceModal(node), 50);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function enhanceModal(modal) {
        if (!modal) return;

        // Verify this is an SVG Icon modal
        if (!modal.textContent?.includes('SVG Icon')) return;

        // Find the icon input - look for input near "Icon Name" label
        let iconInput = null;
        let labels = [];

        const allLabels = modal.querySelectorAll('label, [class*="label"]');
        allLabels.forEach(label => {
            labels.push(label);
            if (label.textContent?.includes('Icon Name')) {
                const parent = label.parentElement;
                const input = parent?.querySelector('input');
                if (input && !input.dataset.svgIconEnhanced) {
                    iconInput = input;
                }
            }
        });

        if (!iconInput) return;

        iconInput.dataset.svgIconEnhanced = 'true';
        console.log('SVG Icons: Enhancing icon input', iconInput);

        // Create browse button
        const browseBtn = document.createElement('button');
        browseBtn.type = 'button';
        browseBtn.textContent = 'Browse';
        browseBtn.style.cssText = 'margin-left: 8px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;';
        browseBtn.addEventListener('mouseenter', () => browseBtn.style.background = '#2563eb');
        browseBtn.addEventListener('mouseleave', () => browseBtn.style.background = '#3b82f6');

        // Get the set select if available
        let setSelect = modal.querySelector('select');

        browseBtn.addEventListener('click', () => {
            const currentIcon = iconInput.value || '';
            const currentSet = setSelect?.value || 'tabler';

            getIconPicker().open((iconName, iconSet) => {
                iconInput.value = iconName;
                if (setSelect && iconSet) {
                    // Convert set id to match select options (e.g., heroicons/solid -> heroicons|solid)
                    const optionValue = iconSet.replace(/\//g, '|');
                    const option = Array.from(setSelect.options).find(o => o.value === optionValue || o.value === iconSet);
                    if (option) {
                        setSelect.value = option.value;
                    }
                }
                // Trigger change events
                iconInput.dispatchEvent(new Event('input', { bubbles: true }));
                iconInput.dispatchEvent(new Event('change', { bubbles: true }));
            }, currentSet + '/' + currentIcon);
        });

        // Insert button after input
        iconInput.parentNode.insertBefore(browseBtn, iconInput.nextSibling);

        // Make input container flex
        if (iconInput.parentNode.style) {
            iconInput.parentNode.style.display = 'flex';
            iconInput.parentNode.style.alignItems = 'center';
            iconInput.style.flex = '1';
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceSvgIconModal);
    } else {
        enhanceSvgIconModal();
    }

})();
