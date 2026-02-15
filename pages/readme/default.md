---
title: ReadMe
published: true
---

# Grav Skeleton Helios Course Hub

This [Grav CMS](https://getgrav.org) skeleton package was built on the [Grav Premium Helios theme](https://getgrav.org/premium/helios) (required), designed for creating open and collaborative course companion sites. Supports both single-course and multi-course configurations.

## Features

- Ready-to-use course companion website with the modern Helios theme
- Support for single or multiple courses from one site
- Customizable CSS and JavaScript via the bundled Helios Course Hub Support plugin
- Built-in shortcodes for embedding content (Google Slides, PDFs, H5P, Embedly)
- Responsive iframe/video containers with 16:9 aspect ratio
- Embedly card support with automatic dark/light theme detection
- Admin panel styling customizations (increased font sizes, Editor Pro toolbar scaling)
- Announcement-style blockquotes with refined heading typography

## Single Course Setup

Use the top-level pages directory for a straightforward single-course site:

```
user/pages/
├── 01.home/
├── 02.getting-started/
├── 03.schedule/
├── 04.topics/
├── 05.resources/
└── 06.contact/
```

## Multi-Course Setup

Use versioned directories to host multiple courses from one Grav installation:

```
user/pages/
├── v1/          # Course 1
│   ├── 01.home/
│   ├── 02.modules/
│   ├── 03.schedule/
│   └── ...
├── v2/          # Course 2
│   ├── 01.home/
│   ├── 02.getting-started/
│   ├── 03.schedule/
│   └── ...
└── v3/          # Course 3
    └── ...
```

## Multi-Course Folder Naming

Course version folders must start with one or more letters, followed by a number. An optional hyphen can separate the letters from the number. Additional version segments (separated by dots or hyphens) are supported.

**Valid names:** `v1`, `v2`, `v3`, `course-1`, `course-2`, `section1.2`, `term-3.1`

**Invalid names:** `01.home` (starts with a digit), `resources` (no number), `1a` (starts with a digit)

The simplest convention is `v1`, `v2`, `v3`, etc.

## Bundled Plugin: Helios Course Hub Support

Custom CSS, JavaScript and shortcodes for the Helios Course Hub theme, plus Admin panel styling.

### Frontend Assets
- **helios.css** — Theme styling (announcement blockquotes, heading typography, Font Awesome spacing, responsive containers)
- **helios.js** — Embedly dark/light theme support with automatic CDN loading

### Admin Assets
- **admin.css** — Increased Admin panel font sizes, Editor Pro toolbar icon scaling
- **admin.js** — Admin panel JavaScript customizations

### Shortcodes
- `[googleslides url="..."]` — Responsive Google Slides embed
- `[pdf url="..."]` — PDF viewer via Google Docs
- `[h5p url="..."]` or `[h5p id="..."]` — H5P interactive content
- `[embedly url="..."]` — Embedly card with dark mode support

## Requirements

- Grav CMS >= 1.7.0
- Shortcode Core plugin >= 5.0.0

## License

MIT — Hibbitts Design
