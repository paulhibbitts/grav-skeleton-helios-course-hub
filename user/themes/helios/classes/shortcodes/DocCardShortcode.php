<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocCardShortcode extends Shortcode
{
    public function init()
    {
        $this->shortcode->getHandlers()->add('doc-card', function (ShortcodeInterface $sc) {
            return $this->twig->processTemplate(
                'shortcodes/doc-card.html.twig',
                [
                    'title' => $sc->getParameter('title', ''),
                    'icon' => $sc->getParameter('icon', ''),
                    'link' => $sc->getParameter('link', ''),
                    'content' => $sc->getContent(),
                ]
            );
        });
    }
}
