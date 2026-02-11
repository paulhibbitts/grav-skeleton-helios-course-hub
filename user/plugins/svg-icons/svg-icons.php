<?php

namespace Grav\Plugin;

use Composer\Autoload\ClassLoader;
use Grav\Common\Grav;
use Grav\Common\Plugin;
use Grav\Common\Twig\TwigExtension;
use Grav\Common\Utils;
use Grav\Framework\Psr7\Response;
use RocketTheme\Toolbox\Event\Event;
use RocketTheme\Toolbox\ResourceLocator\UniformResourceLocator;
use Twig\TwigFunction;

/**
 * Class SVGIconsPlugin
 *
 * @package Grav\Plugin
 */
class SVGIconsPlugin extends Plugin
{
    /** @var array|null Cached icon manifest */
    protected static $iconManifest;
    /**
     * @return array
     *
     * The getSubscribedEvents() gives the core a list of events
     *     that the plugin wants to listen to. The key of each
     *     array section is the event that the plugin listens to
     *     and the value (in the form of an array) contains the
     *     callable (or function) as well as the priority. The
     *     higher the number the higher the priority.
     */
    public static function getSubscribedEvents()
    {
        return [
            'onPluginsInitialized'        => [
                ['autoload', 100000], // TODO: Remove when plugin requires Grav >=1.7
                ['onPluginsInitialized', 0]
            ],
            'onTwigInitialized'           => ['onTwigInitialized', 0],
            'onShortcodeHandlers'         => ['onShortcodeHandlers', 0],
            'registerNextGenEditorPlugin' => ['registerNextGenEditorPluginShortcodes', 0],
            'registerEditorProPlugin'     => ['registerEditorProPlugin', 0],
            'onEditorProShortcodeRegister' => ['onEditorProShortcodeRegister', 0],
            'onAssetsInitialized'         => ['onAssetsInitialized', 0],
            'onAdminTwigTemplatePaths'    => ['onAdminTwigTemplatePaths', 0],
        ];
    }

    /**
     * Composer autoload.
     *
     * @return ClassLoader
     */
    public function autoload(): ClassLoader
    {
        return require __DIR__ . '/vendor/autoload.php';
    }

    /**
     * Initialize the plugin
     */
    public function onPluginsInitialized()
    {
        $this->registerIconStreams();

        if ($this->isAdmin()) {
            $this->enable([
                'onPageInitialized' => ['onPageInitialized', 0],
            ]);
        }
    }

    // Access plugin events in this class
    public function onTwigInitialized()
    {
        $twig = $this->grav['twig'];

        $twig->twig()->addFunction(
            new TwigFunction('svg_icon', [$this, 'svgIconFunction'])
        );
    }

    /**
     * Initialize configuration
     */
    public function onShortcodeHandlers()
    {
        $this->grav['shortcode']->registerAllShortcodes(__DIR__ . '/classes/shortcodes');
    }

    public function registerNextGenEditorPluginShortcodes($event) {
        $plugins = $event['plugins'];

        $plugins['js'][]  = 'plugin://svg-icons/nextgen-editor/shortcodes/svg-icons.js';

        $event['plugins']  = $plugins;
        return $event;
    }

    public function registerEditorProPlugin($event) {
        $plugins = $event['plugins'];

        $plugins['js'][] = 'plugin://svg-icons/js/editor-pro-integration.js';

        $event['plugins'] = $plugins;
        return $event;
    }

    public function onEditorProShortcodeRegister($event)
    {
        $shortcodes = $event['shortcodes'];

        $shortcodes[] = [
            'name' => 'svg-icon',
            'title' => 'SVG Icon',
            'description' => 'Insert an SVG icon from various icon sets',
            'type' => 'inline',
            'plugin' => 'svg-icons',
            'category' => 'media',
            'group' => 'SVG Icons',
            'icon' => '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
            'bbcodeAttribute' => 'icon',
            'attributes' => [
                'icon' => [
                    'type' => 'text',
                    'title' => 'Icon Name',
                    'default' => 'star',
                    'required' => true,
                    'placeholder' => 'e.g., star, heart, settings'
                ],
                'set' => [
                    'type' => 'select',
                    'title' => 'Icon Set',
                    'options' => ['tabler', 'heroicons|solid', 'heroicons|outline', 'brands', 'bootstrap', 'lucide', 'iconsax|outline', 'iconsax|bold', 'social'],
                    'default' => 'tabler'
                ],
                'class' => [
                    'type' => 'text',
                    'title' => 'CSS Classes',
                    'default' => 'w-6 h-6',
                    'placeholder' => 'e.g., w-6 h-6 text-primary'
                ]
            ],
            'titleBarAttributes' => ['icon', 'set'],
            'hasContent' => false,
            'cssTemplate' => '',
            'customRenderer' => 'function(blockData, config) {
                // Extract icon name from attributes or params
                let iconName = "";
                let iconSet = "tabler";
                let classes = "";

                if (blockData.attributes) {
                    iconName = blockData.attributes.icon || "";
                    iconSet = blockData.attributes.set || "tabler";
                    classes = blockData.attributes.class || "";
                }

                // Fallback: parse from params string
                if (!iconName && blockData.params) {
                    // Check for BBCode style first: [svg-icon=iconname ...] -> params starts with "=iconname"
                    const bbcodeMatch = blockData.params.match(/^=([^\\s\\]]+)/);
                    if (bbcodeMatch) {
                        iconName = bbcodeMatch[1];
                    } else {
                        const iconMatch = blockData.params.match(/icon\\s*=\\s*["\']([^"\']+)["\']|icon\\s*=\\s*([^\\s\\]]+)/);
                        iconName = iconMatch ? (iconMatch[1] || iconMatch[2]) : "";
                    }

                    const setMatch = blockData.params.match(/set\\s*=\\s*["\']([^"\']+)["\']|set\\s*=\\s*([^\\s\\]]+)/);
                    if (setMatch) {
                        iconSet = setMatch[1] || setMatch[2];
                    }
                }

                // Fallback: parse class from params if not already set
                if (!classes && blockData.params) {
                    const classMatch = blockData.params.match(/class\\s*=\\s*["\']([^"\']+)["\']/);
                    if (classMatch) {
                        classes = classMatch[1];
                    }
                }

                // Check for BBCode style in content [svg-icon=iconname /]
                if (!iconName && blockData.content && !blockData.content.includes(" ") && !blockData.content.includes("<")) {
                    iconName = blockData.content;
                }

                if (!iconName) {
                    return blockData.tagName || "svg-icon";
                }

                // Convert set from pipe notation to path (heroicons|solid -> heroicons/solid)
                const setPath = iconSet.split("|").join("/");

                // Parse Tailwind size classes to get dimensions
                let width = 24;
                let height = 24;

                // Tailwind size mapping (class number * 4 = pixels)
                const sizeMap = {
                    "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24,
                    "7": 28, "8": 32, "9": 36, "10": 40, "11": 44, "12": 48,
                    "14": 56, "16": 64, "20": 80, "24": 96
                };

                const widthMatch = classes.match(/\\bw-(\\d+)\\b/);
                const heightMatch = classes.match(/\\bh-(\\d+)\\b/);

                if (widthMatch && sizeMap[widthMatch[1]]) {
                    width = sizeMap[widthMatch[1]];
                }
                if (heightMatch && sizeMap[heightMatch[1]]) {
                    height = sizeMap[heightMatch[1]];
                }

                // Build the icon URL
                const baseUrl = window.GravAdmin ? window.GravAdmin.config.base_url_simple : "";
                const iconUrl = baseUrl + "/user/plugins/svg-icons/icons/" + setPath + "/" + iconName + ".svg";

                // Use actual size with minimum of 16px for visibility
                const previewSize = Math.max(width, 16);
                const totalSize = previewSize + 4;

                return "<span style=\\"display:inline-block;width:" + totalSize + "px;height:" + totalSize + "px;padding:2px;background:#fff;border-radius:3px;vertical-align:middle;box-sizing:border-box;\\"><span style=\\"display:block;width:" + previewSize + "px;height:" + previewSize + "px;background:url(\'" + iconUrl + "\') center/contain no-repeat;\\"></span></span>";
            }'
        ];

        $event['shortcodes'] = $shortcodes;
        return $event;
    }

    public static function svgIconFunction($path, $classes = null)
    {
        $path = Grav::instance()['locator']->findResource('svgicons://' . $path, true);
        return TwigExtension::svgImageFunction($path, $classes);
    }

    protected function registerIconStreams(): void
    {
        /** @var UniformResourceLocator $locator */
        $locator = $this->grav['locator'];

        // Avoid re-registering paths if svgicons scheme already exists.
        if (method_exists($locator, 'schemeExists') && $locator->schemeExists('svgicons')) {
            return;
        }

        $icon_paths = [];

        $custom_icon_path = $this->config->get('plugins.svg-icons.custom_icon_path');
        if ($custom_icon_path) {
            $icon_paths[] = $custom_icon_path;
        }

        $icon_paths[] = 'plugins://svg-icons/icons/';
        $locator->addPath('svgicons', '', $icon_paths);
    }

    /**
     * Add admin template paths
     */
    public function onAdminTwigTemplatePaths(Event $event): void
    {
        if (!$this->isAdmin()) {
            return;
        }

        $paths = $event['paths'] ?? [];
        $paths[] = __DIR__ . '/templates';
        $event['paths'] = $paths;
    }

    /**
     * Add admin assets
     */
    public function onAssetsInitialized(): void
    {
        if (!$this->isAdmin()) {
            return;
        }

        $assets = $this->grav['assets'];
        $assets->addCss('plugin://svg-icons/css/svgicon-field.css');
        $assets->addJs('plugin://svg-icons/js/svgicon-field.js', [
            'group' => 'bottom',
            'loading' => 'defer',
            'priority' => 120,
        ]);
    }

    /**
     * Handle admin API requests for icon data
     */
    public function onPageInitialized(): void
    {
        if (!$this->isAdmin()) {
            return;
        }

        $uri = $this->grav['uri'];
        $path = trim($uri->path(), '/');
        $adminRoute = trim($this->grav['config']->get('plugins.admin.route', '/admin'), '/');

        if ($path !== $adminRoute . '/svg-icons') {
            return;
        }

        $mode = $uri->query('mode') ?? 'icons';
        $limit = (int)($uri->query('limit') ?? 50);
        $limit = max(1, min($limit, 200));
        $offset = max(0, (int)($uri->query('offset') ?? 0));
        $set = (string)($uri->query('set') ?? 'tabler');
        $search = trim((string)($uri->query('q') ?? ''));

        // Return available sets
        if ($mode === 'sets') {
            $payload = [
                'sets' => $this->getIconSetsList(),
            ];
            $this->jsonResponse($payload);
            return;
        }

        $manifest = $this->getIconManifest();
        $icons = $manifest['icons'] ?? [];

        // Validate set exists
        if (!isset($icons[$set])) {
            $set = array_key_first($icons) ?? $set;
        }

        $setIcons = $icons[$set] ?? [];

        // Apply search filter
        if ($search !== '') {
            $setIcons = array_values(array_filter($setIcons, static function ($icon) use ($search) {
                return stripos($icon, $search) !== false;
            }));
        }

        $total = count($setIcons);
        if ($offset >= $total && $total > 0) {
            $offset = max(0, $total - ($total % $limit));
        }

        $slice = array_slice($setIcons, $offset, $limit);
        $items = array_map(static function ($icon) use ($set) {
            return [
                'name' => $icon,
                'value' => $set . '/' . $icon . '.svg',
            ];
        }, $slice);

        $payload = [
            'set' => $set,
            'icons' => $items,
            'offset' => $offset,
            'limit' => $limit,
            'total' => $total,
        ];

        // Include set metadata on initial load
        if ($offset === 0 && $search === '') {
            $payload['sets'] = $this->getIconSetsList();
        }

        $this->jsonResponse($payload);
    }

    /**
     * Load the pre-built icon manifest
     */
    protected function getIconManifest(): array
    {
        if (self::$iconManifest !== null) {
            return self::$iconManifest;
        }

        $manifestPath = __DIR__ . '/data/icons-manifest.min.json';

        if (!file_exists($manifestPath)) {
            // Fallback to non-minified version
            $manifestPath = __DIR__ . '/data/icons-manifest.json';
        }

        if (!file_exists($manifestPath)) {
            self::$iconManifest = ['sets' => [], 'icons' => []];
            return self::$iconManifest;
        }

        $content = file_get_contents($manifestPath);
        $manifest = json_decode($content, true);

        if (!is_array($manifest)) {
            self::$iconManifest = ['sets' => [], 'icons' => []];
            return self::$iconManifest;
        }

        self::$iconManifest = $manifest;
        return self::$iconManifest;
    }

    /**
     * Get list of icon sets with counts
     */
    protected function getIconSetsList(): array
    {
        $manifest = $this->getIconManifest();
        return $manifest['sets'] ?? [];
    }

    /**
     * Send JSON response and exit
     */
    protected function jsonResponse(array $payload, int $status = 200): void
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            $json = json_encode(['error' => 'Unable to encode response'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $status = 500;
        }

        $response = new Response($status, ['Content-Type' => 'application/json'], $json);
        $this->grav->close($response);
    }
}
