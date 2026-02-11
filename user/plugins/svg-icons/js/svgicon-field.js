(function () {
    'use strict';

    const BATCH_SIZE = 50;
    const ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    function formatSetName(value) {
        return value
            .replace(/[/-]+/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] || char);
    }

    function buildUrl(endpoint) {
        try {
            return new URL(endpoint, window.location.origin);
        } catch (err) {
            const anchor = document.createElement('a');
            anchor.href = endpoint;
            return new URL(anchor.href);
        }
    }

    class SvgIconAPI {
        constructor(endpoint) {
            this.endpoint = endpoint;
            this.sets = null;
            this.securityToken = window.GravAdmin?.config?.security_token;
        }

        setEndpoint(endpoint) {
            if (endpoint && endpoint !== this.endpoint) {
                this.endpoint = endpoint;
                this.sets = null;
            }
        }

        async getSets() {
            if (this.sets) {
                return this.sets;
            }

            const url = buildUrl(this.endpoint);
            url.searchParams.set('mode', 'sets');

            const response = await this.request(url);
            this.sets = response.sets || [];
            return this.sets;
        }

        async getIcons(params) {
            const url = buildUrl(this.endpoint);
            url.searchParams.set('mode', 'icons');
            url.searchParams.set('set', params.set || 'tabler');
            url.searchParams.set('offset', params.offset || 0);
            url.searchParams.set('limit', params.limit || BATCH_SIZE);

            if (params.search) {
                url.searchParams.set('q', params.search);
            }

            return this.request(url);
        }

        async request(url) {
            const options = {
                method: 'GET',
                credentials: 'same-origin',
                headers: {}
            };

            if (this.securityToken) {
                options.headers['X-Grav-Nonce'] = this.securityToken;
            }

            const response = await fetch(url.toString(), options);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            return response.json();
        }
    }

    class SvgIconModal {
        constructor(api) {
            this.api = api;
            this.activeField = null;
            this.activeSet = null;
            this.activeIcon = null;
            this.baseUrl = '';
            this.offset = 0;
            this.total = 0;
            this.loaded = 0;
            this.loading = false;
            this.searchQuery = '';
            this.setsLoaded = false;
            this.debounceHandle = null;
            this.icons = [];
            this.observer = null;
            this.pageSize = BATCH_SIZE;
            this.allowedSets = [];
            this._build();
        }

        static getInstance(endpoint) {
            if (!SvgIconModal.instance) {
                SvgIconModal.instance = new SvgIconModal(new SvgIconAPI(endpoint));
            } else {
                SvgIconModal.instance.api.setEndpoint(endpoint);
            }

            return SvgIconModal.instance;
        }

        _build() {
            this.element = document.createElement('div');
            this.element.className = 'svgicon-modal';
            this.element.innerHTML = `
                <div class="svgicon-modal__overlay" data-svgicon-overlay></div>
                <div class="svgicon-modal__dialog" role="dialog" aria-modal="true" aria-label="Select icon">
                    <div class="svgicon-modal__header">
                        <h2>Select Icon</h2>
                        <button type="button" class="svgicon-modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="svgicon-modal__controls">
                        <label class="svgicon-modal__control">
                            <span>Icon Set</span>
                            <select class="svgicon-modal__select"></select>
                        </label>
                        <label class="svgicon-modal__control svgicon-modal__control--search">
                            <span>Search</span>
                            <input type="search" class="svgicon-modal__search" placeholder="Search icons" autocomplete="off" />
                        </label>
                    </div>
                    <div class="svgicon-modal__grid" data-svgicon-grid></div>
                    <div class="svgicon-modal__footer" data-svgicon-footer></div>
                </div>`;

            this.overlay = this.element.querySelector('[data-svgicon-overlay]');
            this.closeButton = this.element.querySelector('.svgicon-modal__close');
            this.setSelect = this.element.querySelector('.svgicon-modal__select');
            this.searchInput = this.element.querySelector('.svgicon-modal__search');
            this.grid = this.element.querySelector('[data-svgicon-grid]');
            this.footer = this.element.querySelector('[data-svgicon-footer]');

            this.status = document.createElement('div');
            this.status.className = 'svgicon-modal__status';
            this.status.style.display = 'none';
            this.grid.appendChild(this.status);

            this.sentinel = document.createElement('div');
            this.sentinel.className = 'svgicon-modal__sentinel';
            this.grid.appendChild(this.sentinel);

            this.closeButton.addEventListener('click', () => this.close());
            this.overlay.addEventListener('click', () => this.close());

            this.setSelect.addEventListener('change', () => {
                this.activeSet = this.setSelect.value;
                this.loadIcons({ reset: true });
            });

            this.searchInput.addEventListener('input', () => {
                clearTimeout(this.debounceHandle);
                this.debounceHandle = setTimeout(() => {
                    this.searchQuery = this.searchInput.value.trim();
                    this.loadIcons({ reset: true });
                }, 250);
            });

            this._handleKeydown = this._handleKeydown.bind(this);
        }

        open(field) {
            this.activeField = field;
            this.baseUrl = field.baseUrl;
            this.api.setEndpoint(field.endpoint);
            this.allowedSets = field.allowedSets || [];

            const selection = field.getSelection();
            this.searchQuery = '';
            this.searchInput.value = '';

            // Reset sets loaded if allowed sets changed
            this.setsLoaded = false;

            this.ensureModalInDOM();

            this.fetchAndRender(selection)
                .catch((error) => {
                    console.error('Failed to load icons', error);
                    this.showStatus('Unable to load icons.', 'error');
                });
        }

        async fetchAndRender(selection) {
            this.showStatus('Loading icon catalog...', 'loading');

            const sets = await this.api.getSets();
            this.populateSets(sets);
            this.setsLoaded = true;

            this.activeSet = this.resolveSet(selection.set);
            this.setSelect.value = this.activeSet;
            this.activeIcon = selection.icon;

            this.loadIcons({ reset: true }).catch((error) => {
                console.error('Failed to load icons', error);
                this.showStatus('Unable to load icons.', 'error');
            });
        }

        ensureModalInDOM() {
            document.body.appendChild(this.element);
            requestAnimationFrame(() => {
                this.element.classList.add('is-open');
            });
            document.addEventListener('keydown', this._handleKeydown, true);
        }

        close() {
            this.element.classList.remove('is-open');
            document.removeEventListener('keydown', this._handleKeydown, true);
            setTimeout(() => {
                if (this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }, 150);

            this.detachObserver();
            this.activeField = null;
            this.activeIcon = null;
            this.icons = [];
        }

        _handleKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
            }
        }

        resolveSet(set) {
            const options = Array.from(this.setSelect.options).map((option) => option.value);
            if (set && options.includes(set)) {
                return set;
            }

            return options.length ? options[0] : 'tabler';
        }

        populateSets(sets) {
            this.setSelect.innerHTML = '';

            // Filter sets if allowed_sets is specified
            let filteredSets = sets;
            if (this.allowedSets && this.allowedSets.length > 0) {
                filteredSets = sets.filter((set) => this.allowedSets.includes(set.id));
            }

            filteredSets.forEach((set) => {
                const option = document.createElement('option');
                option.value = set.id;
                const label = set.count !== undefined ? `${set.name} (${set.count})` : set.name;
                option.textContent = label;
                this.setSelect.appendChild(option);
            });
        }

        async loadIcons({ reset = false } = {}) {
            if (this.loading) {
                return;
            }

            this.loading = true;

            if (reset) {
                this.detachObserver();
                this.grid.innerHTML = '';
                this.grid.appendChild(this.status);
                this.grid.appendChild(this.sentinel);
                this.icons = [];
                this.offset = 0;
                this.total = 0;
                this.loaded = 0;
                this.showStatus('Loading icons...', 'loading');
            } else {
                this.showStatus('Loading more icons...', 'loading');
            }

            try {
                const response = await this.api.getIcons({
                    set: this.activeSet,
                    offset: this.offset,
                    limit: this.pageSize,
                    search: this.searchQuery
                });

                if (response.sets && !this.setsLoaded) {
                    this.populateSets(response.sets);
                    this.setsLoaded = true;
                }

                this.activeSet = response.set;
                this.setSelect.value = this.activeSet;

                this.total = response.total || 0;
                const icons = response.icons || [];

                if (reset) {
                    this.icons = icons;
                } else {
                    this.icons = this.icons.concat(icons);
                }

                this.renderIcons(icons, reset);

                this.offset = response.offset + icons.length;
                this.loaded = this.icons.length;

                this.updateFooter();

                if (this.loaded < this.total) {
                    this.attachObserver();
                    this.showStatus('', '');
                } else if (this.total === 0) {
                    this.showStatus('No icons found.', 'empty');
                } else {
                    this.showStatus('', '');
                }
            } catch (error) {
                console.error('Failed to fetch icons', error);
                this.showStatus('Unable to load icons.', 'error');
            } finally {
                this.loading = false;
            }
        }

        renderIcons(newIcons, reset) {
            if (reset) {
                this.grid.innerHTML = '';
                this.grid.appendChild(this.status);
                this.grid.appendChild(this.sentinel);
            }

            if (!newIcons.length && this.loaded === 0) {
                return;
            }

            const fragment = document.createDocumentFragment();
            const base = this.baseUrl.replace(/\/+$/, '');
            const selectedValue = this.activeField?.getValue();

            newIcons.forEach((item) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'svgicon-modal__icon';
                button.dataset.value = item.value;
                button.dataset.icon = item.name;

                if (selectedValue && selectedValue === item.value) {
                    button.classList.add('is-selected');
                }

                const src = `${base}/${item.value}`;
                const label = escapeHtml(item.name);

                button.innerHTML = `
                    <span class="svgicon-modal__icon-preview">
                        <img src="${src}" alt="${label}" loading="lazy" />
                    </span>
                    <span class="svgicon-modal__icon-label">${label}</span>`;

                button.addEventListener('click', () => {
                    if (this.activeField) {
                        this.activeIcon = item.name;
                        this.activeField.setValue(item.value);
                    }
                    this.close();
                });

                fragment.appendChild(button);
            });

            this.grid.insertBefore(fragment, this.sentinel);
        }

        attachObserver() {
            if (this.observer) {
                return;
            }

            this.observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !this.loading && this.loaded < this.total) {
                        this.loadIcons();
                    }
                });
            }, {
                root: this.grid,
                threshold: 0.1
            });

            this.observer.observe(this.sentinel);
        }

        detachObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }

        updateFooter() {
            if (this.total === 0) {
                this.footer.textContent = '';
                return;
            }

            const displayed = Math.min(this.loaded, this.total);
            if (displayed >= this.total) {
                this.footer.textContent = `Showing ${displayed} of ${this.total}`;
            } else {
                this.footer.textContent = `Showing ${displayed} of ${this.total}. Scroll to load more.`;
            }
        }

        showStatus(message, state) {
            if (!this.status) {
                return;
            }

            this.status.textContent = message;
            this.status.className = 'svgicon-modal__status';
            if (state) {
                this.status.classList.add(`svgicon-modal__status--${state}`);
            }

            this.status.style.display = message ? 'block' : 'none';
        }
    }

    class SvgIconField {
        constructor(container) {
            this.container = container;
            this.input = container.querySelector('[data-svgicon-input]');
            this.preview = container.querySelector('[data-svgicon-preview]');
            this.chooseButton = container.querySelector('[data-svgicon-choose]');
            this.clearButton = container.querySelector('[data-svgicon-clear]');
            this.placeholder = container.dataset.placeholder || 'No icon selected';
            this.defaultSet = container.dataset.defaultSet || 'tabler';
            this.baseUrl = container.dataset.baseUrl || '';
            this.endpoint = container.dataset.endpoint || '';

            // Parse allowed sets from data attribute
            let allowedSets = [];
            try {
                const allowedSetsAttr = container.dataset.allowedSets;
                if (allowedSetsAttr) {
                    allowedSets = JSON.parse(allowedSetsAttr);
                }
            } catch (e) {
                // Ignore parse errors
            }
            this.allowedSets = Array.isArray(allowedSets) ? allowedSets : [];

            this.chooseButton?.addEventListener('click', () => this.openPicker());
            this.clearButton?.addEventListener('click', () => this.clear());
        }

        openPicker() {
            SvgIconModal.getInstance(this.endpoint).open(this);
        }

        getSelection() {
            const value = this.getValue();

            if (!value) {
                return { set: this.defaultSet, icon: '' };
            }

            // Parse value like "tabler/arrow-right.svg" or "heroicons/outline/star.svg"
            const parts = value.split('/');
            const iconWithExt = parts.pop() || '';
            const icon = iconWithExt.replace(/\.svg$/i, '');
            const set = parts.join('/') || this.defaultSet;

            return { set, icon };
        }

        getValue() {
            return (this.input?.value || '').trim();
        }

        setValue(value) {
            if (!this.input) {
                return;
            }

            this.input.value = value;
            const selection = this.getSelection();
            this.container.dataset.selectedSet = selection.set;
            this.container.dataset.selectedIcon = selection.icon;
            this.updatePreview();
            this.triggerChange();
        }

        clear() {
            if (!this.input) {
                return;
            }

            this.input.value = '';
            this.container.dataset.selectedSet = this.defaultSet;
            this.container.dataset.selectedIcon = '';
            this.updatePreview();
            this.triggerChange();
        }

        updatePreview() {
            if (!this.preview) {
                return;
            }

            const value = this.getValue();

            if (!value) {
                this.preview.innerHTML = `<span class="svgicon-field__placeholder">${escapeHtml(this.placeholder)}</span>`;
                if (this.clearButton) {
                    this.clearButton.disabled = true;
                }
                return;
            }

            // Parse value to get set and icon name
            const parts = value.split('/');
            const iconWithExt = parts.pop() || '';
            const icon = iconWithExt.replace(/\.svg$/i, '');
            const set = parts.join('/');
            const base = this.baseUrl.replace(/\/+$/, '');
            const src = `${base}/${value}`;

            // Display as set/icon without extension
            const displayValue = set ? `${set}/${icon}` : icon;

            this.preview.innerHTML = `
                <div class="svgicon-field__preview-display">
                    <span class="svgicon-field__preview-icon"><img src="${src}" alt="${escapeHtml(icon)}" loading="lazy" /></span>
                    <span class="svgicon-field__preview-label">${escapeHtml(displayValue)}</span>
                </div>`;

            if (this.clearButton) {
                this.clearButton.disabled = false;
            }
        }

        triggerChange() {
            if (!this.input) {
                return;
            }

            const changeEvent = new Event('change', { bubbles: true });
            const inputEvent = new Event('input', { bubbles: true });
            this.input.dispatchEvent(changeEvent);
            this.input.dispatchEvent(inputEvent);
        }
    }

    function initialize() {
        const containers = document.querySelectorAll('[data-grav-svgicon-field] .svgicon-field__container');
        containers.forEach((container) => {
            if (!container._svgIconField) {
                const field = new SvgIconField(container);
                field.updatePreview();
                container._svgIconField = field;
            }
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Re-initialize when Grav admin adds new fields dynamically (e.g., in lists)
    document.addEventListener('change', (event) => {
        // Small delay to allow DOM updates
        setTimeout(initialize, 100);
    });

})();
