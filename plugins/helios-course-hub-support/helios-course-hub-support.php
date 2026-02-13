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
    var SCROLL_KEY = 'embedly-scroll-pos';
    var theme = localStorage.getItem('helios-theme') || 'system';
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var cardTheme = isDark ? 'dark' : 'light';

    // Restore scroll position after a theme-triggered reload
    var savedPos = sessionStorage.getItem(SCROLL_KEY);
    if (savedPos !== null) {
        sessionStorage.removeItem(SCROLL_KEY);
        window.addEventListener('load', function() {
            window.scrollTo(0, parseInt(savedPos, 10));
        });
    }

    var embeds = document.querySelectorAll('.embedly-card');
    for (var i = 0; i < embeds.length; i++) {
        embeds[i].setAttribute('data-card-theme', cardTheme);
    }

    // Watch for dark class changes on <html> via MutationObserver,
    // since the Helios theme toggle buttons directly manipulate the
    // class list without dispatching the helios-theme-change event.
    // Only start observing after page has fully loaded, so we skip
    // the initial class mutations during page setup and only react
    // to user-initiated theme toggles.
    if (embeds.length > 0) {
        window.addEventListener('load', function() {
            var observer = new MutationObserver(function() {
                observer.disconnect();
                sessionStorage.setItem(SCROLL_KEY, window.scrollY);
                window.location.reload();
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        });
    }
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
