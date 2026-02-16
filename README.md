# Grav Skeleton Helios Course 

<img width="1425" height="1014" alt="2026-02-15_13-58-55" src="https://github.com/user-attachments/assets/0bd5b8ab-8a29-4114-98fd-d88bd13e4c03" />

Figure 1. Example Grav Helios Course Hub website.

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

The site home page is set to `00.home-multicourse`, and confirm that **published** of `00.home-multicourse` to `true`. The Helios Theme setting for **Versioning** must be enabled.

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
title: Home
icon: tabler/bulb.svg
description: A basic introduction to UI/UX design.
---
```

The number of cards per row can be set via `cards_per_row` (1–4) in the course list page frontmatter.

## Included Plugin: Helios Course Hub Support

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
