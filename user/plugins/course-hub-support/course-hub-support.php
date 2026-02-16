<?php

namespace Grav\Plugin;

use Grav\Common\Plugin;

class CourseHubSupportPlugin extends Plugin
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
        $js_urls = (array) $this->config->get('plugins.course-hub-support.js_assets', []);

        foreach ($js_urls as $url) {
            if (!empty($url)) {
                $assets->addJs($url, ['loading' => 'defer']);
            }
        }
    }
}
