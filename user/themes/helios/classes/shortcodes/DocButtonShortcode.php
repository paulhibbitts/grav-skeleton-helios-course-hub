<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocButtonShortcode extends Shortcode
{
    public function init()
    {
        $this->shortcode->getHandlers()->add('doc-button', function (ShortcodeInterface $sc) {
            $label = $sc->getParameter('label', '') ?: trim($sc->getContent());

            return $this->twig->processTemplate(
                'shortcodes/doc-button.html.twig',
                [
                    'link'       => $sc->getParameter('link', ''),
                    'label'      => $label,
                    'style'      => $sc->getParameter('style', 'default'),
                    'color'      => $sc->getParameter('color', 'default'),
                    'size'       => $sc->getParameter('size', 'default'),
                    'icon_left'  => $sc->getParameter('icon-left', ''),
                    'icon_right' => $sc->getParameter('icon-right', ''),
                    'new_tab'    => $sc->getParameter('new-tab', false),
                    'data_attr'  => $sc->getParameter('data-attr', ''),
                    'data_val'   => $sc->getParameter('data-val', ''),
                    'classes'    => $sc->getParameter('classes', ''),
                    'center'     => $sc->getParameter('center', false),
                ]
            );
        });
    }
}
