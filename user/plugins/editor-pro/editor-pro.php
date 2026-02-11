<?php
namespace Grav\Plugin;

use Grav\Common\Utils;
use Grav\Common\Plugin;
use Grav\Common\User\Interfaces\UserInterface;
use Grav\Plugin\Admin\Admin;
use RocketTheme\Toolbox\Event\Event;
use Twig\TwigFunction;
use Grav\Common\Helpers\Excerpts;

/**
 * Class EditorProPlugin
 * @package Grav\Plugin
 */
class EditorProPlugin extends Plugin
{
    protected $configs;

    public static function getSubscribedEvents()
    {
        return [
            'onPluginsInitialized' => ['onPluginsInitialized', 10],
            'onAdminListContentEditors' => ['onAdminListContentEditors', 0],
            'onTwigInitialized' => ['onTwigInitialized', 0],
        ];
    }

    /**
     * Initialize the plugin
     */
    public function onPluginsInitialized()
    {
        // Don't proceed if we are in the admin plugin
        if ($this->isAdmin()) {

            $this->getConfigs();
            /** @var UserInterface $user */
            $user = $this->grav['user'];

            if (method_exists($user, 'getContentEditor')) {
                // Preferred 1.7+ FlexUsers approach
                $markdown_editor = $user->getContentEditor();
            } else {
                // Grav 1.6 compatibility
                $markdown_editor = $user->content_editor ?? 'default';
            }

            if (($this->configs['default_for_all'] && $markdown_editor === 'default') || $markdown_editor === 'editor-pro') {
                // Enable the main event we are interested in
                $this->enable([
                    'onAdminTwigTemplatePaths' => ['onAdminTwigTemplatePathsDefaultEditor', -10],
                ]);
            }

            $this->enable([
                'onAssetsInitialized' => ['onAssetsInitialized', 0],
                'onAdminTwigTemplatePaths' => ['onAdminTwigTemplatePathsRegularEditor', 0],
            ]);
        }
    }

    public function getConfigs()
    {
        $this->configs = $this->config->get('plugins.editor-pro');
    }

    public function getAdminRoute()
    {
        return $this->config->get('plugins.admin.route');
    }

    public function onAssetsInitialized()
    {
        if (!$this->isAdmin()) {
            return;
        }

        $assets = $this->grav['assets'];
        $isPages = Utils::startsWith($this->grav['uri']->path(), $this->getAdminRoute() . '/pages/');
        $event = new Event([ 'enabled' => false ]);

        $this->grav->fireEvent('editor-pro.load', $event);

        if ($isPages || $event['enabled']) {
            // Shortcode registration system (do this first to ensure data is available)
            $shortcodes = [];
            $shortcodeEvent = new Event(['shortcodes' => $shortcodes]);
            $this->grav->fireEvent('onEditorProShortcodeRegister', $shortcodeEvent);
            $shortcodes = $shortcodeEvent['shortcodes']; // Get the modified array back

            // Pass shortcode configurations to frontend BEFORE loading main JS
            if (!empty($shortcodes)) {
                $shortcodeJson = json_encode($shortcodes);
                $assets->addInlineJs("window.EditorProShortcodes = $shortcodeJson;", 1);
            } else {
                $assets->addInlineJs("window.EditorProShortcodes = [];", 1);
            }
            
            // Pass plugin status to frontend
            $shortcodeCoreEnabled = $this->grav['config']->get('plugins.shortcode-core.enabled', false);
            $assets->addInlineJs("window.EditorProPluginStatus = { shortcodeCore: " . ($shortcodeCoreEnabled ? 'true' : 'false') . " };", 1);
            
            // Pass extra typography configuration to frontend
            $extraTypography = $this->config->get('plugins.editor-pro.extra_typography', []);
            $extraTypographyJson = json_encode($extraTypography);
            $assets->addInlineJs("window.EditorProExtraTypography = $extraTypographyJson;", 1);
            
            // Add page picker helper
            $assets->addJs('plugin://editor-pro/admin/assets/page-picker.js', 10);

            // Plugin extension system
            $plugins = ['js' => [], 'css' => []];
            $event = new Event(['plugins' => &$plugins]);
            $this->grav->fireEvent('registerEditorProPlugin', $event);

            foreach ($plugins['css'] as $path) {
                $assets->addCss($path);
            }
            foreach ($plugins['js'] as $path) {
                $assets->addJs($path);
            }
        }
    }

    // Custom admin template overriding
    public function onAdminTwigTemplatePathsDefaultEditor($event)
    {
        $event['paths'] = array_merge($event['paths'], [__DIR__ . '/admin/default-editor']);

        return $event;
    }

    public function onAdminTwigTemplatePathsRegularEditor($event)
    {
        $event['paths'] = array_merge($event['paths'], [__DIR__ . '/admin/templates']);

        return $event;
    }

    // New Admin 1.10 event to add a custom editor to the list of available editors
    public function onAdminListContentEditors($event)
    {
        $options = $event['options'];
        $options['editor-pro'] = 'Editor Pro (Modern Block Editor)';
        $event['options']  = $options;
        return $event;
    }

    /**
     * Pre-resolve all image and link paths for Editor Pro using Grav's Excerpts class
     * This avoids the need for AJAX calls during editing
     */
    public function preResolveContentPaths($content, $page = null)
    {
        if (!$page) {
            // Get current admin page if not provided
            $admin = $this->grav['admin'] ?? null;
            if ($admin) {
                $page = $admin->page(true);
                $pages = $admin::enablePages();
                $page = $pages->find($page);
            }
        }

        $pathMappings = [
            'images' => [],
            'links' => []
        ];

        if (!$page) {
            return $pathMappings;
        }


        // Extract all markdown images and links before processing
        // Allow spaces in URL; parse optional title separately to avoid rejecting filenames with spaces
        // Images: ![alt](url "optional title")
        preg_match_all('/!\[([^\]]*)\]\(([^)]+)\)/', $content, $imageMatches, PREG_SET_ORDER);
        // Links: [text](url "optional title") (avoid images with negative lookbehind)
        preg_match_all('/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/', $content, $linkMatches, PREG_SET_ORDER);

        // Fire event to allow plugins to add custom image/link extraction logic
        $event = new Event([
            'content' => $content,
            'page' => $page,
            'imageMatches' => $imageMatches,
            'linkMatches' => $linkMatches
        ]);
        $this->grav->fireEvent('onEditorProExtractPaths', $event);

        // Get modified arrays back from event
        $imageMatches = $event['imageMatches'];
        $linkMatches = $event['linkMatches'];
        
        
        try {
            // Process images
            foreach ($imageMatches as $match) {
                $altText = $match[1];
                // Inner content may be: `url` OR `url "title"`
                $inner = trim($match[2]);
                $urlOnly = $inner;
                $title = '';
                if (preg_match('/^(.*?)(?:\s+"([^"]*)")\s*$/', $inner, $m2)) {
                    $urlOnly = $m2[1];
                    $title = $m2[2] ?? '';
                }
                $originalPath = $urlOnly; // for processing
                
                // Create a temporary HTML img tag to process through Excerpts
                $tempHtml = '<img src="' . htmlspecialchars($originalPath) . '" alt="' . htmlspecialchars($altText) . '" />';
                $processedHtml = Excerpts::processImageHtml($tempHtml, $page);
                
                // Extract the processed src from the result
                if (preg_match('/src="([^"]+)"/', $processedHtml, $srcMatch)) {
                    $resolvedPath = $srcMatch[1];
                    
                    // Ensure frontend URL (remove admin route if present)
                    $adminRoute = $this->config->get('plugins.admin.route', '/admin');
                    if (strpos($resolvedPath, $adminRoute) !== false) {
                        $resolvedPath = str_replace($adminRoute . '/pages', '', $resolvedPath);
                    }
                    
                    // Only store mapping if the resolved path differs from original
                    if ($resolvedPath !== $originalPath) {
                        // Store the complete processed HTML along with extracted paths
                        // Map both the raw URL and the "url \"title\"" variant so lookups succeed
                        $pathMappings['images'][$urlOnly] = [
                            'resolved' => $resolvedPath,
                            'original' => $urlOnly,
                            'html' => $processedHtml  // Store complete HTML from Excerpts
                        ];
                        if ($title !== '') {
                            $fullKey = $urlOnly . ' "' . $title . '"';
                            $pathMappings['images'][$fullKey] = [
                            'resolved' => $resolvedPath,
                            'original' => $fullKey,
                            'html' => $processedHtml  // Store complete HTML from Excerpts
                            ];
                        }
                    }
                    
                }
            }
            
            // Process links
            foreach ($linkMatches as $match) {
                $linkText = $match[1];
                // Inner content may be: `url` OR `url "title"`
                $inner = trim($match[2]);
                $urlOnly = $inner;
                $title = '';
                if (preg_match('/^(.*?)(?:\s+"([^"]*)")\s*$/', $inner, $m2)) {
                    $urlOnly = $m2[1];
                    $title = $m2[2] ?? '';
                }
                $originalPath = $urlOnly;
                
                // Create a temporary HTML a tag to process through Excerpts
                $tempHtml = '<a href="' . htmlspecialchars($originalPath) . '">' . htmlspecialchars($linkText) . '</a>';
                $processedHtml = Excerpts::processLinkHtml($tempHtml, $page);
                
                // Extract the processed href from the result
                if (preg_match('/href="([^"]+)"/', $processedHtml, $hrefMatch)) {
                    $resolvedPath = $hrefMatch[1];
                    
                    // Ensure frontend URL
                    $adminRoute = $this->config->get('plugins.admin.route', '/admin');
                    if (strpos($resolvedPath, $adminRoute) !== false) {
                        $resolvedPath = str_replace($adminRoute . '/pages', '', $resolvedPath);
                    }
                    
                    // Only store mapping if the resolved path differs from original
                    if ($resolvedPath !== $originalPath) {
                        // Store the complete processed HTML along with extracted paths
                        $pathMappings['links'][$urlOnly] = [
                            'resolved' => $resolvedPath,
                            'original' => $urlOnly,
                            'html' => $processedHtml  // Store complete HTML from Excerpts
                        ];
                        if ($title !== '') {
                            $fullKey = $urlOnly . ' "' . $title . '"';
                            $pathMappings['links'][$fullKey] = [
                                'resolved' => $resolvedPath,
                                'original' => $fullKey,
                                'html' => $processedHtml
                            ];
                        }
                    }
                    
                }
            }
            
        } catch (\Exception $e) {
        }

        return $pathMappings;
    }

    /**
     * Get path mappings for a given page's content
     * This method can be called from Twig templates
     */
    public function getPathMappingsForPage($pageRoute = null)
    {
        try {
            // Get the page object
            $admin = $this->grav['admin'] ?? null;
            if (!$admin) {
                return ['images' => [], 'links' => []];
            }
            
            // Enable pages first
            $pages = $admin::enablePages();
            
            if ($pageRoute) {
                $page = $pages->find($pageRoute);
            } else {
                // Get current admin page if not provided
                $page = $admin->page(true);
                if (is_string($page)) {
                    $page = $pages->find($page);
                }
            }
            
            if (!$page) {
                return ['images' => [], 'links' => []];
            }
            
            
            // Get the page content
            $content = $page->rawMarkdown();
            
            // Use the existing preResolveContentPaths method
            $result = $this->preResolveContentPaths($content, $page);
            
            return $result;
            
        } catch (\Exception $e) {
            return ['images' => [], 'links' => []];
        }
    }

    /**
     * Add Twig Functions
     */
    public function onTwigInitialized()
    {
        $twig = $this->grav['twig'];
        $twig->twig()->addFunction(
            new TwigFunction('editor_pro_path_mappings', [$this, 'getPathMappingsForPage'])
        );
    }

}
