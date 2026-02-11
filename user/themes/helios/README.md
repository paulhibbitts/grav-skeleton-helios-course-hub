# Helios - Premium Documentation Theme for Grav

A modern, highly configurable documentation theme built on **Tailwind CSS 4** and **Alpine.js**, designed for both developer documentation (API refs, code examples) and product documentation (user guides, how-tos).

## Features

- **Three-column layout**: Sidebar navigation | Content | On-page TOC
- **Dark/Light mode**: System preference detection + manual toggle
- **Full API documentation**: Endpoint cards, method badges, parameter tables
- **Folder-based versioning**: Support for multiple documentation versions
- **Search integration**: SimpleSearch + YetiSearch-ready with Cmd+K shortcut
- **Code blocks**: Syntax highlighting, copy button, line numbers, language tabs
- **Callout boxes**: Note, Warning, Tip, Info, Danger styles
- **Mobile responsive**: Off-canvas sidebar with touch-friendly navigation
- **Highly customizable**: CSS variables and Tailwind configuration

## Requirements

- Grav CMS 1.7.6+
- PHP 8.0+
- Plugins:
  - `svg-icons` 1.0.0+
  - `shortcode-core` 4.0.0+
  - `simplesearch` 2.0.0+
  - `codesh` 2.0.0+
  - `page-toc` 3.2.0+

## Installation

Install the **Helios** theme via the Grav Admin Panel or via CLI: `bin/gpm install helios`. You must have your license already installed to be able to install this theme.

## Development

Watch for CSS changes:
```bash
npm run dev
```

Build for production:
```bash
npm run prod
```

## Configuration

See `helios.yaml` for all configuration options, or configure via Admin Panel.


```yaml
enabled: true

# Appearance
appearance:
  theme: system                                    # Default theme: system|light|dark
  selector: true                                   # Show theme toggle in header

# Colors - Light Mode
colors:
  primary: '#3B82F6'                               # Primary brand color (blue-500)
  primary_hover: '#2563EB'                         # Primary hover color (blue-600)
  accent: '#8B5CF6'                                # Accent color (violet-500)
  # Dark Mode
  primary_dark: '#60A5FA'                          # Primary color for dark mode (blue-400)
  primary_dark_hover: '#93C5FD'                    # Primary hover for dark mode (blue-300)
  accent_dark: '#A78BFA'                           # Accent color for dark mode (violet-400)
  # Gray Scale
  gray_preset: zinc                                # Gray scale preset: zinc|slate|stone|neutral|gray|custom
  gray_custom: ''                                  # Custom gray scale CSS (used when preset is 'custom')

# Fonts
fonts:
  body: inter                                      # Body font: inter|open-sans|nunito-sans|work-sans|public-sans|ubuntu|poppins|quicksand
  body_size: medium                                # Body font size: small|medium|large
  code: jetbrains-mono                             # Code font: jetbrains-mono
  code_size: medium                                # Code font size: small|medium|large  

# Logo
logo:
  image:                                           # Logo image for light mode (SVG recommended)
  image_dark:                                      # Logo image for dark mode (optional, uses light if not set)
  text: 'Helios Theme'                             # Fallback text if no image
  height: h-8                                      # Logo height class

# Header Menu
header:
  menu: []                                         # List of menu items: [{route: '/path', label: 'Label'}]

# Favicon
custom_favicon:                                    # Path to custom favicon

# Sidebar
sidebar:
  powered_by: true                                 # Show "Powered by Grav" in sidebar footer

# Navigation
navigation:
  sidebar_width: 280                               # Sidebar width in pixels
  toc_width: 240                                   # Table of contents width in pixels
  content_width: 768                               # Max content width in pixels for readability
  toc_start: 2                                     # Start heading level for TOC (1=h1, 2=h2)
  toc_depth: 3                                     # Depth from start level (e.g., 3 = h2,h3,h4 if start=2)
  toc_position: right                              # TOC position: right|left|hidden
  breadcrumbs: true                                # Show breadcrumbs
  prev_next: true                                  # Show prev/next navigation
  scroll_spy: true                                 # Highlight current section in TOC

# Versioning
versioning:
  enabled: false                                   # Enable version switching
  mode: explicit                                   # Mode: 'explicit' (all prefixed) or 'implicit' (current unprefixed)
  auto_detect: true                                # Auto-detect version folders matching pattern
  root:                                            # Root folder for versioned docs (empty = site root)
  versions: []                                     # Manual list of versions (used if auto_detect: false)
  default_version:                                 # Default/latest version to show new visitors
  current_version:                                 # Current version for implicit mode (maps to unprefixed content)
  version_pattern: '/^v?\d+(\.\d+)*$/'             # Regex pattern for version folder detection
  redirect_unversioned: true                       # Redirect URLs without version prefix to default version
  show_badge: true                                 # Show version badge in header
  show_dropdown: true                              # Show version dropdown in sidebar
  labels: {}                                       # Custom labels: {v1: "v1 (Legacy)", v2: "v2 (Stable)"}

# Search
search:
  enabled: true                                    # Enable search
  provider: simplesearch                           # Search provider: simplesearch|yetisearch-pro
  keyboard_shortcut: true                          # Enable keyboard shortcut for search
  shortcut_key: k                                  # Shortcut key (e.g., k, p, s, /)
  placeholder: 'Search documentation...'           # Search input placeholder
  min_chars: 2                                     # Minimum characters before search

# GitHub integration
github:
  enabled: false                                   # Enable GitHub integration
  repo:                                            # Repository in format 'owner/repo'
  branch: main                                     # Branch for edit links
  edit_link: true                                  # Show "Edit on GitHub" link
  edit_text: 'Edit this page'                      # Edit link text
  path_prefix:                                     # Path prefix to strip (e.g., 'user/' for Grav skeletons)

# HTMX Navigation (experimental)
htmx:
  enabled: true                                   # Enable HTMX navigation mode (loads content via XHR)

# Advanced
body_classes:                                      # Additional body classes
append_site_title: true                            # Append site title to page titles
```

## Page Types

### Default (`default.html.twig`)
Standard documentation page with sidebar, content, and TOC.

### Chapter (`chapter.html.twig`)
Section landing page with child page listing.

### API Endpoint (`api-endpoint.html.twig`)
API reference page with method badges, parameters, and examples.

Example frontmatter:
```yaml
title: Create User
template: api-endpoint
api:
  method: POST
  path: /users
  description: Creates a new user account
  parameters:
    - name: email
      type: string
      required: true
      description: User's email address
  request_example: |
    { "email": "user@example.com" }
  response_example: |
    { "id": "usr_123", "email": "user@example.com" }
  response_codes:
    - code: 201
      description: User created successfully
    - code: 400
      description: Invalid request
```

## Customization

### Custom CSS

Add custom styles in `css/custom/` and import in `css/site.css`.

## Support

- Documentation: https://getgrav.org/premium/helios/docs
- Issues: https://github.com/getgrav/grav-premium-issues/labels/helios
- Demo: https://demo.getgrav.org/helios/

## License

This is a premium theme. See https://getgrav.org/premium/license for license details.

---

Built with love by [Trilby Media](https://trilby.media)
