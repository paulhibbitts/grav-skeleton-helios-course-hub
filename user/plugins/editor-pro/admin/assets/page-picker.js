// Simple page picker for Editor Pro
(function() {
    window.EditorProPagePicker = {
        show: function(currentValue, callback) {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'editor-pro-page-picker-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'editor-pro-page-picker-modal';
            modal.style.cssText = `
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            `;
            
            // Create header
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px;
                border-bottom: 1px solid #e5e5e5;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            header.innerHTML = `
                <h3 style="margin: 0; font-size: 18px;">Select Page</h3>
                <button class="close-btn" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                ">×</button>
            `;
            
            // Create search
            const searchWrapper = document.createElement('div');
            searchWrapper.style.cssText = `
                padding: 20px;
                border-bottom: 1px solid #e5e5e5;
            `;
            searchWrapper.innerHTML = `
                <input type="text" class="page-search" placeholder="Search pages..." style="
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                ">
            `;
            
            // Create content area
            const content = document.createElement('div');
            content.className = 'page-list';
            content.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            `;
            content.innerHTML = '<div class="loading" style="text-align: center; padding: 40px; color: #666;">Loading pages...</div>';
            
            // Assemble modal
            modal.appendChild(header);
            modal.appendChild(searchWrapper);
            modal.appendChild(content);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Close handlers
            const close = () => {
                overlay.remove();
            };
            
            header.querySelector('.close-btn').addEventListener('click', close);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            
            // Fetch pages
            this.fetchAllPages().then(pages => {
                this.renderPageList(content, pages, (route) => {
                    callback(route);
                    close();
                });
                
                // Setup search
                const searchInput = searchWrapper.querySelector('.page-search');
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const filtered = pages.filter(page => 
                        page.title.toLowerCase().includes(term) || 
                        page.route.toLowerCase().includes(term)
                    );
                    this.renderPageList(content, filtered, (route) => {
                        callback(route);
                        close();
                    });
                });
                
                searchInput.focus();
            });
        },
        
        fetchAllPages: function() {
            // First, try to get pages from the admin API

            // Get form data from the current page form
            const form = document.querySelector('form#blueprints');
            let formData = `admin-nonce=${window.GravAdmin.config.admin_nonce}`;
            
            if (form) {
                const formName = form.querySelector('[name="__form-name__"]');
                const formNonce = form.querySelector('[name="form-nonce"]');
                if (formName) formData += `&__form-name__=${formName.value}`;
                if (formNonce) formData += `&form-nonce=${formNonce.value}`;
            }
            
            return fetch(`${window.GravAdmin.config.base_url_relative}/task:listPages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            })
            .then(response => {

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {

                if (data.status === 'success' && data.pages) {
                    return data.pages;
                }
                // Fallback to basic page list

                return this.getBasicPageList();
            })
            .catch((error) => {

                // Fallback to basic page list
                return this.getBasicPageList();
            });
        },
        
        getBasicPageList: function() {
            // Fallback: get pages from the navigation or other sources

            const pages = [];
            
            // Try to get from admin navigation - multiple possible selectors
            const selectors = [
                '.pages-list .page-item a',
                '#pages-filter .page-item a',
                '.admin-pages-list .row a',
                '.pages-list li a'
            ];
            
            for (const selector of selectors) {
                const links = document.querySelectorAll(selector);
                if (links.length > 0) {

                    links.forEach(link => {
                        const href = link.getAttribute('href');
                        if (href && href.includes('/pages/')) {
                            const route = href.replace(/.*\/pages/, '').replace(/\:.*$/, '');
                            const title = link.textContent.trim() || route;
                            if (route && !pages.find(p => p.route === route)) {
                                pages.push({ route, title });
                            }
                        }
                    });
                    break;
                }
            }
            
            // Also check if we're on a page edit form and can get current page info
            const currentPageRoute = document.querySelector('input[name="route"]');
            if (currentPageRoute && currentPageRoute.value) {
                const currentTitle = document.querySelector('input[name="header[title]"]');
                pages.unshift({
                    route: currentPageRoute.value,
                    title: currentTitle ? currentTitle.value : 'Current Page'
                });
            }
            
            // If still no pages found, provide some defaults based on common Grav pages
            if (pages.length === 0) {

                pages.push(
                    { route: '/home', title: 'Home' },
                    { route: '/typography', title: 'Typography' },
                    { route: '/page-inject-test', title: 'Page Inject Test' },
                    { route: '/', title: 'Root' }
                );
            }
            
            return pages;
        },
        
        renderPageList: function(container, pages, onSelect) {
            if (pages.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No pages found</div>';
                return;
            }
            
            const list = document.createElement('div');
            list.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
            
            pages.forEach(page => {
                const item = document.createElement('button');
                item.style.cssText = `
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: #f8f9fa;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    cursor: pointer;
                    text-align: left;
                    width: 100%;
                    transition: all 0.2s;
                `;
                
                item.innerHTML = `
                    <span style="margin-right: 10px;">📄</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; color: #212529;">${page.title}</div>
                        <div style="font-size: 12px; color: #6c757d; font-family: monospace;">${page.route}</div>
                    </div>
                `;
                
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#e9ecef';
                    item.style.borderColor = '#dee2e6';
                });
                
                item.addEventListener('mouseleave', () => {
                    item.style.background = '#f8f9fa';
                    item.style.borderColor = 'transparent';
                });
                
                item.addEventListener('click', () => {
                    onSelect(page.route);
                });
                
                list.appendChild(item);
            });
            
            container.innerHTML = '';
            container.appendChild(list);
        }
    };
})();