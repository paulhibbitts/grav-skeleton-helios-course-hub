<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocTabsShortcode extends Shortcode
{
    public function init()
    {
        // Parent: doc-tabs
        $this->shortcode->getHandlers()->add('doc-tabs', function (ShortcodeInterface $sc) {
            $hash = $this->shortcode->getId($sc);

            // Parse sync-labels parameter (handle both "true" string and boolean)
            $syncLabels = $sc->getParameter('sync-labels', false);
            $syncLabels = filter_var($syncLabels, FILTER_VALIDATE_BOOLEAN);

            return $this->twig->processTemplate(
                'shortcodes/doc-tabs.html.twig',
                [
                    'hash' => $hash,
                    'active' => (int) $sc->getParameter('active', 0),
                    'sync_labels' => $syncLabels,
                    'tabs' => $this->shortcode->getStates($hash),
                ]
            );
        });

        // Child: doc-tab
        $this->shortcode->getHandlers()->add('doc-tab', function (ShortcodeInterface $sc) {
            $hash = $this->shortcode->getId($sc->getParent());
            $this->shortcode->setStates($hash, $sc);

            return '';
        });
    }
}
