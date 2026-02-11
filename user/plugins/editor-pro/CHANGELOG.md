# v1.3.1
## 12/23/2025

1. [](#improved)
    * Add wrap support for code blocks

# v1.3.0
## 12/23/2025

1. [](#new)
    * New **code shortcode block** support (needed for Codesh syntax highlighting plugin)
1. [](#bugfix)
    * Fix for raw shortcodes
    * Fix for white border in dark mode
    * Fix for bbcode syntax not being reliable

# v1.2.1
## 12/08/2025

1. [](#bugfix)
    * Fixed nested bold/italics [519](https://github.com/getgrav/grav-premium-issues/issues/519)
    * Fixed nested ol/ul lists [520](https://github.com/getgrav/grav-premium-issues/issues/520)

# v1.2.0
## 12/08/2025

1. [](#new)
    * Added a new **raw markdown** editor mode

# v1.1.2
## 12/01/2025

1. [](#improved)
    * Added `title` support to images [#514](https://github.com/getgrav/grav-premium-issues/issues/514)

# v1.1.1
## 12/01/2025

1. [](#bugfix)
    * CSS fix for drag-handle overriding Sortable Pages [#516](https://github.com/getgrav/grav-premium-issues/issues/516)

# v1.1.0
## 11/23/2025

1. [](#improved) 
    * Added new `onEditorProExtractPaths` event
    * Improved shortcode dropdown support with label + value options, not just values
    * Improved shortcode dropdown styling

# v1.0.7
## 11/05/2025

1. [](#bugfix)
    * Fixed an issue with images that contain multiple spaces in their names
    * Fixed a z-index issue with drag handles floating over menubar

# v1.0.6
## 11/02/2025

1. [](#improved) 
    * Added a new summary break (delimiter) support in the editor
    * Restructured 'break' features in a dropdown in the toolbar

# v1.0.5
## 10/13/2025

1. [](#bugfix) 
    * Fix for nested shortcode blocks not saving content the first time [#498](https://github.com/getgrav/grav-premium-issues/issues/498)

# v1.0.4
## 08/30/2025

1. [](#bugfix) 
    * Fixed HTML and Twig in code blocks not rendering properly

# v1.0.3
## 08/30/2025

1. [](#bugfix) 
    * Fixed image regression from v1.0.2 that broke image rendering with spaces in filenames

# v1.0.2
## 08/30/2025

1. [](#bugfix) 
    * Fixed greedy regex issue with images breaking image rendering
    * Added support for image 'title' attribute that was breaking image rendering

# v1.0.1
## 08/29/2025

1. [](#improved)
    * Cleaned up console debug errors
    * Fixed duplicate `image` extension causing TipTap warning
1. [](#bugfix)
    * Fixed issue with inline shortcodes removing extra whitespace
    * Fixed issue with adding shortcodes would not self-close , e.g. `[fa icon=foo /]`
    * Fixed bug where updating existing inline shortcodes would save with old values

# v1.0.0
## 08/28/2025

1. [](#new)
    * Initial release....
