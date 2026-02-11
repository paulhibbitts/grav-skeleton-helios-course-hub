<?php
namespace Grav\Theme;

use Grav\Common\Theme;
use Grav\Common\Grav;
use Grav\Common\Page\Page;
use Grav\Common\Page\Pages;
use RocketTheme\Toolbox\Event\Event;

/**
 * Helios Theme
 *
 * A modern, highly configurable documentation theme built on Tailwind CSS 4 and Alpine.js
 */
class Helios extends Theme
{
    /**
     * @return array
     */
    public static function getSubscribedEvents(): array
    {
        return [
            'onThemeInitialized'        => ['onThemeInitialized', 0],
            'onTwigSiteVariables'       => ['onTwigSiteVariables', 0],
            'onTwigTemplatePaths'       => ['onTwigTemplatePaths', 0],
            'onPageInitialized'         => ['onPageInitialized', 0],
            'onPageNotFound'            => ['onPageNotFound', 10],
            'onShortcodeHandlers'       => ['onShortcodeHandlers', 0],
            // Search integration events
            'onYetisearchBuildDocument' => ['onYetisearchBuildDocument', 0],
            'onYetisearchBeforeSearch'  => ['onYetisearchBeforeSearch', 0],
            'onSimpleSearchCollection'  => ['onSimpleSearchCollection', 0],
            // Editor Pro integration events
            'registerEditorProPlugin'       => ['registerEditorProPlugin', 0],
            'onEditorProShortcodeRegister'  => ['onEditorProShortcodeRegister', 0],
        ];
    }

    /**
     * Register theme shortcodes
     */
    public function onShortcodeHandlers(): void
    {
        $this->grav['shortcode']->registerAllShortcodes(__DIR__ . '/classes/shortcodes');
    }

    /**
     * Register Editor Pro plugin assets
     */
    public function registerEditorProPlugin(Event $event): Event
    {
        $plugins = $event['plugins'];

        // Add Helios theme Editor Pro integration CSS
        $plugins['css'][] = 'theme://helios/editor-pro/helios-integration.css';

        $event['plugins'] = $plugins;
        return $event;
    }

    /**
     * Register Helios shortcodes for Editor Pro
     */
    public function onEditorProShortcodeRegister(Event $event): Event
    {
        $shortcodes = $event['shortcodes'];

        // Helios theme shortcodes
        $heliosShortcodes = [
            // Doc Card - styled card box for content
            [
                'name' => 'doc-card',
                'title' => 'Doc Card',
                'description' => 'Display content in a styled card box, optionally as a navigation link',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>',
                'attributes' => [
                    'title' => [
                        'type' => 'text',
                        'title' => 'Card Title',
                        'default' => 'Card Title',
                        'required' => true,
                        'placeholder' => 'Enter card title'
                    ],
                    'icon' => [
                        'type' => 'text',
                        'title' => 'Icon Path',
                        'default' => '',
                        'placeholder' => 'e.g., tabler/star.svg'
                    ],
                    'link' => [
                        'type' => 'text',
                        'title' => 'Link URL',
                        'default' => '',
                        'placeholder' => 'e.g., /docs/getting-started'
                    ]
                ],
                'titleBarAttributes' => ['title'],
                'hasContent' => true
            ],
            // Doc Grid - responsive grid layout for cards
            [
                'name' => 'doc-grid',
                'title' => 'Doc Grid',
                'description' => 'Responsive grid layout for multiple cards',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'layout',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
                'attributes' => [
                    'columns' => [
                        'type' => 'select',
                        'title' => 'Columns',
                        'options' => ['1', '2', '3', '4'],
                        'default' => '2',
                        'required' => true
                    ]
                ],
                'titleBarAttributes' => ['columns'],
                'hasContent' => true,
                'allowedChildren' => ['doc-card'],
                'restrictContent' => false
            ],
            // Doc Tabs - tabbed content container
            [
                'name' => 'doc-tabs',
                'title' => 'Doc Tabs',
                'description' => 'Tabbed content with optional cross-page synchronization',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><path d="M4 6V4a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v2"></path></svg>',
                'attributes' => [
                    'sync-labels' => [
                        'type' => 'checkbox',
                        'title' => 'Sync Tab Labels',
                        'default' => false
                    ],
                    'active' => [
                        'type' => 'number',
                        'title' => 'Active Tab Index',
                        'default' => 0,
                        'min' => 0
                    ]
                ],
                'titleBarAttributes' => ['sync-labels'],
                'hasContent' => true,
                'allowedChildren' => ['doc-tab'],
                'restrictContent' => true,
                'defaultContent' => '[doc-tab title="Tab 1"]\nContent for tab 1\n[/doc-tab]\n[doc-tab title="Tab 2"]\nContent for tab 2\n[/doc-tab]'
            ],
            // Doc Tab - individual tab within doc-tabs (child shortcode)
            [
                'name' => 'doc-tab',
                'title' => 'Doc Tab',
                'description' => 'Individual tab within a Doc Tabs container',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'parentOnly' => true,
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
                'attributes' => [
                    'title' => [
                        'type' => 'text',
                        'title' => 'Tab Title',
                        'default' => 'Tab'
                    ]
                ],
                'titleBarAttributes' => ['title'],
                'hasContent' => true,
                'defaultContent' => 'Tab content here'
            ],
            // Doc Steps - numbered sequential instructions
            [
                'name' => 'doc-steps',
                'title' => 'Doc Steps',
                'description' => 'Numbered step-by-step instructions with visual timeline',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><circle cx="12" cy="5" r="3"></circle><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="19" r="3"></circle></svg>',
                'attributes' => [],
                'titleBarAttributes' => [],
                'hasContent' => true,
                'allowedChildren' => ['doc-step'],
                'restrictContent' => true,
                'defaultContent' => '[doc-step]\nFirst step content\n[/doc-step]\n[doc-step]\nSecond step content\n[/doc-step]'
            ],
            // Doc Step - individual step within doc-steps (child shortcode)
            [
                'name' => 'doc-step',
                'title' => 'Doc Step',
                'description' => 'Individual step within a Doc Steps container',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'parentOnly' => true,
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
                'attributes' => [
                    'title' => [
                        'type' => 'text',
                        'title' => 'Step Title',
                        'default' => ''
                    ]
                ],
                'titleBarAttributes' => ['title'],
                'hasContent' => true,
                'defaultContent' => 'Step content here'
            ],
            // Doc File Tree - visual directory structure
            [
                'name' => 'doc-file-tree',
                'title' => 'Doc File Tree',
                'description' => 'Visual file/directory tree structure',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
                'attributes' => [],
                'titleBarAttributes' => [],
                'hasContent' => true,
                'defaultContent' => '- src/\n    - components/\n        - Header.tsx\n        - Footer.tsx\n    - pages/\n        - index.tsx\n- package.json\n- README.md'
            ],
            // Doc Button - styled button with link, color, and size options
            [
                'name' => 'doc-button',
                'title' => 'Doc Button',
                'description' => 'Styled button with link, color variants, and size options',
                'type' => 'block',
                'plugin' => 'helios',
                'category' => 'documentation',
                'group' => 'Helios Theme',
                'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="2"></rect><line x1="12" y1="12" x2="12" y2="12.01"></line></svg>',
                'attributes' => [
                    'label' => [
                        'type' => 'text',
                        'title' => 'Button Label',
                        'default' => 'Button',
                        'required' => true,
                    ],
                    'link' => [
                        'type' => 'text',
                        'title' => 'Link URL',
                        'default' => '',
                        'placeholder' => '/path or https://...',
                    ],
                    'style' => [
                        'type' => 'select',
                        'title' => 'Style',
                        'options' => ['default', 'bordered'],
                        'default' => 'default',
                    ],
                    'color' => [
                        'type' => 'select',
                        'title' => 'Color',
                        'options' => ['default', 'blue', 'green', 'yellow', 'red', 'purple', 'plain'],
                        'default' => 'default',
                    ],
                    'size' => [
                        'type' => 'select',
                        'title' => 'Size',
                        'options' => ['sm', 'default', 'lg', 'xl'],
                        'default' => 'default',
                    ],
                    'icon-left' => [
                        'type' => 'text',
                        'title' => 'Left Icon',
                        'default' => '',
                        'placeholder' => 'tabler/star.svg',
                    ],
                    'icon-right' => [
                        'type' => 'text',
                        'title' => 'Right Icon',
                        'default' => '',
                        'placeholder' => 'tabler/arrow-right.svg',
                    ],
                    'new-tab' => [
                        'type' => 'checkbox',
                        'title' => 'Open in New Tab',
                        'default' => false,
                    ],
                    'center' => [
                        'type' => 'checkbox',
                        'title' => 'Center Button',
                        'default' => false,
                    ],
                    'classes' => [
                        'type' => 'text',
                        'title' => 'Extra Classes',
                        'default' => '',
                        'placeholder' => 'mt-4 mb-2',
                    ],
                    'data-attr' => [
                        'type' => 'text',
                        'title' => 'Data Attribute',
                        'default' => '',
                    ],
                    'data-val' => [
                        'type' => 'text',
                        'title' => 'Data Value',
                        'default' => '',
                    ],
                ],
                'titleBarAttributes' => ['label', 'style', 'color'],
                'hasContent' => false,
                'defaultContent' => '',
            ]
        ];

        // Add all Helios shortcodes to the registry
        foreach ($heliosShortcodes as $shortcode) {
            $shortcodes[] = $shortcode;
        }

        $event['shortcodes'] = $shortcodes;
        return $event;
    }

    /**
     * Initialize the theme
     */
    public function onThemeInitialized(): void
    {
        // Don't proceed if we are in the admin plugin
        if ($this->isAdmin()) {
            return;
        }
    }

    /**
     * Add Twig variables
     */
    public function onTwigSiteVariables(): void
    {
        $grav = Grav::instance();
        $twig = $grav['twig'];
        $config = $grav['config'];

        // Get theme configuration
        $themeConfig = $config->get('themes.helios');

        // If yetisearch-pro is selected but the plugin is not installed/active, fall back to simplesearch
        if (($themeConfig['search']['provider'] ?? '') === 'yetisearch-pro') {
            if (!$config->get('plugins.yetisearch-pro.enabled')) {
                $themeConfig['search']['provider'] = 'simplesearch';
                $config->set('themes.helios.search.provider', 'simplesearch');
            }
        }

        // Detect HTMX request
        $isHtmxRequest = isset($_SERVER['HTTP_HX_REQUEST']);
        $twig->twig_vars['is_htmx_request'] = $isHtmxRequest;

        // Add theme config to Twig
        $twig->twig_vars['helios'] = $themeConfig;

        // Build navigation tree
        $twig->twig_vars['helios_nav'] = $this->buildNavigationTree();

        // Get version info if versioning is enabled
        if ($themeConfig['versioning']['enabled'] ?? false) {
            $versionInfo = $this->getVersionInfo();
            $twig->twig_vars['helios_version'] = $versionInfo['current'];
            $twig->twig_vars['helios_versions'] = array_column($versionInfo['versions'], 'id');
            $twig->twig_vars['helios_version_info'] = $versionInfo;
        }

        // Add assets
        $this->addAssets();
    }

    /**
     * Add theme template paths
     */
    public function onTwigTemplatePaths(): void
    {
        $this->grav['twig']->twig_paths[] = __DIR__ . '/templates';
    }

    /**
     * Process page for navigation features
     */
    public function onPageInitialized(): void
    {
        $page = $this->grav['page'];

        if (!$page) {
            return;
        }

        // Note: TOC is now handled by page-toc plugin via toc_items() Twig function

        // Get prev/next pages
        $prevNext = $this->getPrevNextPages($page);
        $this->grav['twig']->twig_vars['helios_prev'] = $prevNext['prev'];
        $this->grav['twig']->twig_vars['helios_next'] = $prevNext['next'];

        // Get breadcrumbs
        $this->grav['twig']->twig_vars['helios_breadcrumbs'] = $this->getBreadcrumbs($page);
    }

    /**
     * Handle page not found - try redirecting unversioned URLs to default version
     *
     * When versioning is enabled and redirect_unversioned is true (default),
     * URLs without a version prefix will be checked against the default version.
     * If a matching page exists, redirect to the versioned URL.
     *
     * Example: /basics/installation -> /v3/basics/installation
     */
    public function onPageNotFound(Event $event): void
    {
        $config = $this->grav['config'];

        // Only process if versioning is enabled
        if (!$config->get('themes.helios.versioning.enabled', false)) {
            return;
        }

        // Check if redirect_unversioned is enabled (default: true)
        if (!$config->get('themes.helios.versioning.redirect_unversioned', true)) {
            return;
        }

        $uri = $this->grav['uri'];
        $pages = $this->grav['pages'];

        // Get the current route (without base URL)
        $route = $uri->route();

        // Skip if route is empty or just root
        if (empty($route) || $route === '/') {
            return;
        }

        // Get versioning config
        $rootPath = $config->get('themes.helios.versioning.root', '');
        $defaultVersion = (string) $config->get('themes.helios.versioning.default_version', '');
        $availableVersions = $this->getAvailableVersions();

        if (empty($defaultVersion) || empty($availableVersions)) {
            return;
        }

        // Build the base path for versioned content
        $basePath = $rootPath ? '/' . $rootPath : '';

        // Check if route already starts with base path and adjust
        $pathWithoutBase = $route;
        if ($basePath && strpos($route, $basePath . '/') === 0) {
            $pathWithoutBase = substr($route, strlen($basePath));
        } elseif ($basePath && $route === $basePath) {
            return; // Exact match on base path, nothing to redirect
        }

        // Extract first segment to check if it's already a version
        $segments = explode('/', trim($pathWithoutBase, '/'));
        $firstSegment = $segments[0] ?? '';

        // If the first segment is already a known version, don't redirect
        if (in_array($firstSegment, $availableVersions)) {
            return;
        }

        // Try to find the page with the default version prefix
        $versionedPath = $basePath . '/' . $defaultVersion . $pathWithoutBase;

        // Normalize the path (remove double slashes)
        $versionedPath = preg_replace('#/+#', '/', $versionedPath);

        $targetPage = $pages->find($versionedPath);

        if ($targetPage && $targetPage->routable()) {
            // Found a matching page - redirect to it
            // Use route() not url() to avoid doubling the base URL
            $targetRoute = $targetPage->route();

            // Preserve query string if present
            $queryString = $uri->query();
            if ($queryString) {
                $targetRoute .= '?' . $queryString;
            }

            // Perform 301 permanent redirect
            $this->grav->redirect($targetRoute, 301);
        }
    }

    /**
     * Add CSS and JS assets
     */
    protected function addAssets(): void
    {
        $assets = $this->grav['assets'];
        $config = $this->grav['config'];

        // Add compiled CSS
        $assets->addCss('theme://build/css/site.css', ['priority' => 100]);

        // Add theme JavaScript - MUST load before Alpine so components are registered
        $assets->addJs('theme://js/appearance.js', ['group' => 'bottom']);
        $assets->addJs('theme://js/toc.js', ['group' => 'bottom', 'defer' => true]);
        $assets->addJs('theme://js/search.js', ['group' => 'bottom', 'defer' => true]);
        $assets->addJs('theme://js/doc-tabs.js', ['group' => 'bottom', 'defer' => true]);

        // Add Alpine.js LAST so components are already registered
        $assets->addJs('theme://js/alpine.min.js', ['group' => 'bottom', 'defer' => true]);

        // Add HTMX if enabled
        if ($config->get('themes.helios.htmx.enabled', false)) {
            $assets->addJs('theme://js/htmx.min.js', ['group' => 'bottom', 'defer' => true]);
            $assets->addJs('theme://js/htmx-nav.js', ['group' => 'bottom', 'defer' => true]);
        }
    }

    /**
     * Build navigation tree from pages
     *
     * Version-aware: builds navigation from the correct version root
     */
    protected function buildNavigationTree(): array
    {
        $pages = $this->grav['pages'];
        $config = $this->grav['config'];

        // Get versioning configuration
        $versioningEnabled = $config->get('themes.helios.versioning.enabled', false);
        $rootPath = $config->get('themes.helios.versioning.root', '');
        $mode = $config->get('themes.helios.versioning.mode', 'explicit');

        if ($versioningEnabled) {
            $currentVersion = $this->getCurrentVersion();
            $implicitVersion = (string) $config->get('themes.helios.versioning.current_version',
                $config->get('themes.helios.versioning.default_version'));

            // Determine navigation root based on version and mode
            if ($mode === 'implicit' && $currentVersion === $implicitVersion) {
                // Implicit mode, current version: use root directly (unprefixed content)
                $navRoot = $rootPath ? $pages->find('/' . $rootPath) : $pages->root();
            } else {
                // Explicit version: include version in path
                $versionPath = $rootPath ? '/' . $rootPath . '/' . $currentVersion : '/' . $currentVersion;
                $navRoot = $pages->find($versionPath);
            }
        } else {
            // No versioning: use configured root
            $navRoot = $rootPath ? $pages->find('/' . $rootPath) : $pages->root();
        }

        if (!$navRoot) {
            return [];
        }

        return $this->buildTreeRecursive($navRoot);
    }

    /**
     * Recursively build navigation tree
     */
    protected function buildTreeRecursive(Page $page, int $depth = 0): array
    {
        $nav = [];

        foreach ($page->children()->visible() as $child) {
            $item = [
                'title' => $child->title(),
                'route' => $child->route(),
                'url' => $child->url(),
                'active' => $this->isActivePage($child),
                'parent_active' => $this->isParentActive($child),
                'template' => $child->template(),
                'children' => [],
            ];

            // Check for API endpoint metadata
            if ($child->header()->api ?? false) {
                $item['api'] = $child->header()->api;
            }

            // Check for icon (for chapters/sections)
            if ($child->header()->icon ?? false) {
                $item['icon'] = $child->header()->icon;
            }

            // Recursively get children
            if ($child->children()->visible()->count() > 0) {
                $item['children'] = $this->buildTreeRecursive($child, $depth + 1);
            }

            $nav[] = $item;
        }

        return $nav;
    }

    /**
     * Check if page is the current active page
     */
    protected function isActivePage(Page $page): bool
    {
        $current = $this->grav['page'];
        return $current && $current->route() === $page->route();
    }

    /**
     * Check if page is a parent of current page
     */
    protected function isParentActive(Page $page): bool
    {
        $current = $this->grav['page'];
        if (!$current) {
            return false;
        }

        return strpos($current->route(), $page->route()) === 0;
    }

    /**
     * Get previous and next pages for navigation
     *
     * Uses depth-first traversal to navigate through ALL pages in the hierarchy,
     * not just siblings. This allows pagination to flow: Home -> Getting Started ->
     * Installation -> Configuration -> ... across the entire documentation tree.
     */
    protected function getPrevNextPages(Page $page): array
    {
        $result = ['prev' => null, 'next' => null];

        // Build a flat list of all pages in depth-first order
        $allPages = $this->getAllPagesDepthFirst();

        if (empty($allPages)) {
            return $result;
        }

        // Find the current page index
        $currentRoute = $page->route();
        $currentIndex = null;

        foreach ($allPages as $index => $p) {
            if ($p->route() === $currentRoute) {
                $currentIndex = $index;
                break;
            }
        }

        if ($currentIndex === null) {
            return $result;
        }

        // Get previous page
        if ($currentIndex > 0) {
            $prevPage = $allPages[$currentIndex - 1];
            $result['prev'] = [
                'title' => $prevPage->title(),
                'url' => $prevPage->url(),
            ];
        }

        // Get next page
        if ($currentIndex < count($allPages) - 1) {
            $nextPage = $allPages[$currentIndex + 1];
            $result['next'] = [
                'title' => $nextPage->title(),
                'url' => $nextPage->url(),
            ];
        }

        return $result;
    }

    /**
     * Get all visible, routable pages in depth-first order
     *
     * Respects versioning configuration to start from the correct root.
     */
    protected function getAllPagesDepthFirst(): array
    {
        $pages = $this->grav['pages'];
        $config = $this->grav['config'];

        // Get versioning configuration
        $versioningEnabled = $config->get('themes.helios.versioning.enabled', false);
        $rootPath = $config->get('themes.helios.versioning.root', '');
        $mode = $config->get('themes.helios.versioning.mode', 'explicit');

        if ($versioningEnabled) {
            $currentVersion = $this->getCurrentVersion();
            $implicitVersion = (string) $config->get('themes.helios.versioning.current_version',
                $config->get('themes.helios.versioning.default_version'));

            // Determine navigation root based on version and mode
            if ($mode === 'implicit' && $currentVersion === $implicitVersion) {
                $navRoot = $rootPath ? $pages->find('/' . $rootPath) : $pages->root();
            } else {
                $versionPath = $rootPath ? '/' . $rootPath . '/' . $currentVersion : '/' . $currentVersion;
                $navRoot = $pages->find($versionPath);
            }
        } else {
            $navRoot = $rootPath ? $pages->find('/' . $rootPath) : $pages->root();
        }

        if (!$navRoot) {
            return [];
        }

        $flatList = [];
        $this->collectPagesDepthFirst($navRoot, $flatList);

        return $flatList;
    }

    /**
     * Recursively collect pages in depth-first order
     */
    protected function collectPagesDepthFirst(Page $page, array &$list): void
    {
        // Add current page if it's visible and routable (skip the root itself if it's not routable)
        if ($page->visible() && $page->routable()) {
            $list[] = $page;
        }

        // Recursively process children
        foreach ($page->children()->visible() as $child) {
            $this->collectPagesDepthFirst($child, $list);
        }
    }

    /**
     * Get breadcrumbs for current page
     *
     * Version-aware: stops at version root and uses version root as "home"
     */
    protected function getBreadcrumbs(Page $page): array
    {
        $config = $this->grav['config'];
        $versioningEnabled = $config->get('themes.helios.versioning.enabled', false);

        $breadcrumbs = [];
        $current = $page;
        $homeUrl = $this->grav['base_url'] ?: '/';
        $stopRoute = '/';

        // Determine version root for breadcrumbs
        if ($versioningEnabled) {
            $rootPath = $config->get('themes.helios.versioning.root', '');
            $currentVersion = $this->getCurrentVersion();
            $mode = $config->get('themes.helios.versioning.mode', 'explicit');
            $implicitVersion = (string) $config->get('themes.helios.versioning.current_version',
                $config->get('themes.helios.versioning.default_version'));

            // Determine the version root route
            if ($mode === 'implicit' && $currentVersion === $implicitVersion) {
                // Implicit current version: root is the base path
                $stopRoute = $rootPath ? '/' . $rootPath : '/';
            } else {
                // Explicit version: root includes version
                $stopRoute = $rootPath ? '/' . $rootPath . '/' . $currentVersion : '/' . $currentVersion;
            }
            $homeUrl = ($this->grav['base_url'] ?: '') . $stopRoute;
        }

        // Build breadcrumbs up to the version/site root
        while ($current && $current->route() !== '/' && $current->route() !== $stopRoute) {
            array_unshift($breadcrumbs, [
                'title' => $current->title(),
                'url' => $current->url(),
                'route' => $current->route(),
            ]);
            $current = $current->parent();
        }

        // If we're at the version root, return empty (no breadcrumbs needed)
        if (empty($breadcrumbs)) {
            return [];
        }

        // Add home (version root)
        array_unshift($breadcrumbs, [
            'title' => 'Home',
            'url' => $homeUrl,
            'route' => $stopRoute,
        ]);

        return $breadcrumbs;
    }

    /**
     * Auto-detect version folders from filesystem
     *
     * @return array Sorted list of version identifiers
     */
    protected function detectVersionFolders(): array
    {
        $config = $this->grav['config'];
        $pages = $this->grav['pages'];
        $cache = $this->grav['cache'];

        // Check cache first
        $cacheKey = 'helios.versions';
        $cached = $cache->fetch($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $root = $config->get('themes.helios.versioning.root', '');
        $pattern = $config->get('themes.helios.versioning.version_pattern', '/^v?\d+(\.\d+)*$/');

        // Get the root page
        $rootPage = $root ? $pages->find('/' . $root) : $pages->root();

        if (!$rootPage) {
            return [];
        }

        $versions = [];

        // Don't filter by visible() - version folders may not have numeric prefixes
        foreach ($rootPage->children() as $child) {
            $folderName = $child->folder();
            // Remove ordering prefix (e.g., "01.v1" -> "v1")
            $cleanName = preg_replace('/^\d+\./', '', $folderName);

            if (preg_match($pattern, $cleanName)) {
                $versions[] = $cleanName;
            }
        }

        // Sort versions using natural sorting (v1, v2, v10, not v1, v10, v2)
        usort($versions, 'version_compare');

        // Cache the result for 1 hour
        $cache->save($cacheKey, $versions, 3600);

        return $versions;
    }

    /**
     * Get available versions - either auto-detected or from config
     *
     * @return array
     */
    protected function getAvailableVersions(): array
    {
        $config = $this->grav['config'];

        // Check if auto-detection is enabled
        if ($config->get('themes.helios.versioning.auto_detect', true)) {
            return $this->detectVersionFolders();
        }

        // Fall back to manual configuration
        $versions = $config->get('themes.helios.versioning.versions', []);

        if (is_string($versions)) {
            $versions = array_map('trim', explode(',', $versions));
        }

        return $versions;
    }

    /**
     * Get current documentation version based on mode
     *
     * Supports two modes:
     * - explicit: All versions have prefixes (/v1/..., /v2/...)
     * - implicit: Current version has no prefix (/..., /v1/..., /v2/...)
     *
     * @return string|null
     */
    protected function getCurrentVersion(): ?string
    {
        $page = $this->grav['page'];
        $config = $this->grav['config'];

        if (!$page) {
            return null;
        }

        $mode = $config->get('themes.helios.versioning.mode', 'explicit');
        $root = $config->get('themes.helios.versioning.root', '');
        // Cast to string since YAML may parse numeric versions as integers
        $currentVersion = $config->get('themes.helios.versioning.current_version');
        $currentVersion = $currentVersion !== null ? (string) $currentVersion : null;
        $defaultVersion = (string) $config->get('themes.helios.versioning.default_version');
        $availableVersions = $this->getAvailableVersions();

        $route = $page->route();

        // Build the base path
        $basePath = $root ? '/' . $root : '';

        // Try to extract version from route
        if ($basePath && strpos($route, $basePath . '/') === 0) {
            // Route starts with base path - check what follows
            $relativePath = substr($route, strlen($basePath) + 1);
            $parts = explode('/', $relativePath);
            $potentialVersion = $parts[0] ?? '';

            if (in_array($potentialVersion, $availableVersions)) {
                return $potentialVersion;
            }
        } elseif (!$basePath) {
            // No root folder - check first segment directly
            $parts = explode('/', trim($route, '/'));
            $potentialVersion = $parts[0] ?? '';

            if (in_array($potentialVersion, $availableVersions)) {
                return $potentialVersion;
            }
        }

        // No version found in URL
        // In implicit mode, unprefixed content is the current version
        if ($mode === 'implicit') {
            return $currentVersion ?: $defaultVersion;
        }

        // Default fallback
        return $defaultVersion;
    }

    /**
     * Extract the relative path from a versioned route
     *
     * @param string $route Current page route
     * @param string|null $version Current version
     * @param string $basePath Base path prefix
     * @return string Relative path without version prefix
     */
    protected function extractRelativePath(string $route, ?string $version, string $basePath): string
    {
        // Remove base path
        if ($basePath && strpos($route, $basePath) === 0) {
            $route = substr($route, strlen($basePath));
        }

        // Remove version prefix if present
        if ($version && strpos($route, '/' . $version) === 0) {
            $route = substr($route, strlen('/' . $version));
        }

        return $route ?: '';
    }

    /**
     * Generate URL for a specific version
     *
     * @param string $targetVersion The version to switch to
     * @return string The URL for the target version
     */
    protected function getVersionUrl(string $targetVersion): string
    {
        $page = $this->grav['page'];
        $pages = $this->grav['pages'];
        $config = $this->grav['config'];

        $mode = $config->get('themes.helios.versioning.mode', 'explicit');
        $root = $config->get('themes.helios.versioning.root', '');
        $currentVersion = $this->getCurrentVersion();
        $implicitVersion = (string) $config->get('themes.helios.versioning.current_version',
            $config->get('themes.helios.versioning.default_version'));

        $basePath = $root ? '/' . $root : '';
        $route = $page ? ($page->route() ?? '') : '';

        // Extract the relative path (without version prefix)
        $relativePath = $this->extractRelativePath($route, $currentVersion, $basePath);

        // Build target URL based on mode
        if ($mode === 'implicit' && $targetVersion === $implicitVersion) {
            // Target is the implicit (unprefixed) version
            $targetRoute = $basePath . $relativePath;
        } else {
            // Target is an explicit (prefixed) version
            $targetRoute = $basePath . '/' . $targetVersion . $relativePath;
        }

        // Normalize empty route to root
        if (empty($targetRoute)) {
            $targetRoute = '/';
        }

        // Check if target page exists
        $targetPage = $pages->find($targetRoute);

        if ($targetPage && $targetPage->routable()) {
            return $targetPage->url();
        }

        // Fall back to version root (include base URL for subdirectory installations)
        $baseUrl = $this->grav['base_url'] ?? '';

        if ($mode === 'implicit' && $targetVersion === $implicitVersion) {
            return $baseUrl . ($basePath ?: '/');
        }

        return $baseUrl . $basePath . '/' . $targetVersion;
    }

    /**
     * Get comprehensive version information for templates
     *
     * @return array Version information object
     */
    protected function getVersionInfo(): array
    {
        $config = $this->grav['config'];
        $versions = $this->getAvailableVersions();
        $currentVersion = $this->getCurrentVersion();
        // Cast to string since YAML may parse numeric versions as integers
        $defaultVersion = (string) $config->get('themes.helios.versioning.default_version');
        $labels = $config->get('themes.helios.versioning.labels', []);
        $mode = $config->get('themes.helios.versioning.mode', 'explicit');
        $implicitVersion = (string) $config->get('themes.helios.versioning.current_version', $defaultVersion);

        $versionData = [];

        foreach ($versions as $version) {
            $versionData[] = [
                'id' => $version,
                'label' => $labels[$version] ?? $version,
                'url' => $this->getVersionUrl($version),
                'is_current' => ($version === $currentVersion),
                'is_default' => ($version === $defaultVersion),
                'is_implicit' => ($mode === 'implicit' && $version === $implicitVersion),
            ];
        }

        return [
            'current' => $currentVersion,
            'default' => $defaultVersion,
            'mode' => $mode,
            'versions' => $versionData,
            'count' => count($versionData),
        ];
    }

    /**
     * Clear version detection cache
     */
    public function clearVersionCache(): void
    {
        $cache = $this->grav['cache'];
        $cache->delete('helios.versions');
    }

    /**
     * YetiSearch: Enrich document with version and API frontmatter
     *
     * Adds version facet and API-specific fields for api-endpoint pages
     *
     * @param \RocketTheme\Toolbox\Event\Event $event
     */
    public function onYetisearchBuildDocument(\RocketTheme\Toolbox\Event\Event $event): void
    {
        $config = $this->grav['config'];
        if (!($config->get('themes.helios.versioning.enabled', false))) {
            return;
        }

        /** @var \Grav\Common\Page\Interfaces\PageInterface $page */
        $page = $event['subject'];

        // Extract version from page route
        $version = $this->getVersionFromPage($page);

        if ($version) {
            // Use event->offsetSet to modify the document directly
            $doc = $event['doc'];

            // Add version as a top-level filterable field
            $doc['version'] = $version;
            // Also add to content for searchability
            $doc['content']['version'] = $version;

            // Fix breadcrumbs for versioned content - remove global home and version root
            // so results group by section (e.g., "Getting Started") not version name
            $homeRoute = $config->get('system.home.alias', '');
            $root = $config->get('themes.helios.versioning.root', '');
            $availableVersions = $this->getAvailableVersions();
            $versionRoutes = array_map(function($v) use ($root) {
                return $root ? '/' . $root . '/' . $v : '/' . $v;
            }, $availableVersions);

            $doc = $this->fixDocBreadcrumbs($doc, $homeRoute, $versionRoutes);

            // Also fix breadcrumbs for embedded chunks (they don't get individual events)
            if (!empty($doc['chunks']) && is_array($doc['chunks'])) {
                foreach ($doc['chunks'] as &$chunk) {
                    $chunk = $this->fixDocBreadcrumbs($chunk, $homeRoute, $versionRoutes);
                }
                unset($chunk);
            }

            // Write back to event
            $event['doc'] = $doc;
        }

        // For api-endpoint pages, extract useful API frontmatter
        $header = $page->header();
        if (isset($header->api) && $page->template() === 'api-endpoint') {
            $api = (array)$header->api;
            $apiSearchable = [];

            // Extract key API fields for indexing
            if (!empty($api['method'])) {
                $doc['content']['api_method'] = $api['method'];
                $apiSearchable[] = $api['method'];
            }
            if (!empty($api['path'])) {
                $doc['content']['api_path'] = $api['path'];
                $apiSearchable[] = $api['path'];
            }
            if (!empty($api['description'])) {
                $doc['content']['api_description'] = $api['description'];
                $apiSearchable[] = $api['description'];
            }

            // Extract parameter names and descriptions
            if (!empty($api['parameters']) && is_array($api['parameters'])) {
                $paramTexts = [];
                foreach ($api['parameters'] as $param) {
                    if (is_array($param)) {
                        if (!empty($param['name'])) {
                            $paramTexts[] = $param['name'];
                        }
                        if (!empty($param['description'])) {
                            $paramTexts[] = $param['description'];
                        }
                    }
                }
                if ($paramTexts) {
                    $doc['content']['api_parameters'] = implode(' ', $paramTexts);
                    $apiSearchable = array_merge($apiSearchable, $paramTexts);
                }
            }

            // Extract response code descriptions
            if (!empty($api['response_codes']) && is_array($api['response_codes'])) {
                $responseCodes = [];
                foreach ($api['response_codes'] as $rc) {
                    if (is_array($rc) && !empty($rc['description'])) {
                        $responseCodes[] = $rc['description'];
                    }
                }
                if ($responseCodes) {
                    $doc['content']['api_responses'] = implode(' ', $responseCodes);
                    $apiSearchable = array_merge($apiSearchable, $responseCodes);
                }
            }

            // Append all API-specific text to searchable content
            if ($apiSearchable) {
                $doc['content']['content'] = ($doc['content']['content'] ?? '') . ' ' . implode(' ', $apiSearchable);
            }
        }
    }

    /**
     * YetiSearch: Apply version filter to search queries
     *
     * Note: Version filtering is now handled via the `filter` URL parameter using the
     * new DSL syntax. The search modal passes `filter[version][eqor]=v3` which the
     * YetiSearch plugin parses and applies with the =? operator (equals OR empty/null).
     * This allows unversioned pages (like /privacy) to appear in all version contexts.
     *
     * This event handler is kept for backward compatibility with any code that might
     * still pass the legacy `version` parameter directly without using the filter syntax.
     *
     * @param \RocketTheme\Toolbox\Event\Event $event
     */
    public function onYetisearchBeforeSearch(\RocketTheme\Toolbox\Event\Event $event): Event
    {
        $config = $this->grav['config'];
        if (!($config->get('themes.helios.versioning.enabled', false))) {
            return $event;
        }

        $uri = $this->grav['uri'];

        // Check if version is passed via legacy parameter (not via filter syntax)
        // The filter syntax is now preferred: ?filter[version][eqor]=v3
        $versionParam = $uri->param('version') ?: $uri->query('version');
        $filterParam = $uri->param('filter') ?: $uri->query('filter');

        // Only apply legacy handling if version param is used WITHOUT the new filter syntax
        // This prevents duplicate filters when filter[version][eqor] is already used
        if ($versionParam && !$filterParam) {
            $filters = $event['filters'];
            // Use =? operator to include unversioned pages (equals value OR empty/null)
            $filters[] = ['field' => 'version', 'value' => $versionParam, 'operator' => '=?'];
            $event['filters'] = $filters;
        }
        return $event;
    }

    /**
     * SimpleSearch: Filter collection to current version
     *
     * @param \RocketTheme\Toolbox\Event\Event $event
     */
    public function onSimpleSearchCollection(\RocketTheme\Toolbox\Event\Event $event): void
    {
        $config = $this->grav['config'];
        if (!($config->get('themes.helios.versioning.enabled', false))) {
            return;
        }

        /** @var \Grav\Common\Page\Collection $collection */
        $collection = $event['collection'];

        // Get the current version from the referring page or current context
        $currentVersion = $this->getCurrentVersionFromRequest();
        if (!$currentVersion) {
            return;
        }

        $mode = $config->get('themes.helios.versioning.mode', 'explicit');
        $rootPath = $config->get('themes.helios.versioning.root', '');
        $implicitVersion = (string) $config->get('themes.helios.versioning.current_version',
            $config->get('themes.helios.versioning.default_version'));

        // Build the version prefix to filter on
        if ($mode === 'implicit' && $currentVersion === $implicitVersion) {
            // For implicit current version, we need to exclude other version prefixes
            $availableVersions = $this->getAvailableVersions();
            foreach ($collection as $page) {
                $route = $page->route();
                foreach ($availableVersions as $version) {
                    if ($version !== $implicitVersion) {
                        $versionPrefix = $rootPath ? '/' . $rootPath . '/' . $version : '/' . $version;
                        if (strpos($route, $versionPrefix) === 0) {
                            $collection->remove($page);
                            break;
                        }
                    }
                }
            }
        } else {
            // For explicit versions, only include pages under the version prefix
            $versionPrefix = $rootPath ? '/' . $rootPath . '/' . $currentVersion : '/' . $currentVersion;
            foreach ($collection as $page) {
                $route = $page->route();
                if (strpos($route, $versionPrefix) !== 0) {
                    $collection->remove($page);
                }
            }
        }
    }

    /**
     * Fix breadcrumbs for a document by removing the global home and version root
     *
     * @param array $doc The document to fix
     * @param string $homeRoute The configured home route alias
     * @param array $versionRoutes Array of version root routes (e.g., ['/v1', '/v2', '/v3'])
     * @return array The fixed document
     */
    protected function fixDocBreadcrumbs(array $doc, string $homeRoute, array $versionRoutes = []): array
    {
        if (isset($doc['metadata']['breadcrumbs'])) {
            $breadcrumbs = json_decode($doc['metadata']['breadcrumbs'], true);
            if (is_array($breadcrumbs) && count($breadcrumbs) > 1) {
                $firstUrl = $breadcrumbs[0]['url'] ?? '';

                // If the first breadcrumb points to home, remove it
                if ($firstUrl === '/' || $firstUrl === $homeRoute) {
                    array_shift($breadcrumbs);
                }

                // Also remove version root folder so we group by section (e.g., "Getting Started")
                // instead of version name (e.g., "Version 2 Docs")
                if (count($breadcrumbs) > 1) {
                    $firstUrl = $breadcrumbs[0]['url'] ?? '';
                    if (in_array($firstUrl, $versionRoutes, true)) {
                        array_shift($breadcrumbs);
                    }
                }

                $doc['metadata']['breadcrumbs'] = json_encode($breadcrumbs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        }
        return $doc;
    }

    /**
     * Extract version from a page's route
     *
     * @param \Grav\Common\Page\Interfaces\PageInterface $page
     * @return string|null
     */
    protected function getVersionFromPage($page): ?string
    {
        $config = $this->grav['config'];
        $root = $config->get('themes.helios.versioning.root', '');
        $availableVersions = $this->getAvailableVersions();

        $route = $page->route() ?? '';
        $basePath = $root ? '/' . $root : '';

        // Try to extract version from route
        if ($basePath && strpos($route, $basePath . '/') === 0) {
            $relativePath = substr($route, strlen($basePath) + 1);
            $parts = explode('/', $relativePath);
            $potentialVersion = $parts[0] ?? '';

            if (in_array($potentialVersion, $availableVersions)) {
                return $potentialVersion;
            }
        } elseif (!$basePath) {
            $parts = explode('/', trim($route, '/'));
            $potentialVersion = $parts[0] ?? '';

            if (in_array($potentialVersion, $availableVersions)) {
                return $potentialVersion;
            }
        }

        // For implicit mode, content without version prefix is the current version
        $mode = $config->get('themes.helios.versioning.mode', 'explicit');
        if ($mode === 'implicit') {
            $version = $config->get('themes.helios.versioning.current_version',
                $config->get('themes.helios.versioning.default_version'));
            return $version !== null ? (string) $version : null;
        }

        return null;
    }

    /**
     * Get current version from request context (for search filtering)
     *
     * Tries to determine version from referer or session
     *
     * @return string|null
     */
    protected function getCurrentVersionFromRequest(): ?string
    {
        $config = $this->grav['config'];

        // First, try to get from query parameter
        $uri = $this->grav['uri'];
        $versionParam = $uri->param('version') ?: $uri->query('version');
        if ($versionParam) {
            $availableVersions = $this->getAvailableVersions();
            if (in_array($versionParam, $availableVersions)) {
                return $versionParam;
            }
        }

        // Try to extract from referer URL
        $referer = $_SERVER['HTTP_REFERER'] ?? '';
        if ($referer) {
            $refererPath = parse_url($referer, PHP_URL_PATH) ?? '';
            $root = $config->get('themes.helios.versioning.root', '');
            $basePath = $root ? '/' . $root : '';
            $availableVersions = $this->getAvailableVersions();

            if ($basePath && strpos($refererPath, $basePath . '/') !== false) {
                $relativePath = substr($refererPath, strpos($refererPath, $basePath) + strlen($basePath) + 1);
                $parts = explode('/', $relativePath);
                $potentialVersion = $parts[0] ?? '';

                if (in_array($potentialVersion, $availableVersions)) {
                    return $potentialVersion;
                }
            } else {
                // Check without base path
                $parts = explode('/', trim($refererPath, '/'));
                foreach ($parts as $part) {
                    if (in_array($part, $availableVersions)) {
                        return $part;
                    }
                }
            }
        }

        // Fall back to default version
        $defaultVersion = $config->get('themes.helios.versioning.default_version');
        return $defaultVersion !== null ? (string) $defaultVersion : null;
    }
}
