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
        ]);
    }

    public function onTwigSiteVariables()
    {
        $assets = $this->grav['assets'];

        // Inline JS to set Embedly card theme BEFORE platform.js processes them.
        // Embedly replaces .embedly-card elements with iframes on load, so
        // data-card-theme must be set before platform.js executes.
        $embedly_theme_js = <<<'JS'
(function() {
    var theme = localStorage.getItem('helios-theme') || 'system';
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var cardTheme = isDark ? 'dark' : 'light';

    var embeds = document.querySelectorAll('.embedly-card');
    for (var i = 0; i < embeds.length; i++) {
        embeds[i].setAttribute('data-card-theme', cardTheme);
    }

    window.addEventListener('helios-theme-change', function(e) {
        if (document.querySelectorAll('iframe[src*="embedly"]').length > 0) {
            window.location.reload();
        }
    });
})();
JS;

        $assets->addInlineJs($embedly_theme_js, ['group' => 'bottom', 'position' => 'before']);

        // Add external JS assets (including Embedly platform.js) with defer
        $js_urls = (array) $this->config->get('plugins.helios-course-hub-support.js_assets', []);

        foreach ($js_urls as $entry) {
            $url = $entry['url'] ?? '';
            if (!empty($url)) {
                $assets->addJs($url, ['group' => 'bottom', 'loading' => 'defer']);
            }
        }
    }
}
