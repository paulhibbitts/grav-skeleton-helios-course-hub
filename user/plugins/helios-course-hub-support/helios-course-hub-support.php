<?php

namespace Grav\Plugin;

use Grav\Common\Plugin;

class HeliosCourseHubSupportPlugin extends Plugin
{
    public static function getSubscribedEvents()
    {
        return [
            'onPluginsInitialized' => ['onPluginsInitialized', 0],
        ];
    }

    public function onPluginsInitialized()
    {
        if ($this->isAdmin()) {
            return;
        }

        $this->enable([
            'onTwigSiteVariables' => ['onTwigSiteVariables', 0],
            'onShortcodeHandlers' => ['onShortcodeHandlers', 0],
        ]);
    }

    public function onShortcodeHandlers()
    {
        $this->grav['shortcode']->registerAllShortcodes(__DIR__ . '/shortcodes');
    }

    public function onTwigSiteVariables()
    {
        $assets = $this->grav['assets'];

        // Add inline CSS from config
        $css_inline = $this->config->get('plugins.helios-course-hub-support.css_inline', '');
        if (!empty($css_inline)) {
            $assets->addInlineCss($css_inline);
        }

        // Add inline JS from config (runs before external assets)
        $js_inline = $this->config->get('plugins.helios-course-hub-support.js_inline', '');
        if (!empty($js_inline)) {
            $assets->addInlineJs($js_inline, ['group' => 'bottom', 'position' => 'before']);
        }

        // Add external JS assets with defer
        $js_urls = (array) $this->config->get('plugins.helios-course-hub-support.js_assets', []);

        foreach ($js_urls as $entry) {
            $url = $entry['url'] ?? '';
            if (!empty($url)) {
                $assets->addJs($url, ['group' => 'bottom', 'loading' => 'defer']);
            }
        }
    }
}
