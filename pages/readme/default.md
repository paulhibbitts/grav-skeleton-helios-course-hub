---
title: ReadMe
published: true
---

# Grav Helios Course Hub Skeleton

Requires the [Grav Premium Helios theme](https://getgrav.org/premium/helios). This [Grav CMS](https://getgrav.org) skeleton package is designed for creating open and collaborative course companion sites. Supports both single-course and multi-course configurations.

## Features

- Ready-to-use course companion website with the modern Helios theme
- Support for single or multiple courses from one site
- Customizable CSS and JavaScript via the bundled Helios Course Hub plugin
- Built-in shortcodes for embedding content (Google Slides, PDFs, H5P, Embedly)
- Responsive iframe/video containers with 16:9 aspect ratio
- Embedly card support with automatic dark/light theme detection
- Admin panel styling customizations (increased font sizes, Editor Pro toolbar scaling)
- Announcement-style blockquotes with refined heading typography

## Single Course Setup (Default)

This skeleton is pre-configured for a single-course setup — no changes needed. Just start editing your pages:

```
user/pages/
├── 01.home/
├── 02.getting-started/
├── 03.schedule/
├── 04.topics/
├── 05.resources/
└── 06.contact/
```

If switching back from a multi-course setup, make the following changes:
1. Set the site home page to `01.home`
2. For the page `00.home-multicourse` set **Published** to `false`
3. Disable **Versioning** in Helios Theme settings

## Multi-Course Setup

To host multiple courses from one Grav installation, make the following changes:
1. Set the site home page to `00.home-multicourse`
2. For the page `00.home-multicourse` set **Published** to `true`
3. Enable **Versioning** in Helios Theme settings
4. Create versioned course directories (see folder naming below)

```
user/pages/
├── cpt-263/          # Course 1
│   ├── 01.home/
│   ├── 02.modules/
│   ├── 03.schedule/
│   └── ...
├── cpt-363/          # Course 2
│   ├── 01.home/
│   ├── 02.getting-started/
│   ├── 03.schedule/
│   └── ...
└── cpt-463/          # Course 3
    └── ...
```

## Multi-Course Folder Naming

Course version folders must start with one or more letters, followed by a number. An optional hyphen can separate the letters from the number. Additional version segments (separated by dots or hyphens) are supported.

**Valid names:** `course-1`, `course-2`, `course-section-1`, `course-section-2`

**Invalid names:** `01.course` (starts with a digit), `course` (no number), `1course` (starts with a digit)

The simplest convention is `course-1`, `course-2`, `course-3`, etc.

## Course List Page

Multi-course setups include a **Course List** page template (`courselist`) that automatically generates course cards from detected version folders. Each card displays:

- **Title** from the versioning labels in Helios theme settings
- **Icon** from the course root folder frontmatter (`icon` field)
- **Description** from the course root folder frontmatter (`description` field)

To customize a course card, add `icon` and `description` to the frontmatter of the course root folder's markdown file (e.g. `cpt-363-1/default.md`):

```
---
icon: tabler/bulb.svg
description: A basic introduction to UI/UX design.
---
```

The number of cards per row can be set via `cards_per_row` (1–4) in the course list page frontmatter.

## Included Plugin: Helios Course Hub

Custom CSS, JavaScript and shortcodes for the Helios Course Hub theme, plus Admin panel styling.

### Frontend Assets
- **helios.css** — Theme styling (announcement blockquotes, heading typography, Font Awesome spacing, responsive containers)
- **helios.js** — Embedly dark/light theme support with automatic CDN loading

### Admin Assets
- **admin.css** — Increased Admin panel font sizes, Editor Pro toolbar icon scaling
- **admin.js** — Admin panel JavaScript customizations

### Shortcodes
- [raw]`[googleslides url="..."]`[/raw] — Responsive Google Slides embed
- [raw]`[pdf url="..."]`[/raw] — PDF viewer via Google Docs
- [raw]`[h5p url="..."]`[/raw] or [raw]`[h5p id="..."]`[/raw] — H5P interactive content
- [raw]`[embedly url="..."]`[/raw] — Embedly card with dark mode support

### Theme Detection

If the Helios theme is not installed, the plugin automatically falls back to the Quark theme, redirects visitors to the Admin Themes page, and displays a warning banner prompting you to install Helios.

## Requirements

- Grav CMS >= 1.7.0
- Grav Premium Helios Theme
- Shortcode Core plugin >= 5.0.0

## License

MIT — Hibbitts Design

<hr>

Want to no longer display this page on your site?  
Go to **Helios Theme Settings > Appearance**, scroll down to the bottom of the page and delete the **Header Menu** item **ReadMe**.