<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocGridShortcode extends Shortcode
{
    public function init()
    {
        $this->shortcode->getHandlers()->add('doc-grid', function (ShortcodeInterface $sc) {
            $columns = (int) $sc->getParameter('columns', 2);
            $columns = max(1, min(4, $columns)); // Clamp between 1-4

            return $this->twig->processTemplate(
                'shortcodes/doc-grid.html.twig',
                [
                    'columns' => $columns,
                    'content' => $sc->getContent(),
                ]
            );
        });
    }
}
