<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocStepsShortcode extends Shortcode
{
    public function init()
    {
        // Parent: doc-steps
        $this->shortcode->getHandlers()->add('doc-steps', function (ShortcodeInterface $sc) {
            $hash = $this->shortcode->getId($sc);

            return $this->twig->processTemplate(
                'shortcodes/doc-steps.html.twig',
                [
                    'steps' => $this->shortcode->getStates($hash),
                ]
            );
        });

        // Child: doc-step
        $this->shortcode->getHandlers()->add('doc-step', function (ShortcodeInterface $sc) {
            $hash = $this->shortcode->getId($sc->getParent());
            $this->shortcode->setStates($hash, $sc);

            return '';
        });
    }
}
