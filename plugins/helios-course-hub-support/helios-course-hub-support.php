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
            $this->enable([
                'onPageInitialized' => ['onPageInitialized', 0],
            ]);
            return;
        }

        $this->enable([
            'onTwigSiteVariables' => ['onTwigSiteVariables', 0],
            'onShortcodeHandlers' => ['onShortcodeHandlers', 0],
        ]);
    }

    public function onPageInitialized()
    {
        $assets = $this->grav['assets'];
        $path = 'plugin://helios-course-hub-support/assets';

        $assets->addCss("$path/admin.css");
        $assets->addJs("$path/admin.js");
    }

    public function onShortcodeHandlers()
    {
        $shortcodes = $this->grav['shortcode'];
        $dir = __DIR__ . '/shortcodes';

        // Register only .php files to avoid processing .DS_Store
        // or other non-PHP files that macOS may create
        foreach (new \DirectoryIterator($dir) as $file) {
            if ($file->isDot() || $file->isDir() || $file->getExtension() !== 'php') {
                continue;
            }
            $shortcodes->registerShortcode($file->getFilename(), $dir);
        }
    }

    public function onTwigSiteVariables()
    {
        $assets = $this->grav['assets'];
        $path = 'plugin://helios-course-hub-support/assets';

        $assets->addCss("$path/helios.css");
        $assets->addJs("$path/helios.js", ['group' => 'bottom', 'loading' => 'defer']);
    }
}
