<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

class DocFileTreeShortcode extends Shortcode
{
    public function init()
    {
        // Use getRawHandlers to process before markdown (preserves whitespace/indentation)
        $this->shortcode->getRawHandlers()->add('doc-file-tree', function (ShortcodeInterface $sc) {
            $content = $sc->getContent() ?? '';

            // Detect content format and parse accordingly
            if (str_contains($content, '<ul>') || str_contains($content, '<li>')) {
                // Parse HTML list structure (markdown already processed)
                $tree = $this->parseHtmlTree($content);
            } elseif ($this->isCliTreeFormat($content)) {
                // Parse CLI tree command output format
                $tree = $this->parseCliTree($content);
            } else {
                // Parse the markdown list into a tree structure
                $tree = $this->parseTree($content);
            }

            return $this->twig->processTemplate(
                'shortcodes/doc-file-tree.html.twig',
                [
                    'tree' => $tree,
                ]
            );
        });
    }

    /**
     * Parse HTML list structure into tree
     */
    private function parseHtmlTree(string $content): array
    {
        $tree = [];

        // Use DOMDocument to parse HTML
        $dom = new \DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML('<div>' . $content . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();

        // Find the root ul element
        $uls = $dom->getElementsByTagName('ul');
        if ($uls->length > 0) {
            $tree = $this->parseHtmlList($uls->item(0));
        }

        return $tree;
    }

    /**
     * Recursively parse HTML ul/li structure
     */
    private function parseHtmlList(\DOMElement $ul): array
    {
        $items = [];

        foreach ($ul->childNodes as $node) {
            if ($node->nodeType !== XML_ELEMENT_NODE || $node->nodeName !== 'li') {
                continue;
            }

            // Get text content (first text node or content before nested ul)
            $textContent = '';
            $nestedUl = null;

            foreach ($node->childNodes as $child) {
                if ($child->nodeType === XML_TEXT_NODE) {
                    $textContent .= $child->textContent;
                } elseif ($child->nodeType === XML_ELEMENT_NODE) {
                    if ($child->nodeName === 'ul') {
                        $nestedUl = $child;
                    } elseif ($child->nodeName === 'strong') {
                        // Handle bold/highlighted items
                        $textContent .= '**' . $child->textContent . '**';
                    } else {
                        $textContent .= $child->textContent;
                    }
                }
            }

            $textContent = trim($textContent);
            if (empty($textContent)) {
                continue;
            }

            $item = $this->parseItem($textContent);

            // Parse nested children
            if ($nestedUl) {
                $item['children'] = $this->parseHtmlList($nestedUl);
            }

            $items[] = $item;
        }

        return $items;
    }

    /**
     * Parse markdown-style list into tree structure
     */
    private function parseTree(string $content): array
    {
        $lines = explode("\n", $content);
        $tree = [];
        $stack = [&$tree];
        $lastIndent = -1;

        foreach ($lines as $line) {
            // Skip empty lines
            if (trim($line) === '') {
                continue;
            }

            // Match list item: captures indent and content
            if (preg_match('/^(\s*)[-*]\s+(.+)$/', $line, $matches)) {
                $indent = strlen($matches[1]);
                $itemContent = trim($matches[2]);

                // Parse the item content
                $item = $this->parseItem($itemContent);

                // Calculate depth (assume 2-space indent)
                $depth = (int)floor($indent / 2);

                // Adjust stack based on depth
                if ($depth > $lastIndent) {
                    // Going deeper - use last item's children
                    if (!empty($tree)) {
                        $lastItem = &$this->getLastItem($stack[count($stack) - 1]);
                        if ($lastItem) {
                            $stack[] = &$lastItem['children'];
                        }
                    }
                } elseif ($depth < $lastIndent) {
                    // Going back up
                    $levelsUp = $lastIndent - $depth;
                    for ($i = 0; $i < $levelsUp && count($stack) > 1; $i++) {
                        array_pop($stack);
                    }
                }

                // Add item to current level
                $stack[count($stack) - 1][] = $item;
                $lastIndent = $depth;
            }
        }

        return $tree;
    }

    /**
     * Check if content appears to be CLI tree command output
     */
    private function isCliTreeFormat(string $content): bool
    {
        // Strip HTML tags first (markdown may have wrapped lines in <p> tags)
        $plainContent = strip_tags($content);
        // Look for characteristic tree command ASCII characters
        // ├── (branch), └── (last branch), │ (vertical line)
        return preg_match('/[├└│]/', $plainContent) === 1;
    }

    /**
     * Parse CLI tree command output into tree structure
     * Handles output from `tree` command with characters like:
     * ├── (branch), └── (last branch), │ (vertical line)
     */
    private function parseCliTree(string $content): array
    {
        // Clean up the content (runs before markdown, so minimal HTML expected)
        $content = trim($content);
        // Normalize line endings
        $content = str_replace("\r\n", "\n", $content);
        $content = str_replace("\r", "\n", $content);

        $lines = explode("\n", $content);
        $tree = [];
        $stack = [['children' => &$tree, 'depth' => -1]];
        $isFirstLine = true;

        foreach ($lines as $line) {
            // Skip empty lines
            if (trim($line) === '') {
                continue;
            }

            $trimmedLine = trim($line);

            // Handle the first line as potential root folder
            // This covers "." from tree command OR custom root like "user/pages/"
            if ($isFirstLine) {
                $isFirstLine = false;

                // Check if first line has NO tree characters (├└│) - it's a root folder
                if (!preg_match('/[├└│]/', $trimmedLine)) {
                    $rootItem = $this->parseItem($trimmedLine);
                    // Ensure it's treated as a directory
                    if ($rootItem['type'] === 'file') {
                        $rootItem['type'] = 'directory';
                        $rootItem['icon'] = 'folder';
                    }
                    $tree[] = $rootItem;
                    // Push root's children onto stack so subsequent items become children
                    $stack[] = ['children' => &$tree[0]['children'], 'depth' => -1];
                    continue;
                }
            }

            // Skip tree summary lines (e.g., "3 directories, 5 files")
            if (preg_match('/^\d+\s+director/', $line)) {
                continue;
            }

            // Calculate depth by finding position of branch character (├ or └)
            // Depth = position / 4 (each tree level is ~4 chars wide)
            $depth = 0;
            $itemContent = $line;

            // Find the branch character position
            $branchPos = false;
            foreach (['├', '└'] as $char) {
                $pos = mb_strpos($line, $char);
                if ($pos !== false && ($branchPos === false || $pos < $branchPos)) {
                    $branchPos = $pos;
                }
            }

            if ($branchPos !== false) {
                // Depth is based on position (each level ~4 chars)
                $depth = (int)floor($branchPos / 4);

                // Extract content after the branch marker and dashes
                // Match: branch char + dashes/hyphens + optional space + content
                $afterBranch = mb_substr($line, $branchPos);
                if (preg_match('/^[├└][─\-]+\s*(.*)$/u', $afterBranch, $matches)) {
                    $itemContent = trim($matches[1]);
                } else {
                    // Fallback: just skip the branch char
                    $itemContent = trim(mb_substr($line, $branchPos + 1));
                }
            } else {
                // No tree structure found, use trimmed content
                $itemContent = trim($line);
            }

            // Skip if no content
            if (empty($itemContent)) {
                continue;
            }

            // Handle symlinks: "name -> target" (also handle HTML-escaped arrows)
            $comment = '';
            // First normalize any HTML-escaped arrows back to plain text
            $itemContent = str_replace(['&gt;', '&lt;', '&amp;'], ['>', '<', '&'], $itemContent);
            if (preg_match('/^(.+?)\s+->\s+(.+)$/', $itemContent, $matches)) {
                $itemContent = $matches[1];
                $comment = '→ ' . $matches[2];
            }

            // Parse the item
            $item = $this->parseItem($itemContent);

            // Override comment if we found a symlink
            if ($comment) {
                $item['comment'] = $comment;
            }

            // Pop stack until we find the right parent level
            while (count($stack) > 1 && $stack[count($stack) - 1]['depth'] >= $depth) {
                array_pop($stack);
            }

            // Add item to current level
            $currentLevel = &$stack[count($stack) - 1]['children'];
            $currentLevel[] = $item;

            // Push this item onto stack for potential children
            $lastKey = array_key_last($currentLevel);
            $stack[] = ['children' => &$currentLevel[$lastKey]['children'], 'depth' => $depth];
        }

        return $tree;
    }

    /**
     * Get reference to last item in array
     */
    private function &getLastItem(array &$arr)
    {
        $lastKey = array_key_last($arr);
        if ($lastKey !== null) {
            return $arr[$lastKey];
        }
        $null = null;
        return $null;
    }

    /**
     * Parse individual item content
     */
    private function parseItem(string $content): array
    {
        $item = [
            'name' => '',
            'type' => 'file',
            'highlight' => false,
            'comment' => '',
            'placeholder' => false,
            'children' => [],
        ];

        // Check for placeholder
        if ($content === '...' || $content === '…') {
            $item['name'] = '...';
            $item['placeholder'] = true;
            return $item;
        }

        // First extract filename vs comment (before checking for trailing /)
        // Check for highlight (bold)
        if (preg_match('/^\*\*(.+?)\*\*(.*)$/', $content, $matches)) {
            $item['highlight'] = true;
            $content = $matches[1];
            $comment = trim($matches[2]);
            if ($comment) {
                $item['comment'] = $comment;
            }
        } elseif (preg_match('/^([^\s]+)\s+(.+)$/', $content, $matches)) {
            // File/folder name with comment
            $content = $matches[1];
            $item['comment'] = $matches[2];
        }

        // Now check for directory (trailing /) after comment extraction
        if (str_ends_with($content, '/')) {
            $item['type'] = 'directory';
            $content = rtrim($content, '/');
        }

        // Check if it's a directory by extension or lack thereof
        if ($item['type'] === 'file') {
            $hasExtension = preg_match('/\.[a-zA-Z0-9]+$/', $content);
            if (!$hasExtension && !str_contains($content, '.')) {
                $item['type'] = 'directory';
            }
        }

        $item['name'] = $content;

        // Determine icon based on file extension
        $item['icon'] = $this->getFileIcon($content, $item['type']);

        return $item;
    }

    /**
     * Get appropriate icon for file type
     */
    private function getFileIcon(string $name, string $type): string
    {
        if ($type === 'directory') {
            return 'folder';
        }

        // Get extension
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        $iconMap = [
            // Config files
            'json' => 'file-code',
            'yaml' => 'file-code',
            'yml' => 'file-code',
            'toml' => 'file-code',
            'xml' => 'file-code',
            'ini' => 'file-settings',

            // JavaScript/TypeScript
            'js' => 'brand-javascript',
            'mjs' => 'brand-javascript',
            'cjs' => 'brand-javascript',
            'ts' => 'brand-typescript',
            'tsx' => 'brand-typescript',
            'jsx' => 'brand-javascript',

            // Web
            'html' => 'brand-html5',
            'htm' => 'brand-html5',
            'css' => 'brand-css3',
            'scss' => 'brand-sass',
            'sass' => 'brand-sass',
            'less' => 'file-code',

            // PHP
            'php' => 'brand-php',
            'twig' => 'template',

            // Python
            'py' => 'brand-python',

            // Markdown/Docs
            'md' => 'markdown',
            'mdx' => 'markdown',
            'txt' => 'file-text',
            'rst' => 'file-text',

            // Images
            'svg' => 'photo',
            'png' => 'photo',
            'jpg' => 'photo',
            'jpeg' => 'photo',
            'gif' => 'photo',
            'webp' => 'photo',
            'ico' => 'photo',

            // Data
            'sql' => 'database',
            'db' => 'database',

            // Shell/Scripts
            'sh' => 'terminal',
            'bash' => 'terminal',
            'zsh' => 'terminal',

            // Git
            'gitignore' => 'git-branch',
            'gitattributes' => 'git-branch',

            // Lock files
            'lock' => 'lock',

            // Env
            'env' => 'settings',
        ];

        // Check for specific filenames
        $nameMap = [
            'package.json' => 'package',
            'composer.json' => 'package',
            'tsconfig.json' => 'brand-typescript',
            'dockerfile' => 'brand-docker',
            'docker-compose.yml' => 'brand-docker',
            '.gitignore' => 'git-branch',
            '.env' => 'settings',
            'readme.md' => 'book',
            'license' => 'license',
        ];

        $lowerName = strtolower($name);
        if (isset($nameMap[$lowerName])) {
            return $nameMap[$lowerName];
        }

        return $iconMap[$ext] ?? 'file';
    }
}
