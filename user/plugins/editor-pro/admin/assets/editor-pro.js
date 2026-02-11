/**
 * Editor Pro - Modern Block Editor for Grav
 * Built on TipTap with content preservation for HTML, Shortcodes, and Twig
 */

(function() {
    'use strict';

    const SUMMARY_DELIMITER_LABEL = 'Summary Break';

    // Utility function to escape HTML entities
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Wait for TipTap to be available
    function waitForTipTap(callback, attempts = 0) {
        if (typeof TiptapCore !== 'undefined' && 
            typeof TiptapStarterKit !== 'undefined' && 
            typeof TiptapTable !== 'undefined' &&
            typeof TiptapUnderline !== 'undefined' &&
            typeof TiptapGitHubAlert !== 'undefined' &&
            typeof marked !== 'undefined') {
            callback();
        } else {
            if (attempts < 50) { // Try for 5 seconds max
                setTimeout(() => waitForTipTap(callback, attempts + 1), 100);
            }
        }
    }

    // Content Preservation System
    class ContentPreserver {
        constructor() {
            this.blockMap = new Map();
            this.blockCounter = 0;
        }
        
        normalizeShortcodeParams(paramString) {
            if (!paramString) return '';

            // First check for BBCode-style syntax (="value" or =value without parameter name)
            // Handles both quoted: ="javascript" and unquoted: =javascript
            const bbcodeQuotedMatch = paramString.match(/^\s*=\s*["']([^"']+)["']\s*$/);
            const bbcodeUnquotedMatch = paramString.match(/^\s*=\s*([^\s"']+)\s*$/);
            if (bbcodeQuotedMatch || bbcodeUnquotedMatch) {
                // Keep BBCode style params as-is for proper handling downstream
                // The value will be extracted from params in title generation
                return paramString.trim();
            }
            
            // Parse the params string and ensure all values are quoted
            // Support hyphens in attribute names (e.g., thumb-options, data-attr)
            const paramRegex = /([\w-]+)=("[^"]*"|'[^']*'|\S+)/g;
            const normalized = paramString.replace(paramRegex, (match, key, value) => {
                // If already quoted, keep as is but convert single to double quotes
                if (value.startsWith('"') || value.startsWith("'")) {
                    if (value.startsWith("'")) {
                        value = '"' + value.slice(1, -1).replace(/"/g, '\\"') + '"';
                    }
                    return `${key}=${value}`;
                }
                // Add quotes to unquoted values
                return `${key}="${value}"`;
            });
            
            // Handle boolean attributes (key without value)
            return normalized.replace(/\b(\w+)(?=\s|$)(?!=)/g, '$1');
        }

        // Extract and preserve special content blocks
        preserveContent(markdown) {
            let processed = markdown;
            this.blockMap.clear();
            this.blockCounter = 0;

            // IMPORTANT: Order matters!
            // 1. Preserve INLINE CODE FIRST - prevents [shortcode] inside backticks from being matched
            // This must run before ANY shortcode processing
            processed = this.preserveInlineCode(processed);

            // 2. Preserve [raw] shortcodes - their content should NEVER be processed
            processed = this.preserveRawShortcodes(processed);

            // 3. Preserve code-type shortcodes (like [codesh])
            // This ensures backticks inside these shortcodes are not converted to placeholders
            processed = this.preserveCodeTypeShortcodes(processed);

            // 4. Preserve FENCED CODE BLOCKS so that HTML/Twig/Shortcodes inside are not touched
            processed = this.preserveFencedCodeBlocks(processed);

            // Then preserve HTML blocks (outside code)
            processed = this.preserveHtml(processed);

            // Then preserve Twig blocks (outside code)
            processed = this.preserveTwig(processed);
            
            // REMOVED: GitHub alerts preservation - let marked.js handle them
            // processed = this.preserveGitHubAlerts(processed);
            
            // Preserve nested shortcodes (outermost first)
            processed = this.preserveShortcodes(processed);
            
            // Preserve Grav image syntax with actions
            processed = this.preserveGravImages(processed);

            return { processed, blocks: this.blockMap };
        }

        // Preserve [raw] shortcodes FIRST - their content should never be processed
        // This handles [raw]...[/raw] and any content inside it as-is
        preserveRawShortcodes(content) {
            let result = content;

            // Match [raw]...[/raw] shortcodes (case insensitive)
            const rawRegex = /\[raw\]([\s\S]*?)\[\/raw\]/gi;

            result = result.replace(rawRegex, (fullMatch, innerContent) => {
                const id = this.generateBlockId();

                // IMPORTANT: Restore any inline code placeholders back to their original form
                // Since inline code is preserved before [raw], we need to restore it
                let restoredContent = innerContent;
                const inlinePlaceholderRegex = /\{\{CODE_INLINE_([^}]+)\}\}/g;
                restoredContent = restoredContent.replace(inlinePlaceholderRegex, (match, placeholderId) => {
                    const blockData = this.blockMap.get(placeholderId);
                    if (blockData && blockData.original) {
                        // Remove the placeholder from blockMap since we're restoring it
                        this.blockMap.delete(placeholderId);
                        return blockData.original;
                    }
                    return match;
                });

                // Reconstruct the original with restored content
                const restoredOriginal = `[raw]${restoredContent}[/raw]`;

                this.blockMap.set(id, {
                    type: 'shortcode',
                    tagName: 'raw',
                    shortcodeName: 'raw',
                    shortcodeType: 'block',
                    params: '',
                    attributes: {},
                    content: restoredContent,  // Store the raw content with inline code restored
                    original: restoredOriginal,
                    isClosing: true,
                    isSelfClosing: false,
                    isBlock: true,
                    isRawShortcode: true  // Flag to identify this special case
                });

                return `{{SHORTCODE_PLACEHOLDER_${id}}}`;
            });

            return result;
        }

        // Preserve code-type shortcodes BEFORE code blocks are processed
        // This ensures backticks inside [codesh] etc. are not converted to placeholders
        preserveCodeTypeShortcodes(content) {
            let result = content;

            // Get the shortcode registry to find code-type shortcodes
            if (!window.EditorPro || !window.EditorPro.getShortcodeRegistry) {
                return result;
            }

            const registry = window.EditorPro.getShortcodeRegistry();
            if (!registry || !registry.shortcodes) {
                return result;
            }

            // Ensure registry is initialized
            if (typeof registry.ensureInitialized === 'function') {
                registry.ensureInitialized();
            }

            // Find all shortcodes with contentType: 'code'
            const codeShortcodes = [];
            registry.shortcodes.forEach((config, name) => {
                if (config.contentType === 'code') {
                    codeShortcodes.push(name);
                }
            });

            if (codeShortcodes.length === 0) {
                return result;
            }

            // Find container shortcodes that allow code-type children
            // We need to skip code-type shortcodes that are inside these containers
            const containerRanges = [];
            registry.shortcodes.forEach((config, name) => {
                if (config.allowedChildren && config.allowedChildren.some(child => codeShortcodes.includes(child))) {
                    // Find all occurrences of this container in the content
                    const containerRegex = new RegExp(
                        `\\[${name}([=\\s][^\\]]*)?\\]([\\s\\S]*?)\\[\\/${name}\\]`,
                        'gi'
                    );
                    let match;
                    while ((match = containerRegex.exec(result)) !== null) {
                        containerRanges.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            name: name
                        });
                    }
                }
            });

            // Helper function to check if an offset is inside a container
            const isInsideContainer = (offset) => {
                return containerRanges.some(range => offset > range.start && offset < range.end);
            };

            // Process each code-type shortcode
            for (const shortcodeName of codeShortcodes) {
                // Match [shortcodeName ...]...[/shortcodeName] with content
                // IMPORTANT: (?!\() negative lookahead prevents matching markdown links like [Codesh](url)
                // Pattern handles: [codesh], [codesh=javascript], [codesh lang=javascript]
                const regex = new RegExp(
                    `\\[${shortcodeName}([=\\s][^\\]]*)?\\](?!\\()([\\s\\S]*?)\\[\\/${shortcodeName}\\]`,
                    'gi'
                );

                result = result.replace(regex, (fullMatch, params, innerContent, offset, fullString) => {
                    // Skip if preceded by backtick (inside inline code like `[codesh]`)
                    if (offset > 0 && fullString[offset - 1] === '`') {
                        return fullMatch;
                    }

                    // Skip if this shortcode is inside a container shortcode (like codesh-group)
                    // Those will be processed when the container is rendered
                    if (isInsideContainer(offset)) {
                        return fullMatch;
                    }

                    const id = this.generateBlockId();

                    // Parse parameters
                    const trimmedParams = (params || '').trim();
                    const attributes = this.parseShortcodeAttributes(trimmedParams);
                    const normalizedParams = this.normalizeShortcodeParams(trimmedParams);

                    // Get config for this shortcode
                    const shortcodeConfig = registry.shortcodes.get(shortcodeName.toLowerCase()) || registry.shortcodes.get(shortcodeName);

                    // Check if this shortcode is on its own line
                    const startOfLine = offset === 0 || result[offset - 1] === '\n';
                    const endPos = offset + fullMatch.length;
                    const endOfLine = endPos >= result.length || result[endPos] === '\n';
                    const onOwnLine = startOfLine && endOfLine;

                    // IMPORTANT: Restore any inline code placeholders back to their original form
                    // This ensures backticks inside code-type shortcodes are preserved
                    let restoredContent = innerContent;
                    const inlinePlaceholderRegex = /\{\{CODE_INLINE_([^}]+)\}\}/g;
                    restoredContent = restoredContent.replace(inlinePlaceholderRegex, (match, placeholderId) => {
                        const blockData = this.blockMap.get(placeholderId);
                        if (blockData && blockData.original) {
                            // Remove the placeholder from blockMap since we're restoring it
                            this.blockMap.delete(placeholderId);
                            return blockData.original;
                        }
                        return match;
                    });

                    this.blockMap.set(id, {
                        type: 'shortcode',
                        tagName: shortcodeName,
                        shortcodeName: shortcodeName,
                        shortcodeType: 'block',
                        params: normalizedParams,
                        attributes: attributes,
                        content: restoredContent, // Preserve inner content with backticks restored
                        codeContent: restoredContent, // Also store as code content
                        contentType: 'code',
                        original: fullMatch,
                        isClosing: true,
                        isSelfClosing: false,
                        isBlock: true,
                        onOwnLine: onOwnLine,
                        language: shortcodeConfig?.language || attributes.lang || 'javascript'
                    });

                    return `{{SHORTCODE_PLACEHOLDER_${id}}}`;
                });
            }

            return result;
        }

        // Preserve inline code FIRST (before code-type shortcodes)
        // This prevents [shortcode] inside backticks from being matched as shortcodes
        preserveInlineCode(content) {
            let result = content;

            // Preserve inline code (`)
            // Use negative lookahead to avoid matching ```
            // Also don't match across newlines - inline code should be on one line
            const inlineCodeRegex = /`(?!``)([^`\n]+)`/g;
            result = result.replace(inlineCodeRegex, (match, code) => {
                const id = this.generateBlockId();

                this.blockMap.set(id, {
                    type: 'code_inline',
                    content: code,
                    original: match,
                    isBlock: false,
                    isInline: true
                });
                return `{{CODE_INLINE_${id}}}`;
            });

            return result;
        }

        // Preserve fenced code blocks (after code-type shortcodes)
        preserveFencedCodeBlocks(content) {
            let result = content;

            // Preserve fenced code blocks (```)
            // Updated regex to be more flexible with language identifier and whitespace
            const fencedCodeRegex = /```(\w*)\s*\n([\s\S]*?)```/gm;
            result = result.replace(fencedCodeRegex, (match, language, code) => {
                const id = this.generateBlockId();

                this.blockMap.set(id, {
                    type: 'code_block',
                    language: language || '',
                    content: code,
                    original: match,
                    isBlock: true,
                    isFenced: true
                });
                return `{{CODE_BLOCK_${id}}}`;
            });

            return result;
        }

        // Legacy method for backwards compatibility
        preserveCodeBlocks(content) {
            let result = this.preserveInlineCode(content);
            result = this.preserveFencedCodeBlocks(result);
            return result;
        }

        preserveGitHubAlerts(content) {
            // Match GitHub alert blocks
            const alertRegex = /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:^>.*\n?)*)/gm;
            
            return content.replace(alertRegex, (match, alertType, alertContent) => {
                const id = this.generateBlockId();
                
                // Extract the content without the > prefix
                const contentLines = alertContent.split('\n')
                    .filter(line => line.trim())
                    .map(line => line.replace(/^>\s?/, ''));
                const cleanContent = contentLines.join('\n');
                
                this.blockMap.set(id, {
                    type: 'github-alert',
                    alertType: alertType.toLowerCase(),
                    content: cleanContent,
                    original: match,
                    isBlock: true
                });
                
                return `{{GITHUB_ALERT_${id}}}`;
            });
        }

        preserveShortcodes(content) {
            // First, handle markdown links with embedded shortcodes specially
            // Pattern: [<shortcode>text</shortcode>more text](url)
            const markdownLinkWithShortcodeRegex = /\[([^\]]*\[[^\]]+\][^\]]*)\]\(([^)]+)\)/g;
            let match;
            while ((match = markdownLinkWithShortcodeRegex.exec(content)) !== null) {

            }
            
            content = content.replace(markdownLinkWithShortcodeRegex, (match, linkText, url) => {
                // Process shortcodes within the link text

                const processedLinkText = this.preserveShortcodesRecursive(linkText);

                // Return the markdown link with processed link text
                return `[${processedLinkText}](${url})`;
            });
            
            // Then recursively process remaining shortcodes
            return this.preserveShortcodesRecursive(content);
        }

        preserveShortcodesRecursive(content) {
            let processed = content;
            let hasMatches = false;
            
            // Now handle self-closing shortcodes [shortcode /] or [shortcode params /]
            // Use .*? to match any params, stopping at the closing /]
            const selfClosingRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)\s*(.*?)\s*\/\]/g;
            processed = processed.replace(selfClosingRegex, (fullMatch, tagName, params, offset, fullString) => {
                // Check if this looks like a markdown link instead of a shortcode
                // A markdown link would be [text](url) - check if there's a ( right after the ]
                const afterMatch = fullString.substring(offset + fullMatch.length);
                if (afterMatch.startsWith('(') && !params.includes('=')) {
                    // This looks more like a markdown link than a shortcode
                    return fullMatch;
                }
                
                hasMatches = true;
                const id = this.generateBlockId();

                // Determine shortcode type
                let shortcodeType = 'inline'; // Default self-closing to inline
                
                // Check registry first
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const shortcodeConfig = registry.get(tagName);
                        if (shortcodeConfig && shortcodeConfig.type) {
                            shortcodeType = shortcodeConfig.type;
                        }
                    }
                }
                
                // Parse attributes
                const attributes = this.parseShortcodeAttributes(params);
                const normalizedParams = this.normalizeShortcodeParams(params.trim());
                
                // Check if this shortcode is on its own line
                const startOfLine = offset === 0 || fullString[offset - 1] === '\n';
                const endOfLine = (offset + fullMatch.length >= fullString.length) || fullString[offset + fullMatch.length] === '\n';
                const onOwnLine = startOfLine && endOfLine;
                
                this.blockMap.set(id, {
                    type: 'shortcode',
                    tagName: tagName,
                    shortcodeName: tagName,
                    shortcodeType: shortcodeType,
                    params: normalizedParams,
                    attributes: attributes,
                    content: '',
                    original: fullMatch,
                    isClosing: false,
                    isSelfClosing: true,
                    isBlock: shortcodeType === 'block',
                    onOwnLine: onOwnLine  // Store this info for later use
                });
                
                return `{{SHORTCODE_PLACEHOLDER_${id}}}`;
            });
            
            // Then handle paired shortcodes [shortcode]content[/shortcode]
            const pairedRegex = /\[([a-zA-Z][a-zA-Z0-9_-]*)\s*([^\]]*?)\]([\s\S]*?)\[\/\1\]/g;
            processed = processed.replace(pairedRegex, (fullMatch, tagName, params, innerContent, offset, fullString) => {
                // Check if this looks like a markdown link instead of a shortcode
                // Look for patterns like [text](url) where the text happens to match our regex
                const afterMatch = fullString.substring(offset + fullMatch.length);
                if (afterMatch.startsWith('(')) {
                    // This might be a markdown link - but check if it has shortcode-like params
                    if (!params.includes('=')) {
                        // No equals sign in params, probably just markdown link text
                        return fullMatch;
                    }
                }
                
                hasMatches = true;
                const id = this.generateBlockId();
                
                // Determine shortcode type
                let shortcodeType = 'block'; // Default fallback
                
                // Check registry first
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const shortcodeConfig = registry.get(tagName);
                        if (shortcodeConfig && shortcodeConfig.type) {
                            shortcodeType = shortcodeConfig.type;
                        } else {
                            // Not in registry - use smart detection
                            // Check if it's inline based on content structure
                            if (!innerContent.trim()) {
                                // Empty content - treat as inline
                                shortcodeType = 'inline';
                            } else if (!fullMatch.includes('\n')) {
                                // Single line - treat as inline
                                shortcodeType = 'inline';
                            } else {
                                // Multi-line with content - check if opening/closing are on separate lines
                                const lines = fullMatch.split('\n');
                                if (lines.length > 2) {
                                    // Opening and closing likely on separate lines - block
                                    shortcodeType = 'block';
                                } else {
                                    // Probably inline
                                    shortcodeType = 'inline';
                                }
                            }
                        }
                    }
                }
                
                // Fallback: use known inline shortcodes list
                if (shortcodeType === 'block') {
                    const knownInlineShortcodes = ['mark', 'highlight', 'span', 'kbd', 'code', 'em', 'strong', 'del', 'ins', 'sub', 'sup', 'color', 'fa'];
                    if (knownInlineShortcodes.includes(tagName.toLowerCase())) {
                        shortcodeType = 'inline';
                    }
                }
                
                // Parse attributes
                const attributes = this.parseShortcodeAttributes(params);
                
                // Check if this shortcode is on its own line
                const startOfLine = offset === 0 || fullString[offset - 1] === '\n';
                const endOfLine = (offset + fullMatch.length >= fullString.length) || fullString[offset + fullMatch.length] === '\n';
                const onOwnLine = startOfLine && endOfLine;
                
                // Check if this is a code-type shortcode (content should be preserved as raw code)
                let isCodeShortcode = false;
                let shortcodeConfig = null;
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        shortcodeConfig = registry.get(tagName);
                        if (shortcodeConfig && shortcodeConfig.contentType === 'code') {
                            isCodeShortcode = true;
                        }
                    }
                }

                // Recursively process nested shortcodes ONLY if NOT a code shortcode
                let processedInnerContent = innerContent;
                let codeContent = null;

                if (isCodeShortcode) {
                    // For code shortcodes, preserve content exactly as-is
                    // BUT first restore any inline code placeholders back to their original form
                    // This ensures backticks inside code-type shortcodes are preserved
                    let restoredContent = innerContent;
                    const inlinePlaceholderRegex = /\{\{CODE_INLINE_([^}]+)\}\}/g;
                    restoredContent = restoredContent.replace(inlinePlaceholderRegex, (match, placeholderId) => {
                        const blockData = this.blockMap.get(placeholderId);
                        if (blockData && blockData.original) {
                            // Remove the placeholder from blockMap since we're restoring it
                            this.blockMap.delete(placeholderId);
                            return blockData.original;
                        }
                        return match;
                    });
                    codeContent = restoredContent;
                    processedInnerContent = restoredContent;
                } else {
                    // For non-code shortcodes, restore code placeholders in content
                    // so they display properly when rendered with markdown

                    // Restore fenced code blocks
                    const blockPlaceholderRegex = /\{\{CODE_BLOCK_([^}]+)\}\}/g;
                    processedInnerContent = processedInnerContent.replace(blockPlaceholderRegex, (match, placeholderId) => {
                        const blockData = this.blockMap.get(placeholderId);
                        if (blockData && blockData.original) {
                            this.blockMap.delete(placeholderId);
                            return blockData.original;
                        }
                        return match;
                    });

                    // Restore inline code
                    const inlinePlaceholderRegex = /\{\{CODE_INLINE_([^}]+)\}\}/g;
                    processedInnerContent = processedInnerContent.replace(inlinePlaceholderRegex, (match, placeholderId) => {
                        const blockData = this.blockMap.get(placeholderId);
                        if (blockData && blockData.original) {
                            this.blockMap.delete(placeholderId);
                            return blockData.original;
                        }
                        return match;
                    });

                    // Then process nested shortcodes if present
                    if (processedInnerContent && (/\[([a-zA-Z][a-zA-Z0-9_-]*)\s*([^\]]*?)\]([\s\S]*?)\[\/\1\]/.test(processedInnerContent) || /\[([a-zA-Z][a-zA-Z0-9_-]*)\s*([^\/\]]*?)\/\]/.test(processedInnerContent))) {
                        processedInnerContent = this.preserveShortcodesRecursive(processedInnerContent);
                    }
                }

                const normalizedParams = this.normalizeShortcodeParams(params.trim());

                // Special handling for injection shortcodes - they should never show content area
                const isInjectionShortcode = tagName.toLowerCase().includes('inject');

                this.blockMap.set(id, {
                    type: 'shortcode',
                    tagName: tagName,
                    shortcodeName: tagName,
                    shortcodeType: shortcodeType,
                    params: normalizedParams,
                    attributes: attributes,
                    content: processedInnerContent,
                    codeContent: codeContent, // Raw code content for code-type shortcodes
                    contentType: isCodeShortcode ? 'code' : 'blocks', // Track content type
                    original: fullMatch,
                    isClosing: !isInjectionShortcode, // Injection shortcodes are treated as self-closing
                    isSelfClosing: isInjectionShortcode,
                    isBlock: shortcodeType === 'block',
                    onOwnLine: onOwnLine,
                    isInjectionShortcode: isInjectionShortcode
                });
                
                return `{{SHORTCODE_PLACEHOLDER_${id}}}`;
            });
            
            // If we found matches, recursively process again to catch any remaining nested shortcodes
            if (hasMatches && (/\[([a-zA-Z][a-zA-Z0-9_-]*)\s*([^\]]*?)\]([\s\S]*?)\[\/\1\]/.test(processed) || /\[([a-zA-Z][a-zA-Z0-9_-]*)\s*([^\/\]]*?)\/\]/.test(processed))) {
                return this.preserveShortcodesRecursive(processed);
            }
            
            return processed;
        }
        
        parseShortcodeAttributes(params) {
            const attributes = {};
            if (params) {
                // First check for BBCode-style syntax (="value" without parameter name)
                // This is common for shortcodes like [fa="calendar-o"]
                const bbcodeMatch = params.match(/^\s*=\s*["']([^"']+)["']\s*$/);
                if (bbcodeMatch) {
                    // For BBCode style, use a default parameter name based on the shortcode
                    // For 'fa' shortcode, the default parameter is 'icon'
                    attributes['icon'] = bbcodeMatch[1];
                    return attributes;
                }
                
                // Updated regex to handle both quoted and unquoted attributes
                // Support hyphens in attribute names (e.g., thumb-options, data-attr)
                const attrRegex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
                let attrMatch;
                while ((attrMatch = attrRegex.exec(params)) !== null) {
                    const value = attrMatch[2] !== undefined ? attrMatch[2] : 
                                 (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
                    attributes[attrMatch[1]] = value;
                }
            }
            return attributes;
        }

        preserveHtml(content) {
            // Use a more robust approach to find complete HTML blocks
            let result = content;
            const processedPositions = new Set();
            
            // Helper: detect if an index is inside single-line backtick code
            const isInsideInlineCode = (src, index) => {
                const lineStart = src.lastIndexOf('\n', index) + 1;
                const lineEndIdx = src.indexOf('\n', index);
                const lineEnd = lineEndIdx === -1 ? src.length : lineEndIdx;
                const before = src.lastIndexOf('`', index);
                const after = src.indexOf('`', index);
                if (before === -1 || after === -1) return false;
                if (before < lineStart || after > lineEnd) return false;
                // Exclude triple backtick fences
                const leftTrip = src.substring(Math.max(0, before - 2), before + 1);
                const rightTrip = src.substring(after, Math.min(src.length, after + 3));
                if (leftTrip === '```' || rightTrip === '```') return false;
                return true;
            };
            
            // Block-level HTML elements
            const blockElements = ['div', 'p', 'section', 'article', 'header', 'footer', 'main', 'aside', 
                                  'nav', 'blockquote', 'pre', 'table', 'form', 'fieldset', 'figure',
                                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'dl'];
            
            // Don't preserve these inline elements - they should remain inline in the editor
            const skipInlineElements = [
                // Common markdown-generated elements
                'a', 'strong', 'em', 'code', 'span',
                // Semantic text elements
                'abbr', 'cite', 'mark', 'sub', 'sup', 'kbd', 'samp', 'var', 'q',
                'del', 'ins', 'dfn', 'time', 'meter', 'progress', 'small', 'big',
                'b', 'i', 'u', 's', 'strike', 'tt',
                // Other inline elements
                'label', 'button', 'input', 'select', 'textarea', 'output',
                'bdo', 'bdi', 'ruby', 'rt', 'rp', 'wbr', 'data'
            ];
            
            // Collect all matches first
            const matches = [];
            const openTagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
            let match;
            
            while ((match = openTagRegex.exec(content)) !== null) {
                const tagName = match[1].toLowerCase();
                const openTagStart = match.index;
                const openTag = match[0];
                
                // Skip if position already processed
                if (processedPositions.has(openTagStart)) {
                    continue;
                }
                
                // Skip HTML that appears inside inline backtick code spans
                if (isInsideInlineCode(content, openTagStart)) {
                    continue;
                }

                // Skip if this contains placeholders
                if (openTag.includes('PRESERVED_BLOCK_') || openTag.includes('RAW_BLOCK_') || 
                    openTag.includes('data-shortcode=') || openTag.includes('class="shortcode-content"')) {
                    continue;
                }
                
                // Skip inline elements
                if (skipInlineElements.includes(tagName)) {
                    continue;
                }
                
                // Check if it's a self-closing tag
                if (openTag.endsWith('/>')) {
                    matches.push({
                        start: openTagStart,
                        end: openTagStart + openTag.length,
                        tagName: tagName,
                        content: openTag,
                        isSelfClosing: true
                    });
                    processedPositions.add(openTagStart);
                    continue;
                }
                
                // Find matching closing tag
                const closingTag = `</${tagName}>`;
                let searchStart = openTagStart + openTag.length;
                let depth = 1;
                let pos = searchStart;
                
                while (depth > 0 && pos < content.length) {
                    const nextOpenPos = content.indexOf(`<${tagName}`, pos);
                    const nextClosePos = content.indexOf(closingTag, pos);
                    
                    if (nextClosePos === -1) {
                        break;
                    }
                    
                    if (nextOpenPos !== -1 && nextOpenPos < nextClosePos) {
                        // Found another opening tag before the closing tag
                        depth++;
                        pos = nextOpenPos + tagName.length + 1;
                    } else {
                        // Found closing tag
                        depth--;
                        if (depth === 0) {
                            const endPos = nextClosePos + closingTag.length;
                            const fullMatch = content.substring(openTagStart, endPos);
                            
                            matches.push({
                                start: openTagStart,
                                end: endPos,
                                tagName: tagName,
                                content: fullMatch,
                                isSelfClosing: false
                            });
                            
                            // Mark this range as processed
                            for (let i = openTagStart; i <= endPos; i++) {
                                processedPositions.add(i);
                            }
                            break;
                        }
                        pos = nextClosePos + closingTag.length;
                    }
                }
            }
            
            // Sort matches by start position in reverse order (process from end to beginning)
            matches.sort((a, b) => b.start - a.start);
            
            // Process matches from end to beginning to avoid offset issues
            for (const matchInfo of matches) {
                const id = this.generateBlockId();
                const isBlock = blockElements.includes(matchInfo.tagName);
                
                this.blockMap.set(id, {
                    type: 'html',
                    tagName: matchInfo.tagName,
                    content: matchInfo.content,
                    original: matchInfo.content,
                    isBlock: isBlock
                });
                
                result = result.substring(0, matchInfo.start) + 
                        `{{RAW_BLOCK_${id}}}` + 
                        result.substring(matchInfo.end);
            }
            
            return result;
        }

        preserveTwig(content) {
            // Helper: detect if an index is inside single-line backtick code
            const isInsideInlineCode = (src, index) => {
                const lineStart = src.lastIndexOf('\n', index) + 1;
                const lineEndIdx = src.indexOf('\n', index);
                const lineEnd = lineEndIdx === -1 ? src.length : lineEndIdx;
                const before = src.lastIndexOf('`', index);
                const after = src.indexOf('`', index);
                if (before === -1 || after === -1) return false;
                if (before < lineStart || after > lineEnd) return false;
                // Exclude triple backtick fences
                const leftTrip = src.substring(Math.max(0, before - 2), before + 1);
                const rightTrip = src.substring(after, Math.min(src.length, after + 3));
                if (leftTrip === '```' || rightTrip === '```') return false;
                return true;
            };

            // Twig control structures that have opening/closing pairs
            const blockTwigTags = ['for', 'if', 'block', 'set', 'macro', 'sandbox', 'spaceless', 'verbatim', 'cache'];

            // First pass: handle block-level Twig tags with opening/closing pairs
            // These need special handling to capture the full block
            let result = content;
            for (const tagName of blockTwigTags) {
                const blockRegex = new RegExp(`\\{\\%\\s*${tagName}[^%]*\\%\\}[\\s\\S]*?\\{\\%\\s*end${tagName}\\s*\\%\\}`, 'gi');
                result = result.replace(blockRegex, (fullMatch, offset) => {
                    // Skip if inside inline code
                    if (isInsideInlineCode(content, offset)) {
                        return fullMatch;
                    }
                    // Skip if contains placeholders
                    if (fullMatch.includes('PRESERVED_BLOCK_') || fullMatch.includes('RAW_BLOCK_') ||
                        fullMatch.includes('SHORTCODE_PLACEHOLDER_')) {
                        return fullMatch;
                    }

                    const id = this.generateBlockId();
                    this.blockMap.set(id, {
                        type: 'twig',
                        content: fullMatch,
                        original: fullMatch,
                        isBlock: true
                    });
                    return `{{RAW_BLOCK_${id}}}`;
                });
            }

            // Second pass: handle Twig variables {{ ... }} and single tags {% ... %}
            // Use replace callback which handles all matches atomically
            const twigRegex = /\{\%\s*([a-zA-Z]+)[^%]*\%\}|\{\{\s*[^}]+\s*\}\}/g;

            result = result.replace(twigRegex, (fullMatch, tagName, offset) => {
                // Skip if inside inline code
                if (isInsideInlineCode(result, offset)) {
                    return fullMatch;
                }

                // Skip if contains placeholders (already processed)
                if (fullMatch.includes('PRESERVED_BLOCK_') || fullMatch.includes('RAW_BLOCK_') ||
                    fullMatch.includes('SHORTCODE_PLACEHOLDER_')) {
                    return fullMatch;
                }

                // IMPORTANT: Ignore our code placeholders which also use {{ ... }}
                if (/^\{\{CODE_(?:INLINE|BLOCK)_[\w_]+\}\}$/.test(fullMatch)) {
                    return fullMatch;
                }

                // Determine if this is a variable (inline) or a tag
                const isVariable = fullMatch.startsWith('{{');
                const isBlock = !isVariable && tagName && blockTwigTags.includes(tagName);

                const id = this.generateBlockId();
                this.blockMap.set(id, {
                    type: 'twig',
                    content: fullMatch,
                    original: fullMatch,
                    isBlock: isBlock
                });

                return `{{RAW_BLOCK_${id}}}`;
            });

            return result;
        }

        // Restore preserved content during serialization
        restoreContent(markdown, blocks) {
            // Keep restoring until no more placeholders are found (handles nested placeholders)
            let previousContent = '';
            let currentContent = markdown;
            let iterations = 0;
            const maxIterations = 50; // Increased to handle deeper nesting
            
            while (previousContent !== currentContent && iterations < maxIterations) {
                previousContent = currentContent;
                iterations++;
                
                // Helper function to restore blocks with proper line breaks
                const restoreBlock = (match, id, offset, string) => {
                    const block = blocks.get(id);
                    if (!block) return match;
                    
                    // Check what comes after the placeholder
                    const nextChar = string[offset + match.length] || '';
                    const hasNewlineAfter = nextChar === '\n';
                    
                    // For block elements, ensure proper spacing
                    if (block.isBlock) {
                        // Check if there's already adequate spacing
                        const nextTwoChars = string.substring(offset + match.length, offset + match.length + 2);
                        const hasDoubleNewlineAfter = nextTwoChars === '\n\n';
                        
                        // If there's no double newline after and this is a block element, add proper spacing
                        if (!hasDoubleNewlineAfter) {
                            if (hasNewlineAfter) {
                                // Already has one newline, add one more
                                return block.original + '\n';
                            } else {
                                // No newline at all, add double newline
                                return block.original + '\n\n';
                            }
                        }
                    }
                    
                    return block.original;
                };
                
                // Restore all types of placeholders
                currentContent = currentContent.replace(/\{\{GITHUB_ALERT_([\w_]+)\}\}/g, (match, id, offset, string) => {
                    const block = blocks.get(id);
                    return block ? block.original : match;
                });
                
                currentContent = currentContent.replace(/\{\{SHORTCODE_PLACEHOLDER_([\w_]+)\}\}/g, (match, id, offset, string) => {
                    const block = blocks.get(id);
                    if (!block) return match;
                    
                    // Reconstruct the shortcode with normalized params and proper newlines
                    if (block.type === 'shortcode') {
                        const { shortcodeName, params, content, isBlock } = block;
                        
                        // Determine if this is a block-level shortcode using the registry
                        let isBlockLevel = isBlock !== false; // Default from preservation
                        
                        // Try to get the type from the shortcode registry
                        if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                            const registry = window.EditorPro.getShortcodeRegistry();
                            if (registry) {
                                const shortcodeConfig = registry.get(shortcodeName);
                                if (shortcodeConfig) {
                                    isBlockLevel = shortcodeConfig.type === 'block';
                                }
                            }
                        }
                        
                        // Also check known block-level shortcodes as fallback
                        const blockLevelShortcodes = ['section', 'columns', 'ui-accordion', 'ui-accordion-item', 'column', 'notice', 'details', 'div', 'figure'];
                        if (!window.EditorPro || !window.EditorPro.getShortcodeRegistry) {
                            // Fallback when registry not available
                            isBlockLevel = blockLevelShortcodes.some(name => shortcodeName.toLowerCase() === name.toLowerCase());
                        }
                        
                        // Format with proper newlines for block-level shortcodes
                        if (isBlockLevel) {
                            // Simplified logic: block shortcodes always end with a single newline
                            let shortcodeText = '';
                            
                            // Format the shortcode
                            if (content && content.trim()) {
                                // For block shortcodes, ensure content has proper newlines
                                const trimmedContent = content.trim();
                                shortcodeText = `[${shortcodeName}${params ? ` ${params}` : ''}]\n${trimmedContent}\n[/${shortcodeName}]\n`;
                            } else {
                                // Empty block shortcode
                                shortcodeText = `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]\n`;
                            }
                            
                            return shortcodeText;
                        } else {
                            // Inline shortcode - keep compact
                            if (content && content.trim()) {
                                return `[${shortcodeName}${params ? ` ${params}` : ''}]${content.trim()}[/${shortcodeName}]`;
                            } else {
                                return `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]`;
                            }
                        }
                    }
                    
                    return block.original;
                });
                
                currentContent = currentContent.replace(/\{\{RAW_BLOCK_([\w_]+)\}\}/g, restoreBlock);
                
                currentContent = currentContent.replace(/\{\{PRESERVED_BLOCK_([\w_]+)\}\}/g, restoreBlock);
            }
            
            if (iterations >= maxIterations) {

            }
            
            return currentContent;
        }

        preserveGravImages(content) {
            // Match Grav images with optional title and query parameters
            // Example: ![alt](path/to.jpg?resize=600,400&classes=caption "Title here")
            const gravImageRegex = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g;
            
            return content.replace(gravImageRegex, (match, alt, fullSrc, title) => {
                const [imagePath, qs] = fullSrc.split('?');
                const queryString = qs ? `?${qs}` : '';
                // Only preserve if there are Grav-specific query parameters on the URL (ignore title)
                if (queryString && this.hasGravMediaActions(queryString)) {
                    const id = this.generateBlockId();
                    const actions = this.parseGravMediaActions(queryString);
                    
                    this.blockMap.set(id, {
                        type: 'grav-image',
                        alt: alt || '',
                        imagePath: imagePath,
                        queryString: queryString,
                        actions: actions,
                        original: match,
                        isBlock: false  // Mark as inline
                    });
                    return `{{PRESERVED_BLOCK_${id}}}`;
                }
                return match; // Let regular images pass through
            });
        }

        hasGravMediaActions(queryString) {
            // Check if query string contains Grav-specific media actions
            const gravActions = [
                'resize', 'cropResize', 'crop', 'quality', 'format', 'rotate', 'flip',
                'brightness', 'contrast', 'gamma', 'sharpen', 'blur', 'pixelate',
                'sepia', 'emboss', 'smooth', 'colorize', 'classes', 'lightbox',
                'loading', 'id', 'title', 'alt'
            ];
            
            return gravActions.some(action => queryString.includes(action + '='));
        }

        parseGravMediaActions(queryString) {
            const actions = {};
            const params = new URLSearchParams(queryString.substring(1)); // Remove '?'
            
            for (const [key, value] of params) {
                actions[key] = value;
            }
            
            return actions;
        }

        generateBlockId() {
            return `block_${++this.blockCounter}_${Date.now()}`;
        }
    }

    // Helper functions for preserved blocks
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getBlockTitle(blockType, blockData) {
        switch (blockType) {
            case 'shortcode':
                const tagName = blockData.tagName || blockData.shortcodeName || 'undefined';
                
                // Try to use shortcode registry for enhanced title
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const titleBar = registry.generateTitleBar(tagName, blockData.attributes || {}, blockData.params || '');
                        if (titleBar) {
                            return titleBar;
                        }
                    }
                }
                
                // Fallback to basic title generation
                const params = blockData.params || '';
                let humanName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
                
                // Special handling for common shortcode names
                if (tagName.toLowerCase() === 'section') {
                    humanName = 'Section';
                }
                
                // Parse parameters to show them in a readable format
                let paramDisplay = '';
                if (params.trim()) {
                    // Use the parsed attributes if available
                    if (blockData.attributes && Object.keys(blockData.attributes).length > 0) {
                        const attrPairs = Object.entries(blockData.attributes).map(([key, value]) => {
                            return `${key}: ${value}`;
                        });
                        paramDisplay = ` (${attrPairs.join(', ')})`;
                    } else {
                        // Fallback: Parse key="value" pairs from params string
                        const paramMatches = params.match(/([\w-]+)=["']?([^"'\s]+)["']?/g);
                        if (paramMatches && paramMatches.length > 0) {
                            const parsedParams = paramMatches.map(param => {
                                const [, key, value] = param.match(/([\w-]+)=["']?([^"'\s]+)["']?/) || [];
                                return `${key}: ${value}`;
                            });
                            paramDisplay = ` (${parsedParams.join(', ')})`;
                        } else if (params.trim()) {
                            // Fallback for unparseable params
                            paramDisplay = ` (${params.trim()})`;
                        }
                    }
                }
                
                return `${humanName}${paramDisplay}`;
            case 'html':
                return 'Raw Code Embed';
            case 'twig':
                return 'Twig Block';
            case 'grav-image':
                return 'Grav Image';
            default:
                return 'Preserved Block';
        }
    }

    function formatBlockContent(content, blockData) {
        if (blockData.type === 'shortcode') {
            if (blockData.isClosing) {
                // For shortcodes with content, process markdown to HTML with image resolution
                try {
                    let markdownContent = blockData.content || '';
                    
                    // Replace markdown images directly with resolved HTML from path mappings
                    if (window.EditorPro && window.EditorPro.activeEditor && window.EditorPro.activeEditor.pathMappings) {
                        markdownContent = markdownContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
                            const mapping = window.EditorPro.activeEditor.pathMappings?.images?.[imagePath];
                            if (mapping && mapping.html) {
                                return mapping.html;
                            }
                            return match;
                        });
                    }
                    
                    // Split content into HTML and markdown parts, process separately
                    const parts = [];
                    let currentPos = 0;
                    
                    // Find HTML blocks (img tags from our resolution)
                    const htmlRegex = /<img[^>]*>/g;
                    let htmlMatch;
                    
                    while ((htmlMatch = htmlRegex.exec(markdownContent)) !== null) {
                        // Add any markdown before this HTML
                        if (htmlMatch.index > currentPos) {
                            const markdownPart = markdownContent.substring(currentPos, htmlMatch.index).trim();
                            if (markdownPart) {
                                parts.push({ type: 'markdown', content: markdownPart });
                            }
                        }
                        
                        // Add the HTML part
                        parts.push({ type: 'html', content: htmlMatch[0] });
                        currentPos = htmlMatch.index + htmlMatch[0].length;
                    }
                    
                    // Add any remaining markdown
                    if (currentPos < markdownContent.length) {
                        const remainingMarkdown = markdownContent.substring(currentPos).trim();
                        if (remainingMarkdown) {
                            parts.push({ type: 'markdown', content: remainingMarkdown });
                        }
                    }
                    
                    // Process each part and combine
                    const processedParts = parts.map(part => {
                        if (part.type === 'html') {
                            return part.content;
                        } else {
                            // Preserve fenced code blocks before marked.parse()
                            let markdown = part.content;
                            const fencedCodeBlocks = [];
                            markdown = markdown.replace(/```(\w*)\s*\n([\s\S]*?)```/gm, (match, language, code) => {
                                const idx = fencedCodeBlocks.length;
                                fencedCodeBlocks.push({ language: language.trim(), code: code.replace(/^\n+|\n+$/g, '') });
                                return `<!--FENCED_CODE_${idx}-->`;
                            });

                            let html = marked.parse(markdown);

                            // Restore fenced code blocks
                            fencedCodeBlocks.forEach((codeBlock, idx) => {
                                const langClass = codeBlock.language ? ` class="language-${codeBlock.language}"` : '';
                                const escapedCode = codeBlock.code
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;');
                                html = html.replace(
                                    `<!--FENCED_CODE_${idx}-->`,
                                    `<pre><code${langClass}>${escapedCode}</code></pre>`
                                );
                            });

                            return html;
                        }
                    });
                    
                    const result = processedParts.join('\n');
                    return result;
                } catch (error) {
                    return blockData.content || '';
                }
            } else {
                // Self-closing shortcode
                return `[${blockData.tagName}${blockData.params || ''}]`;
            }
        }
        // For other types, return the original content
        return blockData.original || content;
    }

    // Custom TipTap Nodes and Extensions - will be created when TipTap is ready
    let ShortcodeNode;
    let PreservedBlock;
    let ShortcodeBlock;
    let PreservedInline;
    let LinkExtension;
    let RawBlock;
    let SummaryDelimiterNode;
    
    // Create a simple Link extension since it's not in StarterKit
    function createLinkExtension() {
        const MarkClass = TiptapCore.Mark || TiptapCore.default?.Mark;
        
        if (!MarkClass) {

            return null;
        }
        
        return MarkClass.create({
            name: 'link',
            priority: 1000,
            keepOnSplit: false,
            
            addOptions() {
                return {
                    openOnClick: false,
                    linkOnPaste: true,
                    autolink: true,
                    protocols: [],
                    HTMLAttributes: {},
                    validate: undefined,
                };
            },
            
            addAttributes() {
                return {
                    href: {
                        default: null,
                        parseHTML: element => element.getAttribute('href'),
                        renderHTML: attributes => {
                            if (!attributes.href) {
                                return {};
                            }
                            return { href: attributes.href };
                        },
                    },
                    target: {
                        default: null,
                        parseHTML: element => element.getAttribute('target'),
                        renderHTML: attributes => {
                            if (!attributes.target) {
                                return {};
                            }
                            return { target: attributes.target };
                        },
                    },
                    'data-href': {
                        default: null,
                        parseHTML: element => element.getAttribute('data-href'),
                        renderHTML: attributes => {
                            if (!attributes['data-href']) {
                                return {};
                            }
                            return { 'data-href': attributes['data-href'] };
                        },
                    },
                };
            },
            
            parseHTML() {
                return [
                    { 
                        tag: 'a[href]:not([href *= "javascript:" i])',
                        getAttrs: (element) => ({
                            href: element.getAttribute('href'),
                            target: element.getAttribute('target'),
                            'data-href': element.getAttribute('data-href'),
                        }),
                    },
                ];
            },
            
            renderHTML({ HTMLAttributes }) {
                return ['a', HTMLAttributes, 0];
            },
            
            addCommands() {
                return {
                    setLink: attributes => ({ chain }) => {
                        return chain().setMark(this.name, attributes).run();
                    },
                    toggleLink: attributes => ({ chain }) => {
                        return chain().toggleMark(this.name, attributes, { extendEmptyMarkRange: true }).run();
                    },
                    unsetLink: () => ({ chain }) => {
                        return chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run();
                    },
                };
            },
        });
    }

    function createSummaryDelimiterNode() {
        const NodeClass = TiptapCore.Node || TiptapCore.default?.Node || window.TipTap?.Node;

        if (!NodeClass) {

            return null;
        }

        return NodeClass.create({
            name: 'summaryDelimiter',
            group: 'block',
            atom: true,
            selectable: true,
            draggable: false,
            isolating: true,
            defining: true,

            addAttributes() {
                return {
                    delimiter: {
                        default: '',
                        parseHTML: element => element.getAttribute('data-delimiter') || '',
                        renderHTML: attributes => {
                            if (!attributes.delimiter) {
                                return {};
                            }
                            return { 'data-delimiter': attributes.delimiter };
                        }
                    }
                };
            },

            parseHTML() {
                return [{
                    tag: 'div[data-summary-delimiter]',
                    getAttrs: element => ({
                        delimiter: element.getAttribute('data-delimiter') || ''
                    })
                }];
            },

            renderHTML({ HTMLAttributes }) {
                const attrs = Object.assign({}, HTMLAttributes);
                attrs['data-summary-delimiter'] = 'true';
                const existingClass = attrs.class || '';
                attrs.class = existingClass ? `${existingClass} summary-delimiter` : 'summary-delimiter';
                attrs.role = attrs.role || 'separator';
                attrs['aria-label'] = attrs['aria-label'] || SUMMARY_DELIMITER_LABEL;

                return ['div', attrs, ['span', { class: 'summary-delimiter-label', contenteditable: 'false' }, SUMMARY_DELIMITER_LABEL]];
            },

            addCommands() {
                return {
                    insertSummaryDelimiter: (delimiterValue = '') => ({ commands }) => {
                        return commands.insertContent({
                            type: this.name,
                            attrs: {
                                delimiter: delimiterValue
                            }
                        });
                    }
                };
            }
        });
    }

    function createShortcodeNode() {
        // Try different ways to access Node
        const NodeClass = TiptapCore.Node || TiptapCore.default?.Node || window.TipTap?.Node;
        
        if (!NodeClass) {

            return null;
        }
        
        return NodeClass.create({
            name: 'shortcode',
            group: 'block',
            content: 'block*',
            defining: true,
            isolating: true, // Prevent merging with adjacent blocks
            priority: 1001, // Higher priority than paragraph to prevent wrapping

            addAttributes() {
                return {
                    tagName: { default: '' },
                    params: { default: '' },
                    class: { default: 'shortcode-block' }
                };
            },

            parseHTML() {
                return [{
                    tag: 'div[data-shortcode]',
                    getAttrs: (node) => {
                        const tagName = node.getAttribute('data-shortcode');
                        const params = node.getAttribute('data-params') || '';

                        // Don't create shortcode nodes for empty shortcodes
                        if (!tagName) {
                            return false;
                        }

                        return {
                            tagName: tagName,
                            params: params,
                            class: `shortcode-block ${tagName}`
                        };
                    },
                    contentElement: (node) => {
                        // Return the original node - TipTap will extract its content
                        return node;
                    }
                }];
            },

            renderHTML({ HTMLAttributes, node }) {
                const { tagName, params } = node.attrs;
                
                return ['div', {
                    'data-shortcode': tagName,
                    'data-params': params,
                    'class': `shortcode-block ${tagName}`
                }, 0]; // 0 = contentDOM for nested content
            },

            addNodeView() {
                return ({ node, getPos, editor }) => {
                    const { tagName, params } = node.attrs;
                    const decodedParams = params ? params.replace(/&quot;/g, '"') : '';

                    // Create the DOM element
                    const dom = document.createElement('div');
                    const contentDOM = document.createElement('div');
                    
                    dom.className = `shortcode-block ${tagName}`;
                    dom.setAttribute('data-shortcode', tagName);
                    dom.setAttribute('data-params', params);
                    
                    // Create non-editable header
                    const header = document.createElement('div');
                    header.className = 'shortcode-header';
                    header.contentEditable = false;
                    header.textContent = `${tagName.toUpperCase()}${decodedParams ? ` ${decodedParams}` : ''}`;
                    
                    // Create editable content area
                    contentDOM.className = 'shortcode-content';
                    
                    // Assemble the DOM structure
                    dom.appendChild(header);
                    dom.appendChild(contentDOM);
                    
                    return { dom, contentDOM };
                };
            }
        });
    }

    function createPreservedBlockNode() {
        // Try different ways to access Node
        const NodeClass = TiptapCore.Node || TiptapCore.default?.Node || window.TipTap?.Node;
        
        if (!NodeClass) {

            return null;
        }
        
        return NodeClass.create({
            name: 'preservedBlock',
            group: 'block',
            content: 'block*',
            atom: false,
            isolating: true, // Prevent merging with adjacent blocks
            priority: 1001, // Higher priority than paragraph to prevent wrapping

            addAttributes() {
                return {
                    blockId: { default: null },
                    blockType: { default: 'html' },
                    blockContent: { default: '' },
                    blockData: { default: {} }
                };
            },

            parseHTML() {
                return [{
                    tag: 'div[data-preserved-block]',
                    getAttrs: (node) => {
                        const blockId = node.getAttribute('data-block-id');
                        const blockType = node.getAttribute('data-block-type');
                        const blockDataStr = node.getAttribute('data-block-data');
                        
                        let blockData = {};
                        let blockContent = '';
                        
                        if (blockDataStr) {
                            try {
                                blockData = JSON.parse(blockDataStr);
                                blockContent = blockData.content || '';
                            } catch (error) {

                            }
                        }
                        
                        return {
                            blockId: blockId || '',
                            blockType: blockType || 'html',
                            blockContent: blockContent,
                            blockData: blockData
                        };
                    }
                }];
            },

            renderHTML({ HTMLAttributes, node }) {
                const { blockId, blockType, blockContent, blockData } = node.attrs;
                
                return ['div', {
                    'data-preserved-block': 'true',
                    'data-block-id': blockId,
                    'data-block-type': blockType,
                    'class': `preserved-block ${blockType}`,
                    'contenteditable': 'false'
                }, 
                    ['div', { class: 'preserved-block-header' }, 
                        ['span', {}, getBlockTitle(blockType, blockData)],
                        ['div', { class: 'preserved-block-controls' }, 
                            ['button', { 
                                type: 'button',
                                onclick: `window.EditorPro.editBlock('${blockId}')`
                            }, 'Edit'],
                            ['button', { 
                                type: 'button',
                                onclick: `window.EditorPro.deleteBlock('${blockId}')`
                            }, 'Delete']
                        ]
                    ],
                    ['div', { 
                        class: 'preserved-block-content',
                        'data-block-id': blockId,
                        'data-block-data': JSON.stringify(blockData)
                    }, 0] // Content DOM for editable content
                ];
            },

            addNodeView() {
                return ({ node, HTMLAttributes, getPos, editor }) => {
                    const { blockId, blockType, blockData } = node.attrs;
                    
                    // Check if this is an inline shortcode by looking up the registry directly
                    let isInlineShortcode = false;
                    if (blockType === 'shortcode' && blockData.tagName) {
                        const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(blockData.tagName);
                        isInlineShortcode = config && config.type === 'inline';
                    }
                    
                    // Create the appropriate DOM element - span for inline, div for block
                    const dom = document.createElement(isInlineShortcode ? 'span' : 'div');
                    dom.setAttribute('data-preserved-block', 'true');
                    dom.setAttribute('data-block-id', blockId);
                    dom.setAttribute('data-block-type', blockType);
                    if (blockType === 'shortcode' && blockData.tagName) {
                        dom.setAttribute('data-shortcode-name', blockData.tagName);
                    }
                    dom.className = isInlineShortcode ? 'preserved-inline shortcode' : `preserved-block ${blockType}`;
                    dom.contentEditable = 'false';
                    
                    // For HTML and Twig blocks, keep the modal editing approach
                    const title = getBlockTitle(blockType, blockData);
                    let content = formatBlockContent(blockData.content || '', blockData);
                    
                    if (isInlineShortcode) {
                        // Inline shortcode styling
                        dom.style.display = 'inline';
                        dom.style.padding = '2px 6px';
                        dom.style.margin = '0 2px';
                        dom.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                        dom.style.border = '1px solid #4CAF50';
                        dom.style.borderRadius = '3px';
                        dom.style.fontSize = '0.9em';
                        dom.style.fontFamily = 'monospace';
                        dom.style.cursor = 'pointer';
                        
                        // Show shortcode name and key attributes
                        const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(blockData.tagName);
                        let displayText = `[${blockData.tagName}`;
                        if (config && config.titleBarAttributes) {
                            config.titleBarAttributes.forEach(attr => {
                                if (blockData.attributes && blockData.attributes[attr]) {
                                    displayText += ` ${attr}="${blockData.attributes[attr]}"`;
                                }
                            });
                        }
                        if (blockData.content) {
                            displayText += `]${blockData.content}[/${blockData.tagName}]`;
                        } else {
                            displayText += ']';
                        }
                        
                        dom.innerHTML = displayText;
                        dom.title = `${config?.title || blockData.tagName} (click to edit)`;
                        
                        // Add click handler for editing
                        dom.onclick = () => window.EditorPro.editBlock(blockId);
                        
                        return { dom };
                    }
                    
                    // Apply CSS styling if shortcode has CSS template
                    if (blockType === 'shortcode' && blockData.tagName && blockData.attributes) {
                        try {
                            const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                            if (registry) {
                                registry.ensureInitialized();
                                const customCSS = registry.generateCSS(blockData.tagName, blockData.attributes);
                                if (customCSS) {
                                    dom.setAttribute('style', customCSS);
                                }
                            }
                        } catch (error) {
                            // Silently handle CSS application errors
                        }
                    }
                    
                    // Create a contentDOM for the content area that TipTap can manage
                    const contentDOM = document.createElement('div');
                    contentDOM.className = 'preserved-block-content';
                    contentDOM.setAttribute('data-block-id', blockId);
                    contentDOM.setAttribute('data-block-data', JSON.stringify(blockData));
                    contentDOM.contentEditable = 'true';
                    contentDOM.spellcheck = false;
                    
                    // For shortcode blocks, show only the inner content, not the shortcode syntax
                    if (blockType === 'shortcode' && blockData.content) {
                        // Use just the inner content for shortcodes
                        try {
                            let innerContent = blockData.content;

                            // Restore inline code placeholders before markdown processing
                            const preservedBlocks = window.EditorPro?.activeEditor?.preservedBlocks;
                            if (preservedBlocks) {
                                innerContent = innerContent.replace(/\{\{CODE_INLINE_([\w_]+)\}\}/g, (match, inlineBlockId) => {
                                    const inlineBlock = preservedBlocks.get(inlineBlockId);
                                    if (inlineBlock && inlineBlock.original) {
                                        return inlineBlock.original;
                                    }
                                    return match;
                                });
                            }

                            // Process markdown to HTML if needed
                            if (typeof marked !== 'undefined') {
                                // Preserve fenced code blocks before marked.parse()
                                const fencedCodeBlocks = [];
                                innerContent = innerContent.replace(/```(\w*)\s*\n([\s\S]*?)```/gm, (match, language, code) => {
                                    const idx = fencedCodeBlocks.length;
                                    fencedCodeBlocks.push({ language: language.trim(), code: code.replace(/^\n+|\n+$/g, '') });
                                    return `<!--FENCED_CODE_${idx}-->`;
                                });

                                innerContent = marked.parse(innerContent);

                                // Restore fenced code blocks as proper HTML
                                fencedCodeBlocks.forEach((codeBlock, idx) => {
                                    const langClass = codeBlock.language ? ` class="language-${codeBlock.language}"` : '';
                                    const escapedCode = codeBlock.code
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;');
                                    innerContent = innerContent.replace(
                                        `<!--FENCED_CODE_${idx}-->`,
                                        `<pre><code${langClass}>${escapedCode}</code></pre>`
                                    );
                                });

                                // Remove wrapping <p> tags if they exist
                                innerContent = innerContent.replace(/^<p>(.*)<\/p>\s*$/s, '$1');
                            }

                            contentDOM.innerHTML = innerContent;
                        } catch (error) {
                            contentDOM.innerHTML = blockData.content || '';
                        }
                    } else {
                        contentDOM.innerHTML = content;
                    }
                    
                    dom.innerHTML = `
                        <div class="preserved-block-header">
                            <span>${title}</span>
                            <div class="preserved-block-controls">
                                <button type="button" onclick="window.EditorPro.editBlock('${blockId}')">Edit</button>
                                <button type="button" onclick="window.EditorPro.deleteBlock('${blockId}')">Delete</button>
                            </div>
                        </div>
                    `;

                    dom.appendChild(contentDOM);

                    // Add step numbering for doc-step shortcodes (case-insensitive check)
                    const tagNameLower = (blockData.tagName || '').toLowerCase();
                    if (blockType === 'shortcode' && tagNameLower === 'doc-step') {
                        requestAnimationFrame(() => {
                            const parent = dom.closest('[data-shortcode-name="doc-steps"], [data-shortcode-name="Doc-steps"]');
                            if (parent) {
                                const steps = parent.querySelectorAll('[data-shortcode-name="doc-step"], [data-shortcode-name="Doc-step"]');
                                const index = Array.from(steps).indexOf(dom) + 1;
                                const titleSpan = dom.querySelector('.preserved-block-header > span');
                                if (titleSpan && index > 0 && !titleSpan.textContent.startsWith('(')) {
                                    titleSpan.textContent = `(${index}) ${titleSpan.textContent}`;
                                }
                            }
                        });
                    }

                    return {
                        dom,
                        contentDOM // This tells TipTap where the editable content goes
                    };
                };
            }
        });
    }

    // Create ShortcodeBlock node for block shortcodes with editable content
    // Create ShortcodeBlock node for block shortcodes with editable content
    function createShortcodeBlockNode() {
        const ShortcodeBlock = TiptapShortcodeBlock?.ShortcodeBlock;
        if (!ShortcodeBlock) {

            return null;
        }
        
        return ShortcodeBlock;
    }
    
    // Create RawBlock node for raw HTML/Twig code blocks
    function createRawBlockNode() {
        const NodeClass = TiptapCore.Node || TiptapCore.default?.Node || window.TipTap?.Node;
        
        if (!NodeClass) {
            return null;
        }
        
        return NodeClass.create({
            name: 'rawBlock',
            group: 'block',
            content: 'text*',
            code: true,
            defining: true,
            isolating: true,
            
            addAttributes() {
                return {
                    language: { default: 'html' },
                    content: { default: '' },
                    blockId: { default: null }
                };
            },
            
            parseHTML() {
                return [{
                    tag: 'div[data-raw-block="true"]',
                    getAttrs: (node) => {
                        const language = node.getAttribute('data-language') || 'html';
                        const blockId = node.getAttribute('data-block-id');
                        let content = '';
                        
                        // Try to get content from base64 encoded attribute
                        const contentBase64 = node.getAttribute('data-content-base64');
                        if (contentBase64) {
                            try {
                                content = decodeURIComponent(escape(atob(contentBase64)));
                            } catch (e) {
                                content = node.textContent || '';
                            }
                        } else {
                            content = node.textContent || '';
                        }
                        
                        return {
                            language,
                            content,
                            blockId
                        };
                    }
                }];
            },
            
            renderHTML({ HTMLAttributes, node }) {
                const { language, content, blockId } = node.attrs;
                const encodedContent = btoa(unescape(encodeURIComponent(content || '')));
                
                return ['div', {
                    'data-raw-block': 'true',
                    'data-language': language,
                    'data-content-base64': encodedContent,
                    'data-block-id': blockId || `raw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    'class': `raw-block-container`
                }, content || ''];
            },
            
            addCommands() {
                return {
                    insertRawBlock: (content = '', language = 'html') => ({ commands }) => {
                        const blockId = `raw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        return commands.insertContent({
                            type: 'rawBlock',
                            attrs: {
                                content,
                                language,
                                blockId
                            }
                        });
                    }
                };
            },
            
            addNodeView() {
                return ({ node, getPos, editor }) => {
                    const { language, content, blockId } = node.attrs;
                    
                    // Create the DOM element
                    const dom = document.createElement('div');
                    dom.className = `raw-block-container`;
                    dom.setAttribute('data-raw-block', 'true');
                    dom.setAttribute('data-language', language);
                    dom.setAttribute('data-block-id', blockId);
                    
                    // Create header
                    const header = document.createElement('div');
                    header.className = 'raw-block-header';
                    header.contentEditable = 'false';
                    header.innerHTML = `
                        <span class="raw-block-title">Raw ${language.toUpperCase()} Code</span>
                        <button type="button" class="raw-block-edit" onclick="window.EditorPro.editRawBlock('${blockId}')">Edit</button>
                    `;
                    
                    // Create content area with syntax highlighting
                    const contentDOM = document.createElement('pre');
                    contentDOM.className = 'raw-block-editor';
                    contentDOM.contentEditable = 'true';
                    contentDOM.spellcheck = false;
                    
                    // Use code element for proper syntax highlighting
                    const codeElement = document.createElement('code');
                    codeElement.className = `language-${language}`;
                    codeElement.textContent = content || '';
                    contentDOM.appendChild(codeElement);
                    
                    // Update node attrs when content changes
                    contentDOM.addEventListener('input', () => {
                        if (typeof getPos === 'function') {
                            const pos = getPos();
                            const transaction = editor.state.tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                content: contentDOM.textContent
                            });
                            editor.view.dispatch(transaction);
                        }
                    });
                    
                    dom.appendChild(header);
                    dom.appendChild(contentDOM);
                    
                    return { dom, contentDOM };
                };
            }
        });
    }
    
    // Create inline preserved content node (for inline shortcodes)
    function createInlinePreservedNode() {
        const NodeClass = TiptapCore.Node;
        if (!NodeClass) {

            return null;
        }
        
        return NodeClass.create({
            name: 'preservedInline',
            group: 'inline',
            content: '',
            atom: true,
            inline: true,

            addAttributes() {
                return {
                    blockId: { default: null },
                    blockType: { default: 'shortcode' },
                    blockContent: { default: '' },
                    blockData: { default: {} }
                };
            },

            parseHTML() {
                return [{
                    tag: 'span[data-preserved-inline]',
                    getAttrs: (element) => {
                        const blockId = element.getAttribute('data-block-id');
                        const blockType = element.getAttribute('data-block-type');
                        let blockContent = element.textContent || '';
                        let blockData = {};
                        
                        const blockDataStr = element.getAttribute('data-block-data');
                        if (blockDataStr) {
                            try {
                                blockData = JSON.parse(blockDataStr);
                                blockContent = blockData.content || '';
                            } catch (error) {

                            }
                        }
                        
                        return {
                            blockId: blockId || '',
                            blockType: blockType || 'shortcode',
                            blockContent: blockContent,
                            blockData: blockData
                        };
                    }
                }];
            },

            renderHTML({ HTMLAttributes, node }) {
                const { blockId, blockType, blockContent, blockData } = node.attrs;
                
                return ['span', {
                    'data-preserved-inline': 'true',
                    'data-block-id': blockId,
                    'data-block-type': blockType,
                    'data-block-data': JSON.stringify(blockData),
                    'class': 'preserved-inline shortcode',
                    'contenteditable': 'false'
                }, blockContent];
            },

            addNodeView() {
                return ({ node, HTMLAttributes, getPos, editor }) => {
                    const { blockId, blockType, blockData } = node.attrs;
                    
                    // Create inline span element
                    const dom = document.createElement('span');
                    dom.setAttribute('data-preserved-inline', 'true');
                    dom.setAttribute('data-block-id', blockId);
                    dom.setAttribute('data-block-type', blockType);
                    dom.setAttribute('data-block-data', JSON.stringify(blockData));
                    dom.className = 'preserved-inline shortcode';
                    dom.contentEditable = 'false';
                    
                    // Base styling for inline shortcode
                    dom.style.display = 'inline';
                    dom.style.padding = '2px 6px';
                    dom.style.margin = '0 2px';
                    dom.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                    dom.style.border = '1px solid #4CAF50';
                    dom.style.borderRadius = '3px';
                    dom.style.fontSize = '0.9em';
                    dom.style.fontFamily = 'monospace';
                    dom.style.cursor = 'pointer';
                    
                    // Apply custom CSS if available
                    try {
                        const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                        if (registry && blockData && blockData.attributes && blockData.tagName) {
                            registry.ensureInitialized();
                            const customCSS = registry.generateCSS(blockData.tagName, blockData.attributes);
                            if (customCSS) {
                                // Apply custom CSS on top of base styling
                                dom.style.cssText += `; ${customCSS}`;
                            }
                        }
                    } catch (error) {

                    }
                    
                    // Use unified shortcode renderer
                    const displayText = window.EditorPro?.pluginSystem?.renderShortcodeForEditor(blockData);
                    dom.innerHTML = displayText;
                    // Show raw shortcode in tooltip for reference
                    dom.title = `${blockData.original} (click to edit)`;
                    
                    // Click handler is now handled via event delegation in setupInlineShortcodeEventDelegation()
                    // This avoids issues with TipTap re-rendering
                    
                    return { dom };
                };
            }
        });
    }

    // Shortcode Registry System
    class ShortcodeRegistry {
        constructor() {
            this.shortcodes = new Map();
            this.cssTemplates = new Map();
            this.initialized = false;
        }

        // Lazy initialization - only load shortcodes when first needed
        ensureInitialized() {
            if (!this.initialized) {
                this.initializeFromGlobal();
                this.initialized = true;
            }
        }

        // Initialize from global shortcodes passed from PHP
        initializeFromGlobal() {
            // Only register shortcodes from PHP plugins
            if (window.EditorProShortcodes && Array.isArray(window.EditorProShortcodes)) {
                window.EditorProShortcodes.forEach(shortcode => {
                    this.register(shortcode);
                });
            }
        }

        // Register a shortcode configuration
        register(config) {
            if (!config.name) {
                return false;
            }

            // Validate required properties
            const required = ['name', 'title', 'type'];
            for (const prop of required) {
                if (!config[prop]) {
                    return false;
                }
            }

            // Set defaults
            const shortcode = {
                name: config.name,
                title: config.title,
                description: config.description || '',
                type: config.type || 'block', // 'block' or 'inline'
                attributes: config.attributes || {},
                titleBarAttributes: config.titleBarAttributes || [],
                hasContent: config.hasContent !== false, // default true
                cssTemplate: config.cssTemplate || '',
                icon: config.icon || '',
                plugin: config.plugin || 'unknown',
                category: config.category || 'other',
                group: config.group || config.plugin || 'Other',
                // Custom renderer function for editor display
                customRenderer: this.parseCustomRenderer(config.customRenderer),
                // Parent-child relationship properties
                allowedChildren: config.allowedChildren || [], // Array of allowed child shortcode names
                parentOnly: config.parentOnly || false, // True if this shortcode can only exist as a child
                restrictContent: config.restrictContent || false, // True if parent only accepts specific children
                // Code content properties
                contentType: config.contentType || 'blocks', // 'blocks' (default) or 'code'
                language: config.language || 'javascript', // Default language for code content
                // BBCode support
                bbcodeAttribute: config.bbcodeAttribute || null // Attribute name for BBCode value [shortcode=value]
            };

            this.shortcodes.set(config.name, shortcode);
            
            // Store CSS template if provided
            if (shortcode.cssTemplate) {
                this.cssTemplates.set(config.name, shortcode.cssTemplate);
            }

            return true;
        }

        // Parse custom renderer from string or function
        parseCustomRenderer(renderer) {
            if (!renderer) {
                return null;
            }
            
            if (typeof renderer === 'function') {
                return renderer;
            }
            
            if (typeof renderer === 'string') {
                try {
                    // Create function from string
                    return new Function('blockData', 'config', `return (${renderer})(blockData, config);`);
                } catch (error) {

                    return null;
                }
            }
            
            return null;
        }

        // Get shortcode configuration
        get(name) {
            this.ensureInitialized();
            return this.shortcodes.get(name);
        }

        // Get all shortcodes
        getAll() {
            this.ensureInitialized();
            return Array.from(this.shortcodes.values());
        }

        // Get shortcodes by type
        getByType(type) {
            this.ensureInitialized();
            return this.getAll().filter(shortcode => shortcode.type === type);
        }

        // Get shortcodes grouped by plugin/group
        getGrouped() {
            this.ensureInitialized();
            const groups = new Map();
            
            this.getAll().forEach(shortcode => {
                const groupName = shortcode.group;
                if (!groups.has(groupName)) {
                    groups.set(groupName, {
                        name: groupName,
                        plugin: shortcode.plugin,
                        shortcodes: []
                    });
                }
                groups.get(groupName).shortcodes.push(shortcode);
            });
            
            return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
        }

        // Get shortcodes by category
        getByCategory(category) {
            this.ensureInitialized();
            return this.getAll().filter(shortcode => shortcode.category === category);
        }

        // Get all categories
        getCategories() {
            this.ensureInitialized();
            const categories = new Set();
            this.getAll().forEach(shortcode => categories.add(shortcode.category));
            return Array.from(categories).sort();
        }

        // Get shortcodes grouped by category
        getCategorized() {
            this.ensureInitialized();
            const categories = new Map();
            
            this.getAll().forEach(shortcode => {
                const categoryName = shortcode.category;
                if (!categories.has(categoryName)) {
                    categories.set(categoryName, []);
                }
                categories.get(categoryName).push(shortcode);
            });
            
            return Object.fromEntries(categories);
        }

        // Generate CSS for a shortcode with attribute values
        generateCSS(shortcodeName, attributes) {
            this.ensureInitialized();
            const template = this.cssTemplates.get(shortcodeName);
            if (!template) return '';

            const shortcode = this.get(shortcodeName);
            if (!shortcode) return '';

            let css = template;
            
            // Merge provided attributes with defaults from shortcode config
            const mergedAttributes = {};
            Object.entries(shortcode.attributes || {}).forEach(([key, config]) => {
                mergedAttributes[key] = attributes[key] || config.default || '';
            });
            
            // Replace placeholders with actual values
            Object.entries(mergedAttributes).forEach(([key, value]) => {
                if (value) { // Only replace if value is not empty
                    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                    css = css.replace(placeholder, value);
                }
            });

            // Remove any remaining unreplaced placeholders
            css = css.replace(/\{\{[^}]+\}\}/g, '');
            
            // Clean up empty CSS rules (e.g., "background-color: ;")
            css = css.replace(/[^;]+:\s*;/g, '').trim();
            
            return css;
        }

        // Generate title bar text for a shortcode
        generateTitleBar(shortcodeName, attributes, params = '') {
            const shortcode = this.get(shortcodeName);
            if (!shortcode) return shortcodeName;

            // Special handling for codesh plugin - uses "Codesh: title - lang - lines: x" format
            if (shortcode.plugin === 'codesh') {
                // Extract language from attributes or BBCode-style params (e.g., [codesh=javascript])
                let lang = attributes.lang;
                if (!lang && params) {
                    const paramStr = params.trim();
                    if (paramStr.startsWith('=')) {
                        lang = paramStr.substring(1).trim();
                    } else if (paramStr && !paramStr.includes('=')) {
                        lang = paramStr;
                    }
                }

                const parts = [];
                if (attributes.title) parts.push(attributes.title);
                if (lang) parts.push(lang);
                if (attributes.theme) parts.push(`theme: ${attributes.theme}`);
                if (attributes.highlight) parts.push(`lines: ${attributes.highlight}`);
                if (attributes.focus) parts.push(`focus: ${attributes.focus}`);
                if (attributes['line-numbers'] === true || attributes['line-numbers'] === 'true') parts.push('numbered');
                if (attributes.diff === true || attributes.diff === 'true') parts.push('diff');
                const paramText = parts.length > 0 ? parts.join(' - ') : '';
                return paramText ? `${shortcode.title}: ${paramText}` : shortcode.title;
            }

            if (shortcode.titleBarAttributes.length === 0) {
                return shortcode.title;
            }

            const displayParts = shortcode.titleBarAttributes.map(attrName => {
                const value = attributes[attrName];
                return value ? `${attrName}: <strong>${value}</strong>` : null;
            }).filter(Boolean);

            // Include shortcode title (uppercased) along with attributes
            const attributeText = displayParts.length > 0 ? displayParts.join(', ') : '';
            return attributeText ? `${shortcode.title.toUpperCase()} ${attributeText}` : shortcode.title;
        }

        // Check if a shortcode can have child shortcodes
        canHaveChildren(shortcodeName) {
            const shortcode = this.get(shortcodeName);
            return shortcode && shortcode.allowedChildren.length > 0;
        }

        // Get allowed children for a shortcode
        getAllowedChildren(shortcodeName) {
            const shortcode = this.get(shortcodeName);
            return shortcode ? shortcode.allowedChildren : [];
        }

        // Check if a shortcode can only exist as a child (e.g., ui-accordion-item)
        isChildOnly(shortcodeName) {
            const shortcode = this.get(shortcodeName);
            return shortcode && shortcode.parentOnly;
        }

        // Check if a shortcode restricts content to only specific children
        hasRestrictedContent(shortcodeName) {
            const shortcode = this.get(shortcodeName);
            return shortcode && shortcode.restrictContent;
        }

        // Check if a child shortcode is allowed in a parent
        isChildAllowed(parentName, childName) {
            const parent = this.get(parentName);
            if (!parent) return false;
            return parent.allowedChildren.includes(childName);
        }

        // Get shortcodes that can be used as children for a given parent
        getChildShortcodes(parentName) {
            const allowedChildren = this.getAllowedChildren(parentName);
            return allowedChildren.map(name => this.get(name)).filter(Boolean);
        }

        // Get shortcodes that are not child-only (can be used at top level)
        getTopLevelShortcodes() {
            this.ensureInitialized();
            return this.getAll().filter(shortcode => !shortcode.parentOnly);
        }

        // Get all shortcodes sorted logically (for display in modals)
        getAllSortedLogically() {
            this.ensureInitialized();
            const allShortcodes = this.getAll();
            
            // Create a map of parent shortcodes to their children
            const parentChildMap = new Map();
            const standaloneShortcodes = [];
            
            allShortcodes.forEach(shortcode => {
                if (shortcode.parentOnly) {
                    // Find potential parent names (e.g., ui-accordion-item -> ui-accordion)
                    const possibleParents = [
                        shortcode.name.replace('-item', ''),
                        shortcode.name.replace('-tab', '-tabs'),
                        shortcode.name.split('-').slice(0, -1).join('-')
                    ];
                    
                    const parent = allShortcodes.find(s => 
                        possibleParents.includes(s.name) && s.allowedChildren?.includes(shortcode.name)
                    );
                    
                    if (parent) {
                        if (!parentChildMap.has(parent.name)) {
                            parentChildMap.set(parent.name, []);
                        }
                        parentChildMap.get(parent.name).push(shortcode);
                    }
                } else {
                    standaloneShortcodes.push(shortcode);
                }
            });
            
            // Sort standalone shortcodes by category, then by group, then by name
            const categoryOrder = ['formatting', 'layout', 'content', 'media', 'ui', 'testing'];
            standaloneShortcodes.sort((a, b) => {
                const catA = categoryOrder.indexOf(a.category) !== -1 ? categoryOrder.indexOf(a.category) : 999;
                const catB = categoryOrder.indexOf(b.category) !== -1 ? categoryOrder.indexOf(b.category) : 999;
                
                if (catA !== catB) return catA - catB;
                
                // Within same category, sort by group
                if (a.group && b.group && a.group !== b.group) {
                    return a.group.localeCompare(b.group);
                }
                
                // Group alignment shortcodes together
                const alignmentOrder = ['left', 'center', 'right', 'justify'];
                const aAlign = alignmentOrder.indexOf(a.name);
                const bAlign = alignmentOrder.indexOf(b.name);
                if (aAlign !== -1 && bAlign !== -1) return aAlign - bAlign;
                if (aAlign !== -1) return -1;
                if (bAlign !== -1) return 1;
                
                // Group heading shortcodes together
                if (a.name.match(/^h[1-6]$/) && b.name.match(/^h[1-6]$/)) {
                    return a.name.localeCompare(b.name);
                }
                if (a.name.match(/^h[1-6]$/)) return -1;
                if (b.name.match(/^h[1-6]$/)) return 1;
                
                return a.name.localeCompare(b.name);
            });
            
            // Build final sorted list with children immediately after parents
            const result = [];
            standaloneShortcodes.forEach(shortcode => {
                result.push(shortcode);
                // Add children right after parent
                const children = parentChildMap.get(shortcode.name);
                if (children) {
                    children.sort((a, b) => a.name.localeCompare(b.name));
                    result.push(...children);
                }
            });
            
            return result;
        }

        // Validate shortcode attributes
        validateAttributes(shortcodeName, attributes) {
            const shortcode = this.get(shortcodeName);
            if (!shortcode) return { valid: false, errors: ['Unknown shortcode'] };

            const errors = [];
            
            Object.entries(shortcode.attributes).forEach(([name, config]) => {
                const value = attributes[name];
                
                // Check required attributes
                if (config.required && !value) {
                    errors.push(`Required attribute '${name}' is missing`);
                }
                
                // Type validation
                if (value !== undefined) {
                    switch (config.type) {
                        case 'number':
                            if (isNaN(value)) errors.push(`Attribute '${name}' must be a number`);
                            if (config.min !== undefined && value < config.min) {
                                errors.push(`Attribute '${name}' must be >= ${config.min}`);
                            }
                            if (config.max !== undefined && value > config.max) {
                                errors.push(`Attribute '${name}' must be <= ${config.max}`);
                            }
                            break;
                        case 'select':
                            if (config.options && !config.options.includes(value)) {
                                errors.push(`Attribute '${name}' must be one of: ${config.options.join(', ')}`);
                            }
                            break;
                    }
                }
            });

            return { valid: errors.length === 0, errors };
        }
    }

    // Dropdown Component

    // Plugin System
    class EditorProPluginSystem {
        constructor() {
            this.plugins = new Map();
            this.shortcodeRegistry = new ShortcodeRegistry();
        }

        register(plugin) {
            if (!plugin.name) {

                return;
            }
            
            this.plugins.set(plugin.name, plugin);
        }

        // Register a shortcode configuration
        registerShortcode(config) {
            return this.shortcodeRegistry.register(config);
        }

        // Register a custom renderer for a shortcode
        registerShortcodeRenderer(shortcodeName, rendererFunction) {
            const config = this.shortcodeRegistry.get(shortcodeName);
            if (config) {
                config.customRenderer = rendererFunction;
                return true;
            } else {

                return false;
            }
        }

        // Get shortcode registry
        getShortcodeRegistry() {
            return this.shortcodeRegistry;
        }

        // Unified shortcode renderer for editor display
        renderShortcodeForEditor(blockData) {
            const config = this.shortcodeRegistry?.get(blockData.tagName);
            
            // Check if shortcode has custom renderer
            if (config && config.customRenderer && typeof config.customRenderer === 'function') {
                try {
                    return config.customRenderer(blockData, config);
                } catch (error) {

                    // Fall through to default rendering
                }
            }
            
            // Default rendering logic
            return this.renderShortcodeDefault(blockData);
        }

        // Default shortcode rendering
        renderShortcodeDefault(blockData) {
            // Process markdown content
            if (blockData.content) {
                try {
                    if (typeof marked !== 'undefined') {
                        let markdown = blockData.content;

                        // Preserve fenced code blocks before marked.parse() to prevent issues
                        // with special characters like --- being misinterpreted
                        const fencedCodeBlocks = [];
                        markdown = markdown.replace(/```(\w*)\s*\n([\s\S]*?)```/gm, (match, language, code) => {
                            const idx = fencedCodeBlocks.length;
                            fencedCodeBlocks.push({ language: language.trim(), code: code.replace(/^\n+|\n+$/g, '') });
                            return `<!--FENCED_CODE_${idx}-->`;
                        });

                        let displayText = marked.parse(markdown);

                        // Restore fenced code blocks as proper HTML
                        fencedCodeBlocks.forEach((codeBlock, idx) => {
                            const langClass = codeBlock.language ? ` class="language-${codeBlock.language}"` : '';
                            const escapedCode = codeBlock.code
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');
                            displayText = displayText.replace(
                                `<!--FENCED_CODE_${idx}-->`,
                                `<pre><code${langClass}>${escapedCode}</code></pre>`
                            );
                        });

                        // Remove ALL paragraph tags that marked adds, including empty ones
                        displayText = displayText.replace(/<\/?p[^>]*>/g, '').trim();
                        return displayText;
                    } else {
                        return blockData.content;
                    }
                } catch (error) {

                    return blockData.content;
                }
            }

            // No content, show just the shortcode name as a badge
            return blockData.tagName;
        }

        initialize(editorPro) {
            // Initialize shortcode registry first
            editorPro.shortcodeRegistry = this.shortcodeRegistry;
            
            this.plugins.forEach(plugin => {
                if (typeof plugin.init === 'function') {
                    try {
                        plugin.init(editorPro);
                    } catch (error) {

                    }
                }
            });
        }
    }

    // Main Editor Pro Class
    class EditorPro {
        constructor(textarea) {
            this.textarea = textarea;
            this.preserver = new ContentPreserver();
            this.preservedBlocks = new Map();
            this.editor = null;
            this.isUpdatingTextarea = false;
            this.dragHandlesVisible = false;
            this.summaryDelimiter = '===';
            this.summaryDelimiterTrimmed = '===';
            this.summaryDelimiterLabel = SUMMARY_DELIMITER_LABEL;
            // Load typography state from localStorage, default to enabled
            const savedTypographyState = localStorage.getItem('editor-pro-typography');
            this.typographyEnabled = savedTypographyState !== 'false';  // Default to enabled if not set

            // Raw markdown mode state
            this.rawMarkdownMode = null;
            this.isMarkdownMode = false;

            this.init();
        }

        init() {
            // Set field styling for full width
            this.setupFieldStyling();
            this.initializeTheme();
            this.loadPathMappings();
            this.createToolbar();
            this.initializeEditor();
            this.setupEventListeners();
            
            // Add delay to ensure DOM is ready
            setTimeout(() => {

                this.setupStickyToolbar();
                // Also fix any overflow issues that might prevent sticky positioning
                this.fixOverflowForSticky();
            }, 500);
            
            // Initialize plugins after editor is ready
            if (window.EditorPro.pluginSystem) {
                window.EditorPro.pluginSystem.initialize(this);
            }
        }

        loadPathMappings() {
            // Load pre-resolved path mappings from the template
            const wrapper = this.textarea.closest('.editor-pro-wrapper');
            this.pathMappings = { images: {}, links: {} };
            
            if (wrapper) {
                try {
                    const mappingsData = wrapper.getAttribute('data-path-mappings');
                    if (mappingsData) {
                        this.pathMappings = JSON.parse(mappingsData);
                    } else {

                    }
                } catch (error) {

                }
                
                const delimiterAttr = wrapper.getAttribute('data-summary-delimiter');
                if (delimiterAttr && delimiterAttr.length) {
                    this.summaryDelimiter = delimiterAttr;
                } else {
                    this.summaryDelimiter = '===';
                }
                
                // Try to get admin context from wrapper first
                this.adminRoute = wrapper.getAttribute('data-admin-route');
                this.adminNonce = wrapper.getAttribute('data-admin-nonce');
                this.pageRoute = wrapper.getAttribute('data-page-route');
                
                // Fallback to NextGen Editor's global config if available
                if ((!this.adminRoute || !this.adminNonce) && window.GravAdmin?.config) {
                    this.adminRoute = this.adminRoute || window.GravAdmin.config.current_url?.replace(/\/pages.*$/, '');
                    this.adminNonce = this.adminNonce || window.GravAdmin.config.admin_nonce;
                    this.pageRoute = this.pageRoute || window.GravAdmin.config.route;
                }

                if (window.GravAdmin?.config) {
                }
            } else {
                this.summaryDelimiter = this.summaryDelimiter || '===';
            }
            this.summaryDelimiterTrimmed = (this.summaryDelimiter || '===').trim() || '===';
        }

        setupFieldStyling() {
            // Make field full width like NextGen Editor
            const field = this.textarea.closest('.form-field');
            if (field) {
                field.style.display = 'block';
                field.style.width = '100%';
            }
            
            // Set wrapper styling
            const wrapper = this.textarea.parentNode;
            if (wrapper && wrapper.classList.contains('editor-pro-wrapper')) {
                wrapper.style.width = '100%';
                wrapper.style.display = 'block';
            }
        }

        // Tabler SVG Icons
        getIcon(name) {
            const icons = {
                undo: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-back-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>',
                redo: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-forward-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 14l4 -4l-4 -4" /><path d="M19 10h-11a4 4 0 1 0 0 8h1" /></svg>',
                removeformat: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-ballpen-off"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 6l7 7l-2 2" /><path d="M10 10l-4.172 4.172a2.828 2.828 0 1 0 4 4l4.172 -4.172" /><path d="M16 12l4.414 -4.414a2 2 0 0 0 0 -2.829l-1.171 -1.171a2 2 0 0 0 -2.829 0l-4.414 4.414" /><path d="M4 20l1.768 -1.768" /><path d="M3 3l18 18" /></svg>',
                heading: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/></svg>',
                h1: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 18v-8l-2 2" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                h2: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 12a2 2 0 1 1 4 0c0 .591 -.417 1.318 -.816 1.858l-3.184 4.143l4 0" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                h3: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 14a2 2 0 1 0 -2 -2" /><path d="M17 16a2 2 0 1 0 2 -2" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                h4: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 18v-8l-4 6h5" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                h5: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 18h2a2 2 0 1 0 0 -4h-2v-4h4" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                h6: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 14a2 2 0 1 0 0 4a2 2 0 0 0 0 -4z" /><path d="M21 12a2 2 0 1 0 -4 0v4" /><path d="M4 6v12" /><path d="M12 6v12" /><path d="M11 18h2" /><path d="M3 18h2" /><path d="M4 12h8" /><path d="M3 6h2" /><path d="M11 6h2" /></svg>',
                bold: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/></svg>',
                italic: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
                underline: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>',
                strikethrough: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
                link: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
                image: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
                blockquote: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-blockquote"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15h15" /><path d="M21 19h-15" /><path d="M15 11h6" /><path d="M21 7h-6" /><path d="M9 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2" /><path d="M3 9h1a1 1 0 1 1 -1 1v-2.5a2 2 0 0 1 2 -2" /></svg>',
                bulletList: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
                orderedList: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
                codeBlock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>',
                table: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>',
                tableRowAbove: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 0l3-3m-3 3l-3-3M3 10h18M3 14h18M3 18h18M3 22h18"/></svg>',
                tableRowBelow: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h18M3 6h18M3 10h18M3 14h18m-9 8v-6m0 6l3-3m-3 3l-3-3"/></svg>',
                tableRowDelete: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 10h18M3 14h18M3 18h18M5 12h14"/></svg>',
                tableColumnBefore: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h6m0 0l-3-3m3 3l-3 3M10 3v18M14 3v18M18 3v18M22 3v18"/></svg>',
                tableColumnAfter: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3v18M6 3v18M10 3v18M14 3v18m8 9h-6m6 0l-3-3m3 3l-3 3"/></svg>',
                tableColumnDelete: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3v18M6 3v18M10 3v18M14 3v18M18 3v18M22 3v18M12 5v14"/></svg>',
                tableHeaderRow: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" stroke-width="3"/><path d="M3 10h18" stroke-width="2"/><path d="M3 14h18" stroke-width="2"/><path d="M3 18h18" stroke-width="2"/></svg>',
                tableHeaderColumn: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18" stroke-width="3"/><path d="M10 3v18" stroke-width="2"/><path d="M14 3v18" stroke-width="2"/><path d="M18 3v18" stroke-width="2"/></svg>',
                tableDelete: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/><path d="M15 2L9 22" stroke="red"/><path d="M9 2l6 20" stroke="red"/></svg>',
                htmlBlock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>',
                shortcodeBlock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-bolt"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" /></svg>',
                githubAlert: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-info-circle"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>',
                // GitHub Alert Icons (from Octicons)
                githubAlertNote: '<svg class="octicon octicon-info" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
                githubAlertTip: '<svg class="octicon octicon-light-bulb" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
                githubAlertImportant: '<svg class="octicon octicon-report" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
                githubAlertWarning: '<svg class="octicon octicon-alert" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
                githubAlertCaution: '<svg class="octicon octicon-stop" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
                summaryDelimiter: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M8 12h8"/><path d="M4 17h16"/></svg>',
                sun: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
                moon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
                hardbreak: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-corner-down-left-double"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 5v6a3 3 0 0 1 -3 3h-7" /><path d="M13 10l-4 4l4 4m-5 -8l-4 4l4 4" /></svg>',
                horizontalRule: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-separator"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12l0 .01" /><path d="M7 12l10 0" /><path d="M21 12l0 .01" /></svg>',
                dragHandle: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-grip-vertical"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>',
                search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>',
                typography: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-mood-smile"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 10l.01 0" /><path d="M15 10l.01 0" /><path d="M9.5 15a3.5 3.5 0 0 0 5 0" /></svg>',
                typographyOff: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-mood-off"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5.634 5.638a9 9 0 0 0 12.732 12.724m1.679 -2.322a9 9 0 0 0 -12.08 -12.086" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 15a3.5 3.5 0 0 0 5 0" /><path d="M3 3l18 18" /></svg>',
                inlineHtml: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14"/><path d="M5 8h5"/><path d="M5 12h9"/><path d="M5 16h7"/><path d="M5 20h10"/><circle cx="12" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="12" r="1" fill="currentColor"/><circle cx="14" cy="16" r="1" fill="currentColor"/><circle cx="17" cy="20" r="1" fill="currentColor"/></svg>',
                breaks: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7h16"/><path d="M8 12h8"/><path d="M4 17h16"/></svg>',
                text: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
                chevronUp: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-up"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 15l6 -6l6 6" /></svg>',
                chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-down"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 9l6 6l6 -6" /></svg>',
                x: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-x"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>',
                markdown: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-markdown"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M7 15v-6l2 2l2 -2v6" /><path d="M14 13l2 2l2 -2m-2 2v-6" /></svg>'
            };
            return icons[name] || '';
        }

        createToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'editor-pro-toolbar';

            // We'll add the shortcode button dynamically once shortcodes are available
            // Check periodically for shortcode availability
            let checkCount = 0;
            const maxChecks = 50; // Stop checking after 5 seconds
            
            const checkForShortcodes = () => {
                checkCount++;
                // Only proceed if shortcode-core plugin is enabled
                if (window.EditorProPluginStatus && window.EditorProPluginStatus.shortcodeCore) {
                    if (window.EditorPro?.pluginSystem?.shortcodeRegistry?.shortcodes?.size > 0) {
                        this.addShortcodeButton();
                        this.addGitHubAlertButton(); // Add GitHub alert button after shortcode
                    } else if (checkCount < maxChecks) {
                        // Check again in a bit
                        setTimeout(checkForShortcodes, 100);
                    }
                } else {
                    // Plugin not enabled, just add GitHub alert button
                    this.addGitHubAlertButton();
                }
            };
            
            // Start checking after a brief delay to allow plugin system to initialize
            setTimeout(checkForShortcodes, 100);
            
            // Also add GitHub alert button even if no shortcodes are available
            setTimeout(() => {
                if (!this.toolbar.querySelector('[data-toolbar-item="shortcodeBlock"]')) {
                    // No shortcode button, add GitHub alert after HTML block
                    this.addGitHubAlertButton();
                }
            }, 600);
            
            // Define toolbar items with proper icons
            const toolbarItems = [
                { name: 'undo', title: 'Undo', icon: 'undo', action: () => this.editor.commands.undo() },
                { name: 'redo', title: 'Redo', icon: 'redo', action: () => this.editor.commands.redo() },
                { type: 'separator' },
                { name: 'removeformat', title: 'Remove Format', icon: 'removeformat', action: () => this.editor.chain().focus().clearNodes().unsetAllMarks().run() },
                { type: 'separator' },
                { 
                    name: 'heading', 
                    title: 'Heading', 
                    icon: 'heading', 
                    type: 'dropdown',
                    items: [
                        { name: 'h1', title: 'Heading 1', icon: 'h1', action: () => this.setHeading(1) },
                        { name: 'h2', title: 'Heading 2', icon: 'h2', action: () => this.setHeading(2) },
                        { name: 'h3', title: 'Heading 3', icon: 'h3', action: () => this.setHeading(3) },
                        { name: 'h4', title: 'Heading 4', icon: 'h4', action: () => this.setHeading(4) },
                        { name: 'h5', title: 'Heading 5', icon: 'h5', action: () => this.setHeading(5) },
                        { name: 'h6', title: 'Heading 6', icon: 'h6', action: () => this.setHeading(6) }
                    ]
                },
                { name: 'bold', title: 'Bold', icon: 'bold', action: () => this.editor.commands.toggleBold() },
                { name: 'italic', title: 'Italic', icon: 'italic', action: () => this.editor.commands.toggleItalic() },
                { name: 'underline', title: 'Underline', icon: 'underline', action: () => this.editor.commands.toggleUnderline() },
                { name: 'strikethrough', title: 'Strikethrough', icon: 'strikethrough', action: () => this.editor.commands.toggleStrike() },
                {
                    name: 'inlineHtml',
                    title: 'Inline HTML',
                    icon: 'inlineHtml',
                    type: 'dropdown',
                    items: [
                        { name: 'abbr', title: 'Abbreviation', icon: 'text', action: () => this.toggleInlineHtml('abbr') },
                        { name: 'cite', title: 'Citation', icon: 'text', action: () => this.toggleInlineHtml('cite') },
                        { name: 'kbd', title: 'Keyboard', icon: 'text', action: () => this.toggleInlineHtml('kbd') },
                        { name: 'mark', title: 'Highlight', icon: 'text', action: () => this.toggleInlineHtml('mark') },
                        { type: 'separator' },
                        { name: 'sup', title: 'Superscript', icon: 'text', action: () => this.toggleInlineHtml('sup') },
                        { name: 'sub', title: 'Subscript', icon: 'text', action: () => this.toggleInlineHtml('sub') },
                        { type: 'separator' },
                        { name: 'var', title: 'Variable', icon: 'text', action: () => this.toggleInlineHtml('var') },
                        { name: 'time', title: 'Time', icon: 'text', action: () => this.toggleInlineHtml('time') },
                        { name: 'dfn', title: 'Definition', icon: 'text', action: () => this.toggleInlineHtml('dfn') },
                        { name: 'q', title: 'Quote', icon: 'text', action: () => this.toggleInlineHtml('q') }
                    ]
                },
                { type: 'separator' },
                { name: 'link', title: 'Link', icon: 'link', action: () => this.insertLink() },
                { name: 'image', title: 'Image', icon: 'image', action: () => this.insertImage() },
                {
                    name: 'tableGroup',
                    title: 'Table',
                    icon: 'table',
                    type: 'dropdown',
                    items: [
                        { name: 'insertTable', title: 'Insert Table', icon: 'table', action: () => this.insertTable() },
                        { type: 'separator' },
                        { name: 'addRowBefore', title: 'Add Row Above', icon: 'tableRowAbove', action: () => this.addRowBefore() },
                        { name: 'addRowAfter', title: 'Add Row Below', icon: 'tableRowBelow', action: () => this.addRowAfter() },
                        { name: 'deleteRow', title: 'Delete Row', icon: 'tableRowDelete', action: () => this.deleteRow() },
                        { type: 'separator' },
                        { name: 'addColumnBefore', title: 'Add Column Before', icon: 'tableColumnBefore', action: () => this.addColumnBefore() },
                        { name: 'addColumnAfter', title: 'Add Column After', icon: 'tableColumnAfter', action: () => this.addColumnAfter() },
                        { name: 'deleteColumn', title: 'Delete Column', icon: 'tableColumnDelete', action: () => this.deleteColumn() },
                        { type: 'separator' },
                        { name: 'deleteTable', title: 'Delete Table', icon: 'tableDelete', action: () => this.deleteTable() }
                    ]
                },
                { type: 'separator' },
                { name: 'blockquote', title: 'Blockquote', icon: 'blockquote', action: () => this.editor.commands.toggleBlockquote() },
                {
                    name: 'breaks',
                    title: 'Breaks',
                    icon: 'breaks',
                    type: 'dropdown',
                    items: [
                        { name: 'lineBreak', title: 'Line Break', icon: 'hardbreak', action: () => this.editor.commands.setHardBreak() },
                        { name: 'horizontalRule', title: 'Horizontal Rule', icon: 'horizontalRule', action: () => this.editor.commands.setHorizontalRule() },
                        { name: 'summaryDelimiter', title: 'Summary Break', icon: 'summaryDelimiter', action: () => this.insertSummaryDelimiter() }
                    ]
                },
                {
                    name: 'list',
                    title: 'List',
                    icon: 'bulletList',
                    type: 'dropdown',
                    items: [
                        { name: 'bulletList', title: 'Bullet List', icon: 'bulletList', action: () => this.editor.commands.toggleBulletList() },
                        { name: 'orderedList', title: 'Numbered List', icon: 'orderedList', action: () => this.editor.commands.toggleOrderedList() }
                    ]
                },
                { type: 'separator' },
                { name: 'codeBlock', title: 'Code Block', icon: 'codeBlock', action: () => this.editor.commands.toggleCodeBlock() },
                { name: 'htmlBlock', title: 'Raw Code Embed', icon: 'htmlBlock', action: () => this.insertHtmlBlock() },
                { name: 'shortcodeBlock', title: 'Shortcode', icon: 'shortcodeBlock', action: () => this.insertShortcodeBlock() },
                // GitHub Alert dropdown will be added here dynamically
                { type: 'separator' },
                { name: 'dragHandle', title: 'Toggle Drag Handles', icon: 'dragHandle', action: () => this.toggleDragHandle() },
                { name: 'search', title: 'Find & Replace', icon: 'search', action: () => this.showFindReplace() },
                { name: 'typography', title: 'Toggle Typography Shortcuts', icon: 'typography', action: () => this.toggleTypography() }
            ];

            // Create left section for main tools
            const leftSection = document.createElement('div');
            leftSection.className = 'toolbar-section toolbar-left';
            
            toolbarItems.forEach(item => {
                // Skip shortcode button if shortcode-core plugin is not enabled
                if (item.name === 'shortcodeBlock' && (!window.EditorProPluginStatus || !window.EditorProPluginStatus.shortcodeCore)) {
                    return;
                }
                
                if (item.type === 'separator') {
                    const separator = document.createElement('div');
                    separator.className = 'separator';
                    leftSection.appendChild(separator);
                } else if (item.type === 'dropdown' || item.items) {
                    const dropdown = this.createDropdown(item);
                    leftSection.appendChild(dropdown);
                } else {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.setAttribute('data-tooltip', item.title);
                    button.innerHTML = this.getIcon(item.icon);
                    button.onmousedown = (e) => {
                        e.preventDefault(); // Prevent selection loss
                    };
                    button.onclick = (e) => {
                        item.action();
                        // Refocus editor to maintain selection
                        this.editor.commands.focus();
                    };
                    button.dataset.toolbarItem = item.name;
                    leftSection.appendChild(button);
                }
            });
            
            // Create right section for theme toggle
            const rightSection = document.createElement('div');
            rightSection.className = 'toolbar-section toolbar-right';
            
            // Markdown mode toggle button
            const markdownToggle = document.createElement('button');
            markdownToggle.type = 'button';
            markdownToggle.setAttribute('data-tooltip', 'Toggle Markdown Mode');
            markdownToggle.innerHTML = this.getIcon('markdown');
            markdownToggle.dataset.toolbarItem = 'markdown-toggle';
            markdownToggle.onclick = () => this.toggleMarkdownMode();
            rightSection.appendChild(markdownToggle);

            // Theme toggle button
            const themeToggle = document.createElement('button');
            themeToggle.type = 'button';
            themeToggle.setAttribute('data-tooltip', 'Toggle Theme');
            themeToggle.innerHTML = this.getIcon('sun');
            themeToggle.dataset.toolbarItem = 'theme-toggle';
            themeToggle.onclick = () => this.toggleTheme();
            rightSection.appendChild(themeToggle);

            toolbar.appendChild(leftSection);
            toolbar.appendChild(rightSection);

            // Create wrapper for toolbar (will also contain search bar)
            const wrapper = document.createElement('div');
            wrapper.className = 'editor-pro-toolbar-wrapper';
            
            // Insert wrapper before textarea and put toolbar inside
            this.textarea.parentNode.insertBefore(wrapper, this.textarea);
            wrapper.appendChild(toolbar);
            this.toolbar = toolbar;
        }

        setupStickyToolbar() {

            // Find toolbar or toolbar wrapper by class
            let stickyElement = document.querySelector('.editor-pro-toolbar-wrapper');
            if (!stickyElement) {
                stickyElement = document.querySelector('.editor-pro-toolbar');
            }
            if (!stickyElement) {

                return;
            }

            // Look for the main content area that scrolls
            // In Grav admin, it's typically the main[role="region"] element
            let scrollRegion = document.querySelector('main [role="region"]');
            
            if (!scrollRegion) {
                // Try alternative selectors
                scrollRegion = document.querySelector('.content-wrapper') || 
                              document.querySelector('.admin-content') ||
                              document.querySelector('main');
            }

            // Find the actual scrollable parent of the toolbar
            const findScrollableParent = (element) => {
                let parent = element.parentElement;
                while (parent) {
                    const style = window.getComputedStyle(parent);
                    if (style.overflow === 'auto' || style.overflow === 'scroll' || 
                        style.overflowY === 'auto' || style.overflowY === 'scroll') {

                        return parent;
                    }
                    parent = parent.parentElement;
                }
                return null;
            };
            
            const actualScroller = findScrollableParent(stickyElement);
            
            // Use the actual scroller if found, otherwise use scrollRegion
            if (actualScroller) {
                scrollRegion = actualScroller;
            }

            if (!scrollRegion) {

                // Try to use CSS sticky by ensuring no overflow:hidden on parents
                this.enableCSSSticky(stickyElement);
                return;
            }
            
            // Create placeholder element to prevent layout jump
            const stickyHeight = stickyElement.offsetHeight;
            const placeholder = document.createElement('div');
            placeholder.style.height = stickyHeight + 'px';
            placeholder.style.display = 'none';
            placeholder.className = 'editor-pro-toolbar-placeholder';
            stickyElement.parentNode.insertBefore(placeholder, stickyElement);
            
            let isSticky = false;
            let rafId = null;
            
            const checkSticky = () => {
                rafId = null;
                
                const scrollTop = scrollRegion.scrollTop;
                const scrollRegionRect = scrollRegion.getBoundingClientRect();
                const stickyRect = isSticky ? placeholder.getBoundingClientRect() : stickyElement.getBoundingClientRect();
                
                // Calculate if toolbar should be sticky
                const shouldStick = stickyRect.top <= scrollRegionRect.top;
                
                if (shouldStick && !isSticky) {

                    // Make sticky
                    isSticky = true;
                    placeholder.style.display = 'block';
                    placeholder.style.height = stickyElement.offsetHeight + 'px'; // Update height in case search bar is shown
                    stickyElement.style.position = 'fixed';
                    stickyElement.style.top = scrollRegionRect.top + 'px';
                    stickyElement.style.left = stickyRect.left + 'px';
                    stickyElement.style.width = stickyRect.width + 'px';
                    stickyElement.style.zIndex = '1001';
                    stickyElement.classList.add('is-sticky');
                } else if (!shouldStick && isSticky) {

                    // Remove sticky
                    isSticky = false;
                    placeholder.style.display = 'none';
                    stickyElement.style.position = '';
                    stickyElement.style.top = '';
                    stickyElement.style.left = '';
                    stickyElement.style.width = '';
                    stickyElement.style.zIndex = '';
                    stickyElement.classList.remove('is-sticky');
                }
                
                // Update position while sticky
                if (isSticky) {
                    stickyElement.style.top = scrollRegionRect.top + 'px';
                    stickyElement.style.left = placeholder.getBoundingClientRect().left + 'px';
                    stickyElement.style.width = placeholder.getBoundingClientRect().width + 'px';
                    // Update placeholder height in case search bar opened/closed
                    if (this.searchBar && this.searchBar.classList.contains('active')) {
                        placeholder.style.height = stickyElement.offsetHeight + 'px';
                    }
                }
            };
            
            // Throttled scroll handler
            const handleScroll = () => {
                if (!rafId) {
                    rafId = requestAnimationFrame(checkSticky);
                }
            };
            
            // Add event listeners
            scrollRegion.addEventListener('scroll', handleScroll, { passive: true });
            window.addEventListener('resize', handleScroll, { passive: true });
            
            // Initial check
            checkSticky();
            
            // Store cleanup function
            this.cleanupStickyToolbar = () => {
                scrollRegion.removeEventListener('scroll', handleScroll);
                window.removeEventListener('resize', handleScroll);
                if (rafId) {
                    cancelAnimationFrame(rafId);
                }
                if (placeholder.parentNode) {
                    placeholder.remove();
                }
            };
        }
        
        enableCSSSticky(toolbar) {

            // Add CSS sticky positioning
            toolbar.style.position = 'sticky';
            toolbar.style.top = '0';
            toolbar.style.zIndex = '1001';
            
            // Ensure the editor wrapper allows sticky
            const wrapper = toolbar.closest('.editor-pro-wrapper');
            if (wrapper) {
                wrapper.style.position = 'relative';
            }
        }
        
        setupWindowStickyToolbar(toolbar) {

            // For window scrolling, just use CSS position: sticky
            // But since that's not working due to overflow:hidden, use JS
            const placeholder = document.createElement('div');
            placeholder.style.height = toolbar.offsetHeight + 'px';
            placeholder.style.display = 'none';
            toolbar.parentNode.insertBefore(placeholder, toolbar);
            
            let isSticky = false;
            const originalTop = toolbar.getBoundingClientRect().top + window.scrollY;
            
            const checkSticky = () => {
                const scrollY = window.scrollY;
                const shouldStick = scrollY > originalTop;
                
                if (shouldStick && !isSticky) {
                    isSticky = true;
                    placeholder.style.display = 'block';
                    toolbar.style.position = 'fixed';
                    toolbar.style.top = '0';
                    toolbar.style.left = placeholder.getBoundingClientRect().left + 'px';
                    toolbar.style.width = placeholder.getBoundingClientRect().width + 'px';
                    toolbar.style.zIndex = '1001';
                    toolbar.classList.add('is-sticky');
                } else if (!shouldStick && isSticky) {
                    isSticky = false;
                    placeholder.style.display = 'none';
                    toolbar.style.position = '';
                    toolbar.style.top = '';
                    toolbar.style.left = '';
                    toolbar.style.width = '';
                    toolbar.style.zIndex = '';
                    toolbar.classList.remove('is-sticky');
                }
            };
            
            window.addEventListener('scroll', checkSticky, { passive: true });
            window.addEventListener('resize', checkSticky, { passive: true });
            checkSticky();
        }
        
        fixOverflowForSticky() {

            // Find the editor wrapper and toolbar
            const wrapper = this.textarea.closest('.editor-pro-wrapper');
            const toolbar = document.querySelector('.editor-pro-toolbar');
            
            if (!wrapper || !toolbar) {

                return;
            }
            
            // Walk up the DOM tree and remove overflow:hidden from parent elements
            // that might be preventing sticky positioning from working
            let element = wrapper;
            const fixedElements = [];
            
            while (element && element !== document.body) {
                const style = window.getComputedStyle(element);
                
                // Check if this element has overflow hidden
                if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') {

                    // Store original overflow values
                    const originalOverflow = {
                        element: element,
                        overflow: element.style.overflow,
                        overflowX: element.style.overflowX,
                        overflowY: element.style.overflowY
                    };
                    fixedElements.push(originalOverflow);
                    
                    // Remove overflow hidden
                    element.style.overflow = 'visible';
                    element.style.overflowX = 'visible';
                    element.style.overflowY = 'visible';
                }
                
                element = element.parentElement;
            }

            // Store the fixed elements in case we need to restore them later
            this.fixedOverflowElements = fixedElements;
        }

        addShortcodeButton() {
            // Only add shortcode button if shortcode-core plugin is enabled
            if (!window.EditorProPluginStatus || !window.EditorProPluginStatus.shortcodeCore) {
                return;
            }
            
            // Check if button already exists
            if (this.toolbar.querySelector('[data-toolbar-item="shortcodeBlock"]')) {
                return;
            }
            
            // Find the HTML block button to insert shortcode button after it
            const htmlButton = this.toolbar.querySelector('[data-toolbar-item="htmlBlock"]');
            if (!htmlButton) {
                return;
            }
            
            // Create shortcode button
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-tooltip', 'Insert Shortcode');
            button.innerHTML = this.getIcon('shortcodeBlock');
            button.onclick = () => this.showShortcodeSelector();
            button.dataset.toolbarItem = 'shortcodeBlock';
            
            // Insert after HTML button
            htmlButton.parentNode.insertBefore(button, htmlButton.nextSibling);
        }

        addGitHubAlertButton() {
            // Find the existing GitHub alert button
            const existingButton = this.toolbar.querySelector('[data-toolbar-item="githubAlert"]');
            
            if (existingButton) {
                // Find the left section and where to insert
                const leftSection = this.toolbar.querySelector('.toolbar-left');
                const shortcodeButton = leftSection?.querySelector('[data-toolbar-item="shortcodeBlock"]');
                const htmlButton = leftSection?.querySelector('[data-toolbar-item="htmlBlock"]');
                const insertAfter = shortcodeButton || htmlButton;
                
                if (insertAfter && leftSection) {
                    // Clone the button to remove all event listeners
                    const newButton = existingButton.cloneNode(true);
                    
                    // Move the button to the correct position
                    existingButton.remove();
                    insertAfter.parentNode.insertBefore(newButton, insertAfter.nextSibling);
                    
                    // Update the icon to match other toolbar icons
                    newButton.innerHTML = this.getIcon('githubAlert');
                    
                    // Ensure tooltip is set
                    newButton.setAttribute('data-tooltip', 'Markdown Alert');
                    
                    // Set new click handler
                    newButton.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showGitHubAlertSelector();
                    };
                }
            } else {
                // No existing button, create new one
                const leftSection = this.toolbar.querySelector('.toolbar-left');
                const shortcodeButton = leftSection?.querySelector('[data-toolbar-item="shortcodeBlock"]');
                const htmlButton = leftSection?.querySelector('[data-toolbar-item="htmlBlock"]');
                const insertAfter = shortcodeButton || htmlButton;
                
                if (insertAfter) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.setAttribute('data-tooltip', 'Markdown Alert');
                    button.innerHTML = this.getIcon('githubAlert');
                    button.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showGitHubAlertSelector();
                    };
                    button.dataset.toolbarItem = 'githubAlert';
                    
                    insertAfter.parentNode.insertBefore(button, insertAfter.nextSibling);
                }
            }
        }
        
        showGitHubAlertSelector() {
            // Remove any existing modals (including old ones with different selectors)
            const existingModals = document.querySelectorAll('.editor-pro-modal, .github-alert-selector, [class*="github-alert"], [class*="alert-selector"]');
            existingModals.forEach(modal => modal.remove());
            
            // Also remove any modals that might have the old structure
            const oldModalBackdrops = document.querySelectorAll('.modal-backdrop, .modal-overlay');
            oldModalBackdrops.forEach(backdrop => {
                const parentModal = backdrop.parentElement;
                if (parentModal && parentModal.querySelector('.alert-type-btn, .alert-types, h3:first-child')) {
                    parentModal.remove();
                }
            });
            
            // Create a modal similar to shortcode selector
            const modal = document.createElement('div');
            modal.className = 'editor-pro-modal github-alert-selector';
            modal.innerHTML = `
                <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Insert GitHub Alert</h3>
                        <button class="close-button" onclick="this.closest('.editor-pro-modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <p class="modal-description">Choose an alert type to insert into your content.</p>
                        <div class="alert-preview-list">
                            <div class="alert-preview-item" data-type="note">
                                <div class="alert-preview note-alert">
                                    <span class="alert-icon">${this.getIcon('githubAlertNote')}</span>
                                    <div class="alert-content">
                                        <strong>Note</strong>
                                        <p>Useful information that users should know</p>
                                    </div>
                                </div>
                            </div>
                            <div class="alert-preview-item" data-type="tip">
                                <div class="alert-preview tip-alert">
                                    <span class="alert-icon">${this.getIcon('githubAlertTip')}</span>
                                    <div class="alert-content">
                                        <strong>Tip</strong>
                                        <p>Helpful advice for doing things better or more easily</p>
                                    </div>
                                </div>
                            </div>
                            <div class="alert-preview-item" data-type="important">
                                <div class="alert-preview important-alert">
                                    <span class="alert-icon">${this.getIcon('githubAlertImportant')}</span>
                                    <div class="alert-content">
                                        <strong>Important</strong>
                                        <p>Key information users need to know to achieve their goal</p>
                                    </div>
                                </div>
                            </div>
                            <div class="alert-preview-item" data-type="warning">
                                <div class="alert-preview warning-alert">
                                    <span class="alert-icon">${this.getIcon('githubAlertWarning')}</span>
                                    <div class="alert-content">
                                        <strong>Warning</strong>
                                        <p>Urgent info that needs immediate user attention to avoid problems</p>
                                    </div>
                                </div>
                            </div>
                            <div class="alert-preview-item" data-type="caution">
                                <div class="alert-preview caution-alert">
                                    <span class="alert-icon">${this.getIcon('githubAlertCaution')}</span>
                                    <div class="alert-content">
                                        <strong>Caution</strong>
                                        <p>Advises about risks or negative outcomes of certain actions</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn cancel-btn" onclick="this.closest('.editor-pro-modal').remove()">Cancel</button>
                    </div>
                </div>
            `;
            
            // Add click handlers
            modal.querySelectorAll('.alert-preview-item').forEach(item => {
                item.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const type = item.getAttribute('data-type');
                    
                    // Insert the alert first
                    this.insertGitHubAlert(type);
                    
                    // Remove all modals comprehensively
                    // 1. Remove the specific modal
                    if (modal && modal.parentNode) {
                        modal.remove();
                    }
                    
                    // 2. Remove any remaining github alert selectors
                    document.querySelectorAll('.github-alert-selector').forEach(m => m.remove());
                    
                    // 3. Remove any editor-pro modals that might be lingering
                    document.querySelectorAll('.editor-pro-modal').forEach(m => {
                        // Check if it's a github alert modal by looking for alert-preview-item
                        if (m.querySelector('.alert-preview-item')) {
                            m.remove();
                        }
                    });
                    
                    // 4. Remove any modal overlays
                    document.querySelectorAll('.modal-overlay').forEach(overlay => {
                        const parent = overlay.parentElement;
                        if (parent && parent.classList.contains('github-alert-selector')) {
                            parent.remove();
                        }
                    });
                    
                    // Return false to prevent any default behavior
                    return false;
                };
            });
            
            document.body.appendChild(modal);
        }

        insertGitHubAlert(type) {
            if (!this.editor) return;
            
            // Get the current selection or cursor position
            const { from, to } = this.editor.state.selection;
            const selectedText = this.editor.state.doc.textBetween(from, to, ' ');
            
            // Use the insertGitHubAlert command if available
            if (this.editor.commands.insertGitHubAlert) {
                this.editor.commands.insertGitHubAlert(type, selectedText || 'Alert content here...');
            } else {
                // Fallback: insert as HTML
                const alertHTML = `<div data-github-alert="true" data-alert-type="${type}" class="markdown-alert markdown-alert-${type}"><div class="markdown-alert-content"><p>${selectedText || 'Alert content here...'}</p></div></div>`;
                this.editor.commands.insertContent(alertHTML);
            }
            
            // Delay focus slightly to ensure modal is fully removed
            setTimeout(() => {
                this.editor.focus();
            }, 50);
        }

        initializeEditor() {
            // Make editor globally accessible for block controls BEFORE creating the editor
            window.EditorPro = window.EditorPro || {};
            window.EditorPro.instances = window.EditorPro.instances || [];
            window.EditorPro.instances.push(this);
            window.EditorPro.activeEditor = this;
            window.EditorPro.editBlock = this.editBlock.bind(this);
            window.EditorPro.deleteBlock = this.deleteBlock.bind(this);
            window.EditorPro.editRawBlock = this.editRawBlock.bind(this);
            window.EditorPro.editGravImage = this.editGravImage.bind(this);
            window.EditorPro.editShortcodeBlock = this.editShortcodeBlock.bind(this);
            window.EditorPro.editInlineShortcode = this.editInlineShortcode.bind(this);
            window.EditorPro.addChildShortcodeBlock = this.addChildShortcodeBlock.bind(this);
            window.EditorPro.findNext = this.findNext.bind(this);
            window.EditorPro.replaceNext = this.replaceNext.bind(this);
            window.EditorPro.replaceAll = this.replaceAll.bind(this);
            
            // Note: Event delegation will be set up after editor is created
            
            // Function to update doc-step numbering
            window.EditorPro.updateDocStepNumbers = () => {
                const containers = document.querySelectorAll('[data-shortcode-name="doc-steps"]');
                containers.forEach(container => {
                    const steps = container.querySelectorAll('[data-shortcode-name="doc-step"]');
                    steps.forEach((step, index) => {
                        const titleSpan = step.querySelector('.preserved-block-header > span');
                        if (titleSpan) {
                            // Remove any existing numbering
                            const text = titleSpan.textContent.replace(/^\(\d+\)\s*/, '');
                            titleSpan.textContent = `(${index + 1}) ${text}`;
                        }
                    });
                });
            };

            // Debug function to inspect editor content
            window.EditorPro.debugEditorContent = () => {
                if (this.editor) {
                    const html = this.editor.getHTML();
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const alerts = tempDiv.querySelectorAll('div[data-github-alert="true"]');
                    alerts.forEach((alert, i) => {
                        // Debug output removed
                    });
                    return html;
                }
                return 'Editor not initialized';
            };
            
            const container = this.textarea.parentNode.querySelector('.editor-pro-container');
            
            if (!container) {

                return;
            }
            
            // Process initial content - always parse fresh from textarea value
            const { processed, blocks } = this.preserver.preserveContent(this.textarea.value);
            this.preservedBlocks = blocks;
            
            // Store original markdown for fresh parsing when needed
            this.originalMarkdown = this.textarea.value;

            // Prepare extensions list
            const extensions = [
                TiptapStarterKit.StarterKit.configure({
                    history: {
                        depth: 100,
                    },
                    // Disable the default paragraph extension to prevent unwanted wrapping
                    paragraph: false,
                    // Disable the default document extension to customize it
                    document: false,
                    // Disable the default codeBlock to use our CustomCodeBlock with better whitespace handling
                    codeBlock: false,
                    // Configure Strike with keyboard shortcut
                    strike: {
                        HTMLAttributes: {},
                    },
                }),
                // Use CustomCodeBlock that reads base64-encoded content to preserve whitespace/blank lines
                TiptapCustomCodeBlock.CustomCodeBlock,
                TiptapUnderline.Underline,
                TiptapTable.Table.configure({
                    resizable: true,
                }),
                TiptapTableRow.TableRow,
                TiptapTableHeader.TableHeader.extend({
                    content: 'paragraph+',
                    addAttributes() {
                        return this.parent?.() || {};
                    },
                    onCreate() {
                        // Ensure cells are created with paragraphs
                        this.options.content = 'paragraph+';
                    }
                }),
                TiptapTableCell.TableCell.extend({
                    content: 'paragraph+',
                    addAttributes() {
                        return this.parent?.() || {};
                    },
                    onCreate() {
                        // Ensure cells are created with paragraphs
                        this.options.content = 'paragraph+';
                    }
                })
            ];
            
            // Add the new extensions
            if (TiptapDragHandle && TiptapDragHandle.DragHandle) {

                // Initialize drag handles from localStorage or default to hidden
                const savedState = localStorage.getItem('editor-pro-drag-handles');
                this.dragHandlesVisible = savedState === 'true';
                
                // Try with minimal configuration first
                extensions.push(TiptapDragHandle.DragHandle.configure({
                    render: () => {
                        const element = document.createElement('div');
                        element.className = 'drag-handle';
                        element.innerHTML = '⋮⋮';
                        element.style.cursor = 'move';
                        return element;
                    },
                    // Configure which elements should have drag handles
                    threshold: 0.5,
                    dragHandleWidth: 20
                }));
            } else {

            }
            
            if (TiptapCharacterCount && TiptapCharacterCount.CharacterCount) {
                extensions.push(TiptapCharacterCount.CharacterCount.configure({
                    mode: 'textSize',
                }));
            }
            
            // Only add Typography extension if typography is enabled
            if (TiptapTypography && TiptapTypography.Typography && this.typographyEnabled &&
                window.EditorProExtraTypography && window.EditorProExtraTypography.enabled) {
                extensions.push(TiptapTypography.Typography);
            }
            
            // Add ExtraTypography extension for custom replacements
            if (TiptapExtraTypography && TiptapExtraTypography.ExtraTypography && window.EditorProExtraTypography) {
                const extraTypography = window.EditorProExtraTypography;
                if (extraTypography.custom && this.typographyEnabled) {
                    // Convert the key/value object to the format expected by ExtraTypography
                    const transforms = Object.entries(extraTypography.custom).map(([pattern, replacement]) => ({
                        pattern,
                        replacement,
                        enabled: true
                    }));
                    
                    this.extraTypographyExtension = TiptapExtraTypography.ExtraTypography.configure({
                        transforms: transforms,
                        enabled: this.typographyEnabled
                    });
                    extensions.push(this.extraTypographyExtension);
                }
            }
            
            // Add support for inline HTML elements if TiptapCore is available
            if (typeof TiptapCore !== 'undefined' && TiptapCore.Mark) {
                const inlineHtmlTags = ['abbr', 'cite', 'kbd', 'sup', 'sub', 'var', 'mark', 'time', 'samp', 'dfn', 'q', 'small', 'ins', 'del', 'bdi', 'bdo'];
                
                inlineHtmlTags.forEach(tagName => {
                    // Skip if this mark type conflicts with existing extensions
                    if (tagName === 'del' || tagName === 'ins') {
                        // These might conflict with track changes
                        return;
                    }
                    
                    const InlineHtmlMark = TiptapCore.Mark.create({
                        name: tagName,
                        
                        parseHTML() {
                            return [
                                {
                                    tag: tagName,
                                },
                            ];
                        },
                        
                        renderHTML({ HTMLAttributes }) {
                            return [tagName, HTMLAttributes, 0];
                        },
                    });
                    
                    extensions.push(InlineHtmlMark);
                });
            }
            
            // Add custom Document extension that allows block nodes without paragraph wrapping
            const CustomDocument = TiptapCore.Node.create({
                name: 'doc',
                topNode: true,
                content: '(paragraph | heading | blockquote | horizontalRule | orderedList | bulletList | codeBlock | table | shortcode | shortcodeBlock | preservedBlock | rawBlock | githubAlert | summaryDelimiter)+',
            });
            extensions.push(CustomDocument);
            
            // Add custom Paragraph extension with normal priority
            const CustomParagraph = TiptapCore.Node.create({
                name: 'paragraph',
                priority: 1000, // Normal priority - same as default paragraph
                group: 'block',
                content: 'inline*',
                parseHTML() {
                    return [{ tag: 'p' }];
                },
                renderHTML({ HTMLAttributes }) {
                    return ['p', HTMLAttributes, 0];
                },
                addCommands() {
                    return {
                        setParagraph: () => ({ commands }) => {
                            return commands.setNode(this.name);
                        },
                    };
                },
                addKeyboardShortcuts() {
                    return {
                        'Mod-Alt-0': () => this.editor.commands.setParagraph(),
                    };
                },
            });
            extensions.push(CustomParagraph);
            
            // Add Link extension if available
            if (LinkExtension) {
                // Create an extension that adds keyboard shortcut for link
                const LinkWithShortcut = TiptapCore.Extension.create({
                    name: 'linkShortcut',
                    addKeyboardShortcuts() {
                        return {
                            'Mod-k': () => {
                                // Call the insertLink method from the editor instance
                                if (window.EditorPro && window.EditorPro.activeEditor) {
                                    window.EditorPro.activeEditor.insertLink();
                                }
                                return true;
                            },
                        };
                    },
                });
                
                extensions.push(LinkExtension.configure({
                    openOnClick: false,
                    autolink: true,
                    linkOnPaste: true,
                    HTMLAttributes: {
                        target: '_blank',
                        rel: 'noopener noreferrer',
                    },
                }));
                extensions.push(LinkWithShortcut);
            } else if (typeof TiptapLink !== 'undefined' && TiptapLink.Link) {
                extensions.push(TiptapLink.Link.configure({
                    openOnClick: false,
                    autolink: true,
                    linkOnPaste: true,
                    HTMLAttributes: {
                        target: '_blank',
                        rel: 'noopener noreferrer',
                    },
                }));
            }
            
            // Add Image extension with custom attributes for Grav
            if (typeof TiptapImage !== 'undefined' && TiptapImage.Image) {
                extensions.push(TiptapImage.Image.configure({
                    inline: true,
                    allowBase64: true,
                    HTMLAttributes: {
                        class: 'editor-image',
                    },
                }).extend({
                    addAttributes() {
                        return {
                            ...this.parent?.(),
                            'data-src': { default: null },
                            class: { default: null },
                            style: { default: null },
                            loading: { default: null },
                            title: { default: null },
                        };
                    },
                    addCommands() {
                        return {
                            ...this.parent?.(),
                            setImage: (options) => ({ tr, dispatch }) => {
                                const { selection } = tr;
                                const node = this.type.create(options);
                                
                                if (dispatch) {
                                    tr.replaceRangeWith(selection.from, selection.to, node);
                                }
                                
                                return true;
                            },
                        };
                    },
                }));
            }
            
            // Add Markdown shortcuts for links and images  
            if (typeof TiptapMarkdownShortcuts !== 'undefined' && TiptapMarkdownShortcuts.MarkdownShortcuts) {
                extensions.push(TiptapMarkdownShortcuts.MarkdownShortcuts.configure({
                    enabled: true
                }));
            }
            
            // Add ShortcodeNode if available
            if (ShortcodeNode) {
                extensions.push(ShortcodeNode);
            } else {

            }
            
            // Add ShortcodeBlock if available (for block shortcodes with editable content)
            if (ShortcodeBlock) {
                extensions.push(ShortcodeBlock);
            }
            
            // Add PreservedBlock if available (for HTML/Twig blocks)
            if (PreservedBlock) {
                extensions.push(PreservedBlock);
            } else {

            }
            
            // Add PreservedInline if available (for inline shortcodes)
            if (PreservedInline) {
                extensions.push(PreservedInline);
            } else {

            }

            if (SummaryDelimiterNode) {
                extensions.push(SummaryDelimiterNode);
            }
            
            // Add RawBlock if available (for HTML/Twig editing with syntax highlighting)
            if (RawBlock) {
                extensions.push(RawBlock);
            } else {

            }
            
            // Add GitHubAlert if available (for GitHub-style markdown alerts)
            if (typeof TiptapGitHubAlert !== 'undefined' && TiptapGitHubAlert.GitHubAlert) {
                extensions.push(TiptapGitHubAlert.GitHubAlert);
            } else if (typeof window.GitHubAlert !== 'undefined') {
                extensions.push(window.GitHubAlert);
            } else {

            }
            
            // Note: Gapcursor is already included in StarterKit, no need to add it separately
            
            // Create table context menu element
            const tableContextMenu = document.createElement('div');
            tableContextMenu.className = 'editor-pro-table-context-menu';
            tableContextMenu.style.display = 'none';
            tableContextMenu.innerHTML = `
                <div class="table-menu-group">
                    <div class="table-menu-label">Row</div>
                    <button class="table-menu-item" data-action="addRowBefore">
                        <i class="fa fa-arrow-up"></i> Insert Above
                    </button>
                    <button class="table-menu-item" data-action="addRowAfter">
                        <i class="fa fa-arrow-down"></i> Insert Below
                    </button>
                    <button class="table-menu-item" data-action="deleteRow">
                        <i class="fa fa-trash"></i> Delete Row
                    </button>
                </div>
                <div class="table-menu-separator"></div>
                <div class="table-menu-group">
                    <div class="table-menu-label">Column</div>
                    <button class="table-menu-item" data-action="addColumnBefore">
                        <i class="fa fa-arrow-left"></i> Insert Before
                    </button>
                    <button class="table-menu-item" data-action="addColumnAfter">
                        <i class="fa fa-arrow-right"></i> Insert After
                    </button>
                    <button class="table-menu-item" data-action="deleteColumn">
                        <i class="fa fa-trash"></i> Delete Column
                    </button>
                </div>
                <div class="table-menu-separator"></div>
                <button class="table-menu-item danger" data-action="deleteTable">
                    <i class="fa fa-trash"></i> Delete Table
                </button>
            `;
            document.body.appendChild(tableContextMenu);
            
            // Store reference for cleanup
            this.tableContextMenu = tableContextMenu;
            
            // Add click handlers for context menu
            tableContextMenu.addEventListener('click', (e) => {
                const button = e.target.closest('.table-menu-item');
                if (button) {
                    const action = button.getAttribute('data-action');
                    if (action && this[action]) {
                        this[action]();
                        tableContextMenu.style.display = 'none';
                    }
                }
            });
            
            // Hide menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!tableContextMenu.contains(e.target)) {
                    tableContextMenu.style.display = 'none';
                }
            });

            // Create and add search highlight extension
            this.searchExtension = this.createSearchHighlightExtension();
            extensions.push(this.searchExtension);

            // Create the editor
            const initialContent = this.basicMarkdownToHtml(processed || '');
            
            this.editor = new TiptapCore.Editor({
                element: container,
                extensions: extensions,
                content: initialContent,
                onBeforeCreate: ({ editor }) => {
                },
                onCreate: ({ editor }) => {
                    // Store reference to the editor's DOM element
                    this.editorElement = editor.view.dom;

                    // NOW set up event delegation for inline shortcodes after editor is created
                    this.setupInlineShortcodeEventDelegation();

                    // Apply CSS for all shortcodes after editor is created
                    this.applyAllShortcodeCSS();

                    // Set up MutationObserver for doc-step numbering
                    const docStepObserver = new MutationObserver(() => {
                        if (window.EditorPro?.updateDocStepNumbers) {
                            window.EditorPro.updateDocStepNumbers();
                        }
                    });
                    docStepObserver.observe(this.editorElement, {
                        childList: true,
                        subtree: true
                    });

                    // Initial doc-step numbering
                    setTimeout(() => {
                        if (window.EditorPro?.updateDocStepNumbers) {
                            window.EditorPro.updateDocStepNumbers();
                        }
                    }, 100);
                    
                    // Create CodeMirror compatibility layer for Grav's media panel
                    this.createCodeMirrorCompatibility();
                    
                    // Initialize character count
                    
                    // Debug drag handle

                    const dragHandleExt = editor.extensionManager.extensions.find(ext => ext.name === 'dragHandle');
                    if (dragHandleExt) {

                    }
                    
                    // Apply initial drag handle state
                    setTimeout(() => {
                        // Apply the saved state
                        if (this.dragHandlesVisible) {
                            const wrapper = this.textarea.closest('.editor-pro-wrapper');
                            if (wrapper) {
                                wrapper.classList.add('show-drag-handles');
                            }
                            const button = this.toolbar.querySelector('[data-toolbar-item="dragHandle"]');
                            if (button) {
                                button.classList.add('is-active');
                            }
                        }

                        this.normalizeSummaryDelimiterNodes();
                        
                    }, 100);
                    
                    // Add right-click handler for table cells
                    editor.view.dom.addEventListener('contextmenu', (e) => {
                        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
                        if (!pos) return;
                        
                        const $pos = editor.state.doc.resolve(pos.pos);
                        let isInTable = false;
                        
                        // Check if we're inside a table
                        for (let d = $pos.depth; d > 0; d--) {
                            if ($pos.node(d).type.name === 'table') {
                                isInTable = true;
                                break;
                            }
                        }
                        
                        if (isInTable) {
                            e.preventDefault();
                            
                            // Position and show the context menu
                            this.tableContextMenu.style.left = e.clientX + 'px';
                            this.tableContextMenu.style.top = e.clientY + 'px';
                            this.tableContextMenu.style.display = 'block';
                            
                            // Set the selection to the clicked position
                            editor.commands.setTextSelection(pos.pos);
                        }
                    });
                },
                onUpdate: ({ editor }) => {
                    // Sync RawBlock content updates to preserved blocks
                    editor.state.doc.descendants((node, pos) => {
                        if (node.type.name === 'rawBlock' && node.attrs.blockId) {
                            const blockId = node.attrs.blockId;
                            const content = node.attrs.content || '';
                            
                            // Update or create preserved block entry
                            this.preservedBlocks.set(blockId, {
                                type: node.attrs.language || 'html',
                                content: content,
                                original: content,
                                isBlock: true
                            });
                        }
                    });
                    
                    this.updateTextarea();
                },
                onSelectionUpdate: ({ editor }) => {
                    this.updateToolbarState();
                },
                editorProps: {
                    attributes: {
                        spellcheck: 'true'
                    },
                    handleDrop: (view, event, slice, moved) => {
                        // Handle drops from media panel
                        const text = event.dataTransfer.getData('text');

                        // Check if this is an image markdown from media panel
                        const imageSyntaxRegex = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/;
                        if (text && imageSyntaxRegex.test(text)) {
                            event.preventDefault();
                            
                            // Get drop position
                            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                            if (!coords) return false;
                            
                            // Parse the markdown
                            const match = text.match(imageSyntaxRegex);
                            if (match) {
                                const [fullMatch, alt, src, title] = match;
                                
                                // Move cursor to drop position
                                this.editor.commands.setTextSelection(coords.pos);
                                
                                // Resolve and insert the image
                                this.resolveImageUrl(src).then(resolvedHtml => {
                                    // Extract the resolved src from the HTML
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(resolvedHtml, 'text/html');
                                    const imgElement = doc.querySelector('img');
                                    const resolvedSrc = imgElement ? imgElement.getAttribute('src') : src;
                                    
                                    // Update pathMappings
                                    if (!this.pathMappings.images) {
                                        this.pathMappings.images = {};
                                    }
                                    this.pathMappings.images[src] = {
                                        resolved: resolvedSrc,
                                        original: src,
                                        data_src: src,
                                        html: resolvedHtml
                                    };
                                    
                                    // Insert the image at the drop position
                                    this.editor.chain()
                                        .focus()
                                        .setTextSelection(coords.pos)
                                        .setImage({
                                            src: resolvedSrc,
                                            alt: alt || '',
                                            'data-src': src,
                                            title: title || ''
                                        })
                                        .run();
                                    
                                    // Update textarea
                                    this.updateTextarea();
                                }).catch(error => {

                                    // Fallback: insert with original src
                                    this.editor.chain()
                                        .focus()
                                        .setTextSelection(coords.pos)
                                        .setImage({
                                            src: src,
                                            alt: alt || '',
                                            'data-src': src,
                                            title: title || ''
                                        })
                                        .run();
                                    this.updateTextarea();
                                });
                                
                                return true; // Handled
                            }
                        }
                        
                        // Let TipTap handle other drops
                        return false;
                    },
                    handleClickOn: (view, pos, node, nodePos, event, direct) => {
                        // Handle clicks on images and links for editing
                        if (event.target.tagName === 'IMG') {
                            event.preventDefault();
                            this.editImage(event.target);
                            return true;
                        }
                        
                        if (event.target.tagName === 'A' || event.target.closest('a')) {
                            event.preventDefault();
                            const link = event.target.tagName === 'A' ? event.target : event.target.closest('a');
                            this.editLink(link);
                            return true;
                        }
                        
                        return false;
                    },
                    handleKeyDown: (view, event) => {
                        // Check for Ctrl/Cmd + F
                        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
                            event.preventDefault();
                            this.showFindReplace();
                            return true;
                        }
                        
                        // Check for Escape when search bar is open
                        if (event.key === 'Escape' && this.searchBar && this.searchBar.classList.contains('active')) {
                            event.preventDefault();
                            this.hideFindReplace();
                            return true;
                        }
                        
                        return false;
                    }
                }
            });
        }

        convertSummaryDelimitersToHtml(markdown) {
            if (!markdown || typeof markdown !== 'string') {
                return markdown;
            }

            const trimmedDelimiter = this.summaryDelimiterTrimmed;
            if (!trimmedDelimiter) {
                return markdown;
            }

            const rawDelimiter = this.summaryDelimiter || trimmedDelimiter;
            const lines = markdown.split(/\r?\n/);
            let inFence = false;
            let activeFence = '';

            const transformed = lines.map(line => {
                const trimmedLine = line.trim();

                const fenceMatch = trimmedLine.match(/^([`~]{3,})(.*)$/);
                if (fenceMatch) {
                    const fence = fenceMatch[1];
                    if (!inFence) {
                        inFence = true;
                        activeFence = fence;
                    } else if (activeFence && fence.startsWith(activeFence[0])) {
                        inFence = false;
                        activeFence = '';
                    }
                    return line;
                }

                if (inFence) {
                    return line;
                }

                if (trimmedLine === trimmedDelimiter) {
                    const delimiterAttr = escapeHtml(rawDelimiter);
                    const labelAttr = escapeHtml(this.summaryDelimiterLabel || SUMMARY_DELIMITER_LABEL);
                    return `\n<div data-summary-delimiter="true" data-delimiter="${delimiterAttr}" class="summary-delimiter" role="separator" aria-label="${labelAttr}"></div>\n`;
                }

                return line;
            });

            return transformed.join('\n');
        }

        /**
         * Normalize list indentation for CommonMark compatibility.
         * Converts 2-space indentation to 4-space for nested lists.
         * This allows markdown with 2-space indents to be parsed correctly.
         */
        normalizeListIndentation(markdown) {
            const lines = markdown.split('\n');
            const result = [];
            // Regex to match list items: optional whitespace + (number. or - or * or +) + space
            const listItemRegex = /^(\s*)((\d+\.)|[-*+])\s/;

            for (const line of lines) {
                const match = line.match(listItemRegex);
                if (match) {
                    const leadingSpaces = match[1];
                    const rest = line.slice(leadingSpaces.length);

                    // Count spaces and normalize to 4-space units
                    const spaceCount = leadingSpaces.length;
                    if (spaceCount > 0) {
                        // Calculate indentation level: 1-4 spaces = level 1, 5-8 = level 2, etc.
                        // This treats both 2-space and 4-space indentation as the same level
                        const levels = Math.ceil(spaceCount / 4);
                        const newIndent = '    '.repeat(levels);
                        result.push(newIndent + rest);
                    } else {
                        result.push(line);
                    }
                } else {
                    result.push(line);
                }
            }

            return result.join('\n');
        }

        /**
         * Prepare markdown for marked.js by wrapping URLs with spaces in angle brackets
         * This is required by CommonMark spec for URLs containing spaces
         */
        prepareMarkdownForMarked(markdown) {
            // Normalize list indentation (2-space to 4-space) for CommonMark compatibility
            let processed = this.normalizeListIndentation(markdown);

            // Wrap image URLs with spaces in angle brackets (but preserve title separately)
            processed = processed.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, url, title) => {
                const trimmedUrl = url.trim();
                const titleSuffix = title ? ` "${title}"` : '';
                // Only wrap if URL contains spaces and isn't already wrapped
                if (trimmedUrl.includes(' ') && !trimmedUrl.startsWith('<')) {
                    return `![${alt}](<${trimmedUrl}>${titleSuffix})`;
                }
                return match;
            });

            // Wrap link URLs with spaces in angle brackets (but preserve title separately)
            processed = processed.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, text, url, title) => {
                const trimmedUrl = url.trim();
                const titleSuffix = title ? ` "${title}"` : '';
                // Only wrap if URL contains spaces and isn't already wrapped
                if (trimmedUrl.includes(' ') && !trimmedUrl.startsWith('<')) {
                    return `[${text}](<${trimmedUrl}>${titleSuffix})`;
                }
                return match;
            });

            return processed;
        }

        basicMarkdownToHtml(markdown) {
            if (typeof marked === 'undefined') {

                return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
            }
            
            try {
                // First, resolve image paths in the markdown before processing
                let processedMarkdown = markdown.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, imagePath, imgTitle) => {
                    const resolved = this.resolveImagePath(imagePath);
                    // Wrap URL in angle brackets if it contains spaces (required by marked.js/CommonMark)
                    const url = resolved.resolved.includes(' ') ? `<${resolved.resolved}>` : resolved.resolved;
                    const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';
                    return `![${alt}](${url}${titleSuffix})`;
                });
                
                // Then resolve link paths in the markdown before processing
                processedMarkdown = processedMarkdown.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
                    const resolved = this.resolveLinkPath(linkPath);
                    // Wrap URL in angle brackets if it contains spaces (required by marked.js/CommonMark)
                    const url = resolved.resolved.includes(' ') ? `<${resolved.resolved}>` : resolved.resolved;
                    return `[${linkText}](${url})`;
                });
                
                // IMPORTANT: Replace preserved block placeholders BEFORE markdown parsing
                // This prevents marked.js from wrapping them in <p> tags
                let htmlBlocks = {};
                processedMarkdown = processedMarkdown.replace(/\{\{RAW_BLOCK_([\w_]+)\}\}/g, (match, blockId, offset, fullString) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block && (block.type === 'html' || block.type === 'twig')) {
                        // For INLINE Twig/HTML, just restore the original content inline
                        // Don't wrap in any container - let it flow with the text
                        if (block.isBlock === false) {
                            // Return the original twig/html directly - it will be escaped by marked
                            // but we want to preserve it, so use a code-like wrapper
                            return `<code class="raw-inline" data-raw-content="${encodeURIComponent(block.content)}">${escapeHtml(block.content)}</code>`;
                        }

                        // For BLOCK Twig/HTML, use div wrapper
                        const placeholder = `<!--RAW_BLOCK_PLACEHOLDER_${blockId}-->`;
                        const encodedContent = btoa(unescape(encodeURIComponent(block.content)));
                        htmlBlocks[blockId] = `<div data-raw-block="true" data-content-base64="${encodedContent}" data-language="${block.type}" data-block-id="${blockId}" class="raw-block-container">${escapeHtml(block.content)}</div>`;

                        // Ensure proper separation for block elements
                        // Check if we need newlines before/after
                        const before = offset > 0 ? fullString.charAt(offset - 1) : '';
                        const after = offset + match.length < fullString.length ? fullString.charAt(offset + match.length) : '';

                        let prefix = '';
                        let suffix = '';

                        if (before && before !== '\n') {
                            prefix = '\n\n';
                        }
                        if (after && after !== '\n') {
                            suffix = '\n\n';
                        }

                        return prefix + placeholder + suffix;
                    }
                    return match;
                });
                
                // Restore code blocks - convert placeholders back to markdown code syntax
                // This needs to happen BEFORE marked.parse so they get properly rendered
                processedMarkdown = processedMarkdown.replace(/\{\{CODE_BLOCK_([\w_]+)\}\}/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);

                    if (block) {
                        // Check both old and new type names for compatibility
                        if ((block.type === 'code_block' || block.type === 'code') && block.isFenced) {
                            // Restore as fenced code block using the original

                            return block.original;
                        }
                    }

                    return match;
                });
                
                // Restore inline code
                processedMarkdown = processedMarkdown.replace(/\{\{CODE_INLINE_([\w_]+)\}\}/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);

                    if (block) {
                        // Check both old and new type names for compatibility
                        if ((block.type === 'code_inline' || block.type === 'code') && block.isInline) {
                            // Restore as inline code using the original

                            return block.original;
                        }
                    }

                    return match;
                });
                
                // Before converting shortcode placeholders to HTML comments, handle markdown links with shortcodes
                // Pattern: [{{SHORTCODE_PLACEHOLDER_xxx}}text](url)
                processedMarkdown = processedMarkdown.replace(/\[(\{\{SHORTCODE_PLACEHOLDER_[\w_]+\}\}[^\]]*)\]\(([^)]+)\)/g, (match, linkText, url) => {

                    // Convert to a temporary placeholder that won't be affected by the HTML comment conversion
                    const tempId = `MDLINK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    // Store the link for later restoration
                    if (!this.tempMarkdownLinks) this.tempMarkdownLinks = {};
                    this.tempMarkdownLinks[tempId] = { linkText, url };
                    return `{{${tempId}}}`;
                });
                
                // First, ensure inline shortcode placeholders on separate lines stay separate
                // Add blank lines between consecutive shortcode placeholders that are on separate lines
                processedMarkdown = processedMarkdown.replace(/(\{\{SHORTCODE_PLACEHOLDER_[\w_]+\}\})\n+(\{\{SHORTCODE_PLACEHOLDER_[\w_]+\}\})/g, '$1\n\n$2');
                
                // Apply the same spacing logic to SHORTCODE_PLACEHOLDER
                let shortcodePlaceholders = {};
                processedMarkdown = processedMarkdown.replace(/\{\{SHORTCODE_PLACEHOLDER_([\w_]+)\}\}/g, (match, blockId, offset, fullString) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block && block.type === 'shortcode') {
                        const placeholder = `<!--SHORTCODE_PLACEHOLDER_${blockId}-->`;
                        shortcodePlaceholders[blockId] = true;
                        
                        // Determine if this is a block-level shortcode
                        let isBlockLevel = block.isBlock !== false; // Default to block
                        
                        // Try to get the type from the shortcode registry
                        if (!this.shortcodeRegistry && window.EditorPro?.pluginSystem?.shortcodeRegistry) {
                            this.shortcodeRegistry = window.EditorPro.pluginSystem.shortcodeRegistry;
                        }
                        
                        if (this.shortcodeRegistry) {
                            const config = this.shortcodeRegistry.get(block.tagName || block.shortcodeName);
                            if (config) {
                                isBlockLevel = config.type === 'block';
                            }
                        }
                        
                        // Also check known block-level shortcodes as fallback
                        const blockLevelShortcodes = ['section', 'columns', 'ui-accordion', 'ui-accordion-item', 'column', 'notice', 'details', 'div', 'figure'];
                        if (!this.shortcodeRegistry) {
                            isBlockLevel = blockLevelShortcodes.some(name => (block.tagName || block.shortcodeName || '').toLowerCase() === name.toLowerCase());
                        }
                        
                        // Ensure proper separation for block shortcodes
                        if (isBlockLevel) {
                            // Check if we need newlines before/after
                            const before = offset > 0 ? fullString.charAt(offset - 1) : '';
                            const after = offset + match.length < fullString.length ? fullString.charAt(offset + match.length) : '';
                            
                            let prefix = '';
                            let suffix = '';
                            
                            if (before && before !== '\n') {
                                prefix = '\n\n';
                            }
                            if (after && after !== '\n') {
                                suffix = '\n\n';
                            }
                            
                            // Block shortcodes stay as HTML comments with enforced blank lines
                            return prefix + placeholder + suffix;
                        } else if (block.onOwnLine) {
                            // For inline shortcodes that were on their own line in the original
                            // Wrap in a div to force block-level treatment
                            // This will be unwrapped later after markdown processing
                            // Keep the token text inside the wrapper to avoid comment/markdown interactions
                            return `\n\n<div class="inline-on-own-line" data-block-id="${blockId}">{{SHORTCODE_PLACEHOLDER_${blockId}}}</div>\n\n`;
                        }
                        // Inline shortcodes within text: keep the original token to preserve Markdown parsing
                        return match;
                    }
                    return match;
                });
                
                // Before passing to marked, also handle the case where a shortcode is immediately followed by a markdown link
                // Pattern: <!--SHORTCODE_PLACEHOLDER_xxx-->[text](url)
                processedMarkdown = processedMarkdown.replace(/(<!--SHORTCODE_PLACEHOLDER_[\w_]+-->)\s*\[([^\]]+)\]\(([^)]+)\)/g, (match, placeholder, linkText, url) => {

                    // Keep the placeholder and convert the link to HTML
                    return `${placeholder}<a href="${url}">${linkText}</a>`;
                });
                
                // Convert summary delimiter lines to editor-friendly HTML before Markdown parsing
                processedMarkdown = this.convertSummaryDelimitersToHtml(processedMarkdown);

                // Prepare markdown for marked.js (wrap URLs with spaces in angle brackets)
                processedMarkdown = this.prepareMarkdownForMarked(processedMarkdown);

                // Convert markdown to HTML using marked.js
                let html = marked.parse(processedMarkdown);
                
                html = this.fixSummaryDelimiterBlockquotes(html);
                
                // Now restore the markdown link placeholders as HTML links
                if (this.tempMarkdownLinks) {
                    // First check if any placeholders were found

                    // Handle placeholders wrapped in various HTML tags
                    html = html.replace(/<(h[1-6]|p)>\{\{(MDLINK_[\w_]+)\}\}<\/\1>|\{\{(MDLINK_[\w_]+)\}\}/g, (match, tag, tempId1, tempId2) => {
                        const tempId = tempId1 || tempId2;
                        const linkData = this.tempMarkdownLinks[tempId];
                        if (linkData) {

                            // Resolve the link path
                            const resolved = this.resolveLinkPath(linkData.url);
                            // Convert the link text placeholders back and create HTML link
                            const linkTextWithPlaceholders = linkData.linkText.replace(/<!--SHORTCODE_PLACEHOLDER_([\w_]+)-->/g, '{{SHORTCODE_PLACEHOLDER_$1}}');
                            const link = `<a href="${resolved.resolved}" data-href="${linkData.url}">${linkTextWithPlaceholders}</a>`;
                            // If it was wrapped in tags, keep them
                            if (tag) {
                                return `<${tag}>${link}</${tag}>`;
                            }
                            return link;
                        }
                        return match;
                    });
                    // Clear the temporary storage
                    delete this.tempMarkdownLinks;
                }
                
                // Fix code blocks that have extra trailing newlines added by marked.js
                html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (match, attrs, content) => {
                    // Remove ONE trailing newline if present (marked.js adds one)
                    const trimmedContent = content.replace(/\n$/, '');
                    return `<pre><code${attrs}>${trimmedContent}</code></pre>`;
                });
                
                // Then process GitHub alerts in the HTML
                if (typeof TiptapMarkdownParser !== 'undefined' && TiptapMarkdownParser.MarkdownParser) {
                    const parser = new TiptapMarkdownParser.MarkdownParser(this.editor);
                    html = parser.processAlertHTML(html);
                }
                
                // Restore the raw blocks from placeholders
                html = html.replace(/<!--RAW_BLOCK_PLACEHOLDER_([\w_]+)-->/g, (match, blockId) => {
                    return htmlBlocks[blockId] || match;
                });
                
                // Restore shortcode placeholders - just convert back to the original placeholder format
                // The actual rendering happens in the next replace block
                html = html.replace(/<!--SHORTCODE_PLACEHOLDER_([\w_]+)-->/g, (match, blockId) => {
                    return `{{SHORTCODE_PLACEHOLDER_${blockId}}}`;
                });
                
                // Unwrap inline shortcodes that were on their own line
                html = html.replace(/<div class="inline-on-own-line"[^>]*>([^<]+)<\/div>/g, (match, content) => {
                    // The content should be wrapped in a paragraph by marked
                    return `<p>${content}</p>`;
                });
                
                // Post-process the HTML to add data attributes for round-trip editing
                // Replace images with complete HTML from Excerpts if available
                html = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, beforeSrc, src, afterSrc) => {
                    // Find the mapping for this resolved src
                    for (const [original, mapping] of Object.entries(this.pathMappings?.images || {})) {
                        if (mapping.resolved === src) {
                            // If we have complete HTML from Excerpts, use it
                            if (mapping.html) {
                                // Parse the complete HTML and preserve alt/title if present in original
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(mapping.html, 'text/html');
                                const img = doc.querySelector('img');
                                if (img) {
                                    // Extract alt from original match if present
                                    const altMatch = match.match(/alt="([^"]*)"/);
                                    if (altMatch && altMatch[1]) {
                                        img.setAttribute('alt', altMatch[1]);
                                    }
                                    // Extract title from original match if present (added by marked.js)
                                    const titleMatch = match.match(/title="([^"]*)"/);
                                    if (titleMatch && titleMatch[1]) {
                                        img.setAttribute('title', titleMatch[1]);
                                    }
                                    // Ensure data-src is set to original
                                    img.setAttribute('data-src', original);
                                    return img.outerHTML;
                                }
                            }
                            // Fallback to manual data-src addition
                            return `<img${beforeSrc}src="${src}" data-src="${original}"${afterSrc}>`;
                        }
                    }
                    // No mapping found, add data-src = src
                    return `<img${beforeSrc}src="${src}" data-src="${src}"${afterSrc}>`;
                });
                
                // Replace complete links with complete HTML from Excerpts if available
                html = html.replace(/<a([^>]*?)href="([^"]+)"([^>]*?)>(.*?)<\/a>/g, (match, beforeHref, href, afterHref, linkText) => {
                    // Find the mapping for this resolved href
                    for (const [original, mapping] of Object.entries(this.pathMappings?.links || {})) {
                        if (mapping.resolved === href) {
                            // If we have complete HTML from Excerpts, use it
                            if (mapping.html) {
                                // Parse the complete HTML and preserve link text
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(mapping.html, 'text/html');
                                const link = doc.querySelector('a');
                                if (link) {
                                    // Preserve the original link text with HTML formatting
                                    link.innerHTML = linkText;
                                    // Ensure data-href is set to original
                                    link.setAttribute('data-href', original);
                                    return link.outerHTML;
                                }
                            }
                            // Fallback to manual data-href addition
                            return `<a${beforeHref}href="${href}" data-href="${original}"${afterHref}>${linkText}</a>`;
                        }
                    }
                    // No mapping found, add data-href = href
                    return `<a${beforeHref}href="${href}" data-href="${href}"${afterHref}>${linkText}</a>`;
                });
                
                // Replace GitHub alert placeholders
                html = html.replace(/\{\{GITHUB_ALERT_([\w_]+)\}\}/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block && block.type === 'github-alert') {
                        // Convert back to HTML structure that GitHubAlert node expects
                        const alertType = block.alertType;
                        const content = this.safeMarkdownParse(block.content);
                        return `<div data-github-alert="true" data-alert-type="${alertType}" class="markdown-alert markdown-alert-${alertType}"><div class="markdown-alert-content">${content}</div></div>`;
                    }
                    return match;
                });
                
                // Then replace preserved block placeholders with proper elements
                html = html.replace(/\{\{(PRESERVED_BLOCK_|SHORTCODE_PLACEHOLDER_)([\w_]+)\}\}/g, (match, prefix, blockId) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block) {
                        
                        // Update shortcode type if registry is available and block is a shortcode
                        if (block.type === 'shortcode') {
                            // Ensure registry is initialized
                            if (!this.shortcodeRegistry && window.EditorPro?.pluginSystem?.shortcodeRegistry) {
                                this.shortcodeRegistry = window.EditorPro.pluginSystem.shortcodeRegistry;
                            }
                            
                            if (this.shortcodeRegistry) {
                                const config = this.shortcodeRegistry.get(block.tagName);
                                if (config) {
                                    block.shortcodeType = config.type || 'block';
                                    block.isBlock = block.shortcodeType === 'block';
                                }
                            }
                        }
                        // Handle inline preserved content differently
                        if (block.isBlock === false || block.shortcodeType === 'inline') {

                            if (block.type === 'grav-image') {
                                // Resolve the image path and render a real <img> so it displays in-editor
                                const resolved = this.resolveImagePath(block.imagePath + (block.queryString || ''));
                                const alt = block.alt || '';
                                const attrs = `src="${escapeHtml(resolved.resolved)}" alt="${escapeHtml(alt)}" data-src="${escapeHtml(resolved.original)}"`;
                                return `<img ${attrs}>`;
                            } else if (block.type === 'shortcode') {
                                // Check if we need to update the shortcode type
                                if (!block.shortcodeConfig && this.shortcodeRegistry) {
                                    const config = this.shortcodeRegistry.get(block.tagName);
                                    if (config) {
                                        block.shortcodeConfig = config;
                                        block.shortcodeType = config.type || 'block';
                                        block.isBlock = block.shortcodeType === 'block';
                                    }
                                }
                                
                                if (block.shortcodeType === 'inline') {
                                    // Handle inline shortcodes - use preservedInline node structure
                                    
                                    // Generate custom CSS if available
                                    let customCSS = '';
                                    try {
                                        const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                                        if (registry && block.attributes) {
                                            registry.ensureInitialized();
                                            customCSS = registry.generateCSS(block.tagName, block.attributes);
                                        }
                                    } catch (error) {

                                    }
                                    
                                    const styleAttr = customCSS ? ` style="${escapeHtml(customCSS)}"` : '';
                                    const inlineHtml = `<span data-preserved-inline="true" data-block-id="${blockId}" data-block-type="shortcode" data-block-data='${JSON.stringify(block)}' class="preserved-inline shortcode" contenteditable="false" title="${escapeHtml(block.original)} (click to edit)"${styleAttr}>${escapeHtml(block.original)}</span>`;
                                    return inlineHtml;
                                }
                            }
                            // Other inline types can be added here
                            return `<span data-preserved-inline="true" data-block-id="${blockId}" data-block-type="${block.type}" data-block-data='${JSON.stringify(block)}' class="preserved-inline ${block.type}">${escapeHtml(block.original)}</span>`;
                        }
                        
                        // For block-level content, return appropriate placeholder
                        if (block.type === 'shortcode' && block.isBlock) {
                            // Check if this is a code-type shortcode
                            const isCodeShortcode = block.contentType === 'code';

                            // Use shortcodeBlock for block shortcodes with content inside
                            let innerContent = '';

                            if (isCodeShortcode) {
                                // Code shortcodes: store raw content in data attribute, no inner HTML
                                innerContent = '';
                            } else if (block.content) {
                                let processedContent = block.content;

                                // Replace markdown images with resolved paths before parsing
                                processedContent = processedContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title) => {
                                    const mapping = this.pathMappings?.images?.[src];
                                    const titleSuffix = title ? ` "${title}"` : '';
                                    if (mapping && mapping.html) {
                                        // Parse the complete HTML and add title/alt if present
                                        const parser = new DOMParser();
                                        const doc = parser.parseFromString(mapping.html, 'text/html');
                                        const img = doc.querySelector('img');
                                        if (img) {
                                            if (alt) img.setAttribute('alt', alt);
                                            if (title) img.setAttribute('title', title);
                                            return img.outerHTML;
                                        }
                                        return mapping.html;
                                    }
                                    // Fallback to resolved path if no HTML
                                    if (mapping && mapping.resolved) {
                                        return `![${alt}](${mapping.resolved}${titleSuffix})`;
                                    }
                                    return match;
                                });

                                // Process nested shortcode placeholders recursively to handle any depth
                                processedContent = this.processNestedShortcodePlaceholders(processedContent, block, 1);

                                // First, restore CODE_BLOCK placeholders back to fenced code blocks
                                // so we can then protect them from marked.parse() issues with ---
                                processedContent = processedContent.replace(/\{\{CODE_BLOCK_([\w_]+)\}\}/g, (match, codeBlockId) => {
                                    const codeBlock = this.preservedBlocks.get(codeBlockId);
                                    if (codeBlock && codeBlock.original) {
                                        return codeBlock.original;
                                    }
                                    return match;
                                });

                                // Preserve fenced code blocks before marked.parse() to prevent issues
                                // with special characters like --- being misinterpreted
                                const fencedCodeBlocks = [];
                                processedContent = processedContent.replace(/```(\w*)\s*\n([\s\S]*?)```/gm, (match, language, code) => {
                                    const idx = fencedCodeBlocks.length;
                                    // Trim leading/trailing whitespace from code content
                                    fencedCodeBlocks.push({ language: language.trim(), code: code.replace(/^\n+|\n+$/g, '') });
                                    return `<!--FENCED_CODE_${idx}-->`;
                                });

                                // Convert the content to HTML for the editor
                                try {
                                    innerContent = marked.parse(processedContent);
                                } catch (e) {
                                    innerContent = `<p>${processedContent}</p>`;
                                }

                                // Helper to generate code block HTML
                                // We encode the content as base64 in a data attribute to preserve whitespace/blank lines
                                const generateCodeBlockHtml = (codeBlock) => {
                                    const langAttr = codeBlock.language ? ` data-language="${codeBlock.language}"` : '';
                                    const encodedContent = btoa(unescape(encodeURIComponent(codeBlock.code)));
                                    return `<pre data-code-content="${encodedContent}"${langAttr}><code>${codeBlock.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
                                };

                                // First, handle placeholders wrapped in <p> tags by marked.parse()
                                // This prevents invalid HTML (<pre> inside <p>) that confuses TipTap
                                fencedCodeBlocks.forEach((codeBlock, idx) => {
                                    const wrappedRegex = new RegExp(`<p>\\s*<!--FENCED_CODE_${idx}-->\\s*</p>`, 'g');
                                    innerContent = innerContent.replace(wrappedRegex, generateCodeBlockHtml(codeBlock));
                                });

                                // Then handle any remaining standalone placeholders
                                fencedCodeBlocks.forEach((codeBlock, idx) => {
                                    innerContent = innerContent.replace(`<!--FENCED_CODE_${idx}-->`, generateCodeBlockHtml(codeBlock));
                                });
                            }
                            // Normalize params to ensure all attributes are quoted
                            const normalizedParams = this.preserver.normalizeShortcodeParams(block.params || '');
                            // Store params in a base64-encoded format to avoid escaping issues
                            const encodedParams = btoa(unescape(encodeURIComponent(normalizedParams)));

                            // Build the div attributes, including code content for code-type shortcodes
                            let divAttrs = `data-shortcode-block="true" data-shortcode-name="${block.tagName}" data-params-base64="${encodedParams}" data-attributes='${JSON.stringify(block.attributes || {})}' data-placeholder-id="${blockId}" data-content-type="${isCodeShortcode ? 'code' : 'blocks'}"`;

                            if (isCodeShortcode && block.codeContent) {
                                const encodedCodeContent = btoa(unescape(encodeURIComponent(block.codeContent)));
                                divAttrs += ` data-code-content="${encodedCodeContent}"`;
                            }

                            return `<div ${divAttrs} class="shortcode-block ${block.tagName}">${innerContent}</div>`;
                        } else {
                            // Use preservedBlock for HTML/Twig blocks
                            return `<div data-preserved-block="true" data-block-id="${blockId}" data-block-type="${block.type}" data-block-data='${JSON.stringify(block)}' class="preserved-block ${block.type}"></div>`;
                        }
                    }
                    return match;
                });
                
                // Also handle preserved blocks that got wrapped in paragraphs or other elements
                html = html.replace(/<p>\{\{PRESERVED_BLOCK_([\w_]+)\}\}<\/p>/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block) {
                        const blockTitle = getBlockTitle(block.type, block);
                        let blockContent = formatBlockContent(block.content || '', block);
                        
                        // For shortcodes, convert the inner content from markdown to HTML with path resolution
                        // Skip content area for injection shortcodes (they inject external content)
                        if (block.type === 'shortcode' && block.isClosing && block.content && !block.isInjectionShortcode) {
                            try {
                                let markdownContent = block.content;
                                
                                // Resolve image paths before converting to HTML
                                markdownContent = markdownContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title) => {
                                    const resolved = this.resolveImagePath(src);
                                    const titleSuffix = title ? ` "${title}"` : '';
                                    return `![${alt}](${resolved.resolved}${titleSuffix})`;
                                });

                                blockContent = this.safeMarkdownParse(markdownContent);
                                // Remove wrapping <p> tags if they exist
                                blockContent = blockContent.replace(/^<p>(.*)<\/p>\s*$/s, '$1');

                                // Process any nested shortcode placeholders
                                blockContent = this.processShortcodePlaceholders(blockContent);
                            } catch (error) {

                            }
                        }

                        const shortcodeNameAttr = block.type === 'shortcode' && block.tagName ? ` data-shortcode-name="${block.tagName}"` : '';
                        return `<div data-preserved-block="true" data-block-id="${blockId}" data-block-type="${block.type}"${shortcodeNameAttr} data-block-data='${JSON.stringify(block)}' class="preserved-block ${block.type}">
                            <div class="preserved-block-header">
                                <span>${blockTitle}</span>
                                <div class="preserved-block-controls">
                                    <button type="button" onclick="window.EditorPro.editBlock('${blockId}')">Edit</button>
                                    <button type="button" onclick="window.EditorPro.deleteBlock('${blockId}')">Delete</button>
                                </div>
                            </div>
                            ${(!block.isInjectionShortcode && block.isClosing) ? `<div class="preserved-block-content" contenteditable="true" spellcheck="false">${block.type === 'shortcode' && block.isClosing ? blockContent : escapeHtml(blockContent)}</div>` : ''}
                        </div>`;
                    }
                    return match;
                });

                // Handle preserved blocks that got wrapped in strong tags by marked.js
                html = html.replace(/<strong>\{\{PRESERVED_BLOCK_([\w_]+)\}\}<\/strong>/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block) {
                        // Inline content wrapped in strong should stay inline
                        if (block.isBlock === false) {
                            if (block.type === 'grav-image') {
                                const resolved = this.resolveImagePath(block.imagePath + (block.queryString || ''));
                                const alt = block.alt || '';
                                return `<img src="${escapeHtml(resolved.resolved)}" alt="${escapeHtml(alt)}" data-src="${escapeHtml(resolved.original)}">`;
                            }
                            return `<span data-preserved-inline="true" data-block-id="${blockId}" data-block-type="${block.type}" class="preserved-inline ${block.type}">${escapeHtml(block.original)}</span>`;
                        }

                        // Block content shouldn't be in strong tags, but handle it anyway
                        const blockTitle = getBlockTitle(block.type, block);
                        let blockContent = formatBlockContent(block.content || '', block);

                        // For shortcodes, convert the inner content from markdown to HTML with path resolution
                        // Skip content area for injection shortcodes (they inject external content)
                        if (block.type === 'shortcode' && block.isClosing && block.content && !block.isInjectionShortcode) {
                            try {
                                let markdownContent = block.content;

                                // Resolve image paths before converting to HTML
                                markdownContent = markdownContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title) => {
                                    const resolved = this.resolveImagePath(src);
                                    const titleSuffix = title ? ` "${title}"` : '';
                                    return `![${alt}](${resolved.resolved}${titleSuffix})`;
                                });

                                blockContent = this.safeMarkdownParse(markdownContent);
                                // Remove wrapping <p> tags if they exist
                                blockContent = blockContent.replace(/^<p>(.*)<\/p>\s*$/s, '$1');

                                // Process any nested shortcode placeholders
                                blockContent = this.processShortcodePlaceholders(blockContent);
                            } catch (error) {

                            }
                        }

                        const shortcodeNameAttr = block.type === 'shortcode' && block.tagName ? ` data-shortcode-name="${block.tagName}"` : '';
                        return `<div data-preserved-block="true" data-block-id="${blockId}" data-block-type="${block.type}"${shortcodeNameAttr} data-block-data='${JSON.stringify(block)}' class="preserved-block ${block.type}">
                            <div class="preserved-block-header">
                                <span>${blockTitle}</span>
                                <div class="preserved-block-controls">
                                    <button type="button" onclick="window.EditorPro.editBlock('${blockId}')">Edit</button>
                                    <button type="button" onclick="window.EditorPro.deleteBlock('${blockId}')">Delete</button>
                                </div>
                            </div>
                            ${(!block.isInjectionShortcode && block.isClosing) ? `<div class="preserved-block-content" contenteditable="true" spellcheck="false">${block.type === 'shortcode' && block.isClosing ? blockContent : escapeHtml(blockContent)}</div>` : ''}
                        </div>`;
                    }
                    return match;
                });

                // Handle preserved blocks that got wrapped in paragraphs AND strong tags
                html = html.replace(/<p><strong>\{\{PRESERVED_BLOCK_([\w_]+)\}\}<\/strong><\/p>/g, (match, blockId) => {
                    const block = this.preservedBlocks.get(blockId);
                    if (block) {
                        const blockTitle = getBlockTitle(block.type, block);
                        let blockContent = formatBlockContent(block.content || '', block);

                        // For shortcodes, convert the inner content from markdown to HTML with path resolution
                        // Skip content area for injection shortcodes (they inject external content)
                        if (block.type === 'shortcode' && block.isClosing && block.content && !block.isInjectionShortcode) {
                            try {
                                let markdownContent = block.content;

                                // Resolve image paths before converting to HTML
                                markdownContent = markdownContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title) => {
                                    const resolved = this.resolveImagePath(src);
                                    const titleSuffix = title ? ` "${title}"` : '';
                                    return `![${alt}](${resolved.resolved}${titleSuffix})`;
                                });

                                blockContent = this.safeMarkdownParse(markdownContent);
                                // Remove wrapping <p> tags if they exist
                                blockContent = blockContent.replace(/^<p>(.*)<\/p>\s*$/s, '$1');

                                // Process any nested shortcode placeholders
                                blockContent = this.processShortcodePlaceholders(blockContent);
                            } catch (error) {

                            }
                        }
                        
                        const shortcodeNameAttr = block.type === 'shortcode' && block.tagName ? ` data-shortcode-name="${block.tagName}"` : '';
                        return `<div data-preserved-block="true" data-block-id="${blockId}" data-block-type="${block.type}"${shortcodeNameAttr} data-block-data='${JSON.stringify(block)}' class="preserved-block ${block.type}">
                            <div class="preserved-block-header">
                                <span>${blockTitle}</span>
                                <div class="preserved-block-controls">
                                    <button type="button" onclick="window.EditorPro.editBlock('${blockId}')">Edit</button>
                                    <button type="button" onclick="window.EditorPro.deleteBlock('${blockId}')">Delete</button>
                                </div>
                            </div>
                            ${(!block.isInjectionShortcode && block.isClosing) ? `<div class="preserved-block-content" contenteditable="true" spellcheck="false">${block.type === 'shortcode' && block.isClosing ? blockContent : escapeHtml(blockContent)}</div>` : ''}
                        </div>`;
                    }
                    return match;
                });
                
                // Post-process shortcode placeholders after markdown conversion
                html = this.processShortcodePlaceholders(html);
                
                // Clean up unwanted paragraph wrapping around block elements
                // This prevents TipTap from adding extra <p> tags around our custom blocks
                html = this.cleanBlockWrapping(html);
                
                // Fix empty table cells - TipTap requires at least one paragraph in each cell
                html = this.fixEmptyTableCells(html);
                html = this.fixSummaryDelimiterBlockquotes(html);

                return html;
                
            } catch (error) {

                return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
            }
        }

        processShortcodePlaceholders(html) {
            
            // Replace shortcode placeholders with actual shortcode HTML
            // Also handle cases where placeholders might be wrapped in <p> tags by marked.js
            html = html.replace(/<p>\s*\{\{SHORTCODE_PLACEHOLDER_([^}]+)\}\}\s*<\/p>/g, (match, blockId) => {
                return this.processShortcodePlaceholder(blockId);
            });
            
            // Handle unwrapped placeholders
            html = html.replace(/\{\{SHORTCODE_PLACEHOLDER_([^}]+)\}\}/g, (match, blockId) => {
                return this.processShortcodePlaceholder(blockId);
            });
            
            // Handle inline shortcode placeholders (these should always be inline)
            html = html.replace(/\{\{INLINE_SHORTCODE_PLACEHOLDER_([^}]+)\}\}/g, (match, blockId) => {
                const block = this.preservedBlocks.get(blockId);
                if (block && block.type === 'shortcode' && (block.shortcodeType === 'inline' || block.isBlock === false)) {
                    const blockDataJson = JSON.stringify(block).replace(/"/g, '&quot;');
                    
                    // Generate custom CSS if available
                    let customCSS = '';
                    try {
                        const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                        if (registry && block.attributes) {
                            registry.ensureInitialized();
                            customCSS = registry.generateCSS(block.tagName, block.attributes);
                        }
                    } catch (error) {

                    }
                    
                    const styleAttr = customCSS ? ` style="${escapeHtml(customCSS)}"` : '';
                    return `<span data-preserved-inline="true" data-block-id="${blockId}" data-block-type="shortcode" data-block-data="${blockDataJson}" class="preserved-inline shortcode" contenteditable="false" title="${escapeHtml(block.original)} (click to edit)"${styleAttr}>${escapeHtml(block.original)}</span>`;
                }
                return match;
            });
            
            return html;
        }

        // Helper method to safely parse markdown while protecting fenced code blocks
        // This prevents marked.js from misinterpreting --- and other special chars inside code
        safeMarkdownParse(markdown) {
            if (!markdown || typeof marked === 'undefined') {
                return markdown || '';
            }

            // Convert legacy <samp> content (from previous hack) back to fenced code blocks
            // This handles content that was saved with the old workaround
            let processed = markdown.replace(/<samp>([\s\S]*?)<\/samp>/gi, (match, code) => {
                // Clean up the code: remove trailing spaces from each line (from the <br> hack)
                const cleanedCode = code
                    .split(/\s{2}\n|\s{2}$/)  // Split on double-space+newline or double-space at end
                    .join('\n')
                    .replace(/\s+$/, '');  // Trim trailing whitespace
                return '```\n' + cleanedCode + '\n```';
            });

            // Preserve fenced code blocks before marked.parse() to prevent issues
            // with special characters like --- being misinterpreted
            // Match ``` optionally followed by language, then newline(s), then content, then ```
            const fencedCodeBlocks = [];
            processed = processed.replace(/```(\w*)\s*\n([\s\S]*?)```/gm, (match, language, code) => {
                const idx = fencedCodeBlocks.length;
                // Trim leading/trailing whitespace from code content
                fencedCodeBlocks.push({ language: language.trim(), code: code.replace(/^\n+|\n+$/g, '') });
                return `<!--FENCED_CODE_${idx}-->`;
            });

            // Parse markdown
            let html;
            try {
                html = marked.parse(processed);
            } catch (e) {
                html = `<p>${processed}</p>`;
            }

            // Helper to generate code block HTML
            // We encode the content as base64 in a data attribute to preserve whitespace/blank lines
            // This bypasses TipTap's DOMParser whitespace normalization issues
            const generateCodeBlockHtml = (codeBlock) => {
                const langAttr = codeBlock.language ? ` data-language="${codeBlock.language}"` : '';
                const encodedContent = btoa(unescape(encodeURIComponent(codeBlock.code)));
                return `<pre data-code-content="${encodedContent}"${langAttr}><code>${codeBlock.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
            };

            // First, handle placeholders that got wrapped in <p> tags by marked.parse()
            // This is important because <pre> inside <p> is invalid HTML and confuses TipTap
            fencedCodeBlocks.forEach((codeBlock, idx) => {
                // Match placeholder wrapped in paragraph (with possible whitespace)
                const wrappedRegex = new RegExp(`<p>\\s*<!--FENCED_CODE_${idx}-->\\s*</p>`, 'g');
                html = html.replace(wrappedRegex, generateCodeBlockHtml(codeBlock));
            });

            // Then handle any remaining standalone placeholders (not wrapped in <p>)
            fencedCodeBlocks.forEach((codeBlock, idx) => {
                html = html.replace(
                    `<!--FENCED_CODE_${idx}-->`,
                    generateCodeBlockHtml(codeBlock)
                );
            });

            return html;
        }

        // Recursive function to process nested shortcode placeholders at any depth
        processNestedShortcodePlaceholders(content, parentBlock = null, depth = 0) {
            if (depth > 10) {

                return content;
            }

            return content.replace(/\{\{SHORTCODE_PLACEHOLDER_([\w_]+)\}\}/g, (match, nestedBlockId) => {
                const nestedBlock = this.preservedBlocks.get(nestedBlockId);
                if (!nestedBlock || nestedBlock.type !== 'shortcode') {
                    return match;
                }

                // Get shortcode config for parent and child
                const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                const parentConfig = parentBlock ? registry?.get(parentBlock.tagName) : null;
                const childConfig = registry?.get(nestedBlock.tagName);
                
                // Check if parent has restricted children (like tabs, accordion)
                const hasRestrictedChildren = parentConfig && parentConfig.allowedChildren && parentConfig.allowedChildren.length > 0;
                
                // Handle inline shortcodes first
                if (nestedBlock.shortcodeType === 'inline' || nestedBlock.isBlock === false) {

                    return `{{INLINE_SHORTCODE_PLACEHOLDER_${nestedBlockId}}}`;
                }

                // Check if this is a code-type shortcode
                const isCodeShortcode = nestedBlock.contentType === 'code' || childConfig?.contentType === 'code';

                // Process nested block shortcodes
                let nestedInnerContent = '';
                if (!isCodeShortcode && nestedBlock.content) {
                    // First, recursively process any deeper nested shortcodes
                    let processedContent = this.processNestedShortcodePlaceholders(nestedBlock.content, nestedBlock, depth + 1);

                    // Resolve image paths in the markdown before processing (preserve titles)
                    processedContent = processedContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, imagePath, imgTitle) => {
                        const resolved = this.resolveImagePath(imagePath);
                        const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';
                        return `![${alt}](${resolved.resolved}${titleSuffix})`;
                    });

                    // Resolve link paths in the markdown before processing
                    processedContent = processedContent.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
                        const resolved = this.resolveLinkPath(linkPath);
                        return `[${linkText}](${resolved.resolved})`;
                    });

                    // Use safe markdown parsing that protects fenced code blocks
                    nestedInnerContent = this.safeMarkdownParse(processedContent);
                }

                // Normalize params and encode them
                const normalizedParams = this.preserver.normalizeShortcodeParams(nestedBlock.params || '');
                const encodedParams = btoa(unescape(encodeURIComponent(normalizedParams)));

                // Build the div attributes, including code content for code-type shortcodes
                let divAttrs = `data-shortcode-block="true" data-shortcode-name="${nestedBlock.tagName}" data-params-base64="${encodedParams}" data-attributes='${JSON.stringify(nestedBlock.attributes || {})}' data-placeholder-id="${nestedBlockId}" data-content-type="${isCodeShortcode ? 'code' : 'blocks'}"`;

                if (isCodeShortcode && (nestedBlock.codeContent || nestedBlock.content)) {
                    const codeContent = nestedBlock.codeContent || nestedBlock.content;
                    const encodedCodeContent = btoa(unescape(encodeURIComponent(codeContent)));
                    divAttrs += ` data-code-content="${encodedCodeContent}"`;
                }

                // Return the rendered block shortcode div
                return `<div ${divAttrs} class="shortcode-block ${nestedBlock.tagName}">${nestedInnerContent}</div>`;
            });
        }
        
        processShortcodePlaceholder(blockId) {
                const block = this.preservedBlocks.get(blockId);
                if (!block || block.type !== 'shortcode') {
                    return `{{SHORTCODE_PLACEHOLDER_${blockId}}}`; // Keep placeholder if block not found
                }
                
                // For self-closing shortcodes, handle them differently
                if (block.isSelfClosing) {
                    // Self-closing shortcodes should be rendered as shortcode blocks
                    const escapedParams = (block.params || '').replace(/"/g, '&quot;');
                    const encodedParams = block.params ? btoa(unescape(encodeURIComponent(block.params))) : '';
                    
                    // For inline self-closing shortcodes, return inline representation
                    if (block.shortcodeType === 'inline' || block.isBlock === false) {
                        // Return as an inline shortcode span
                        return `<span data-shortcode-inline="true" data-shortcode-name="${block.tagName}" data-params="${escapedParams}" data-params-base64="${encodedParams}" data-attributes='${JSON.stringify(block.attributes || {})}' data-placeholder-id="${blockId}" class="shortcode-inline ${block.tagName}">[${block.tagName}${block.params ? ' ' + block.params : ''} /]</span>`;
                    }
                    
                    // For block self-closing shortcodes
                    return `<div data-shortcode-block="true" data-shortcode-name="${block.tagName}" data-params="${escapedParams}" data-params-base64="${encodedParams}" data-attributes='${JSON.stringify(block.attributes || {})}' data-placeholder-id="${blockId}" class="shortcode-block ${block.tagName}"></div>`;
                }
                
                // Process the shortcode content as markdown with proper image/link resolution
                let processedContent = block.content;
                
                // Check if content contains nested shortcode placeholders
                const hasNestedPlaceholders = /\{\{SHORTCODE_PLACEHOLDER_[^}]+\}\}/.test(processedContent);
                
                if (typeof marked !== 'undefined' && processedContent) {
                    try {
                        // If we have nested placeholders, we need to handle them specially
                        if (hasNestedPlaceholders) {
                            // Split content by placeholders to process markdown parts separately
                            const parts = [];
                            let lastIndex = 0;
                            const placeholderRegex = /\{\{SHORTCODE_PLACEHOLDER_([^}]+)\}\}/g;
                            let placeholderMatch;
                            
                            while ((placeholderMatch = placeholderRegex.exec(processedContent)) !== null) {
                                // Add markdown content before placeholder
                                if (placeholderMatch.index > lastIndex) {
                                    const markdownPart = processedContent.substring(lastIndex, placeholderMatch.index);
                                    if (markdownPart.trim()) {
                                        // Process this markdown part
                                        let processedPart = markdownPart;
                                        // Apply image resolution
                                        processedPart = processedPart.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, imagePath, imgTitle) => {
                                            const resolved = this.resolveImagePath(imagePath);
                                            const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';
                                            return `![${alt}](${resolved.resolved}${titleSuffix})`;
                                        });
                                        // Apply link resolution
                                        processedPart = processedPart.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
                                            const resolved = this.resolveLinkPath(linkPath);
                                            return `[${linkText}](${resolved.resolved})`;
                                        });
                                        // Convert to HTML (use safe parsing for fenced code blocks)
                                        processedPart = this.safeMarkdownParse(processedPart);
                                        parts.push(processedPart);
                                    }
                                }
                                // Add placeholder as-is
                                parts.push(placeholderMatch[0]);
                                lastIndex = placeholderMatch.index + placeholderMatch[0].length;
                            }

                            // Process any remaining markdown after last placeholder
                            if (lastIndex < processedContent.length) {
                                const remainingPart = processedContent.substring(lastIndex);
                                if (remainingPart.trim()) {
                                    let processedPart = remainingPart;
                                    // Apply image resolution
                                    processedPart = processedPart.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, imagePath, imgTitle) => {
                                        const resolved = this.resolveImagePath(imagePath);
                                        const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';
                                        return `![${alt}](${resolved.resolved}${titleSuffix})`;
                                    });
                                    // Apply link resolution
                                    processedPart = processedPart.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
                                        const resolved = this.resolveLinkPath(linkPath);
                                        return `[${linkText}](${resolved.resolved})`;
                                    });
                                    // Convert to HTML (use safe parsing for fenced code blocks)
                                    processedPart = this.safeMarkdownParse(processedPart);
                                    parts.push(processedPart);
                                }
                            }
                            
                            // Join all parts
                            processedContent = parts.join('');
                            
                            // Now recursively process the nested placeholders
                            processedContent = this.processShortcodePlaceholders(processedContent);
                        } else {
                            // No nested placeholders, process normally
                            // Apply the same image and link resolution as in basicMarkdownToHtml
                            // First, resolve image paths in the markdown before processing
                            processedContent = processedContent.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (match, alt, imagePath, imgTitle) => {
                                const resolved = this.resolveImagePath(imagePath);
                                const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';
                                return `![${alt}](${resolved.resolved}${titleSuffix})`;
                            });
                            
                            // Then resolve link paths in the markdown before processing
                            processedContent = processedContent.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
                                const resolved = this.resolveLinkPath(linkPath);
                                return `[${linkText}](${resolved.resolved})`;
                            });

                            // Convert markdown to HTML (use safe parsing for fenced code blocks)
                            processedContent = this.safeMarkdownParse(processedContent);
                        }
                        
                        // Apply the same post-processing as in basicMarkdownToHtml
                        processedContent = processedContent.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, beforeSrc, src, afterSrc) => {
                            // Find the mapping for this resolved src
                            for (const [original, mapping] of Object.entries(this.pathMappings?.images || {})) {
                                if (mapping.resolved === src) {
                                    return `<img${beforeSrc}src="${src}" data-src="${original}"${afterSrc}>`;
                                }
                            }
                            return `<img${beforeSrc}src="${src}" data-src="${src}"${afterSrc}>`;
                        });
                        
                        // Remove unnecessary paragraph wrappers that are auto-generated by marked.parse()
                        // This prevents extra padding around shortcode blocks in the editor
                        processedContent = this.removeUnnecessaryParagraphs(processedContent);
                        
                    } catch (error) {

                    }
                }
                
                // Escape quotes in params for HTML attribute
                const escapedParams = block.params.replace(/"/g, '&quot;');
                
                // Parse attributes from params string to pass to shortcode-block
                const attributes = {};
                if (block.params) {
                    // Updated regex to handle both quoted and unquoted attributes
                    // Matches: attribute="value", attribute='value', or attribute=value
                    const attrRegex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
                    let attrMatch;
                    while ((attrMatch = attrRegex.exec(block.params)) !== null) {
                        // attrMatch[2] = double quoted, attrMatch[3] = single quoted, attrMatch[4] = unquoted
                        const value = attrMatch[2] !== undefined ? attrMatch[2] : 
                                     (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
                        attributes[attrMatch[1]] = value;
                    }
                }
                
                // Return the shortcode HTML using the new shortcode-block format
                return `<div data-shortcode-block="true" data-shortcode-name="${block.tagName}" data-params="${escapedParams}" data-attributes='${JSON.stringify(attributes)}' data-placeholder-id="${blockId}" class="shortcode-block ${block.tagName}">${processedContent}</div>`;
        }

        fixSummaryDelimiterBlockquotes(html) {
            if (!html || typeof html !== 'string') {
                return html;
            }

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const delimiters = Array.from(doc.querySelectorAll('blockquote div[data-summary-delimiter]'));

                delimiters.forEach(delimiter => {
                    const blockquote = delimiter.closest('blockquote');
                    if (!blockquote || !blockquote.parentNode) {
                        return;
                    }

                    const parent = blockquote.parentNode;
                    const nodesToMove = [];
                    let current = delimiter;

                    while (current) {
                        const next = current.nextSibling;
                        nodesToMove.push(current);
                        current = next;
                    }

                    nodesToMove.forEach(node => {
                        parent.insertBefore(node, blockquote.nextSibling);
                    });

                    const hasContent = Array.from(blockquote.childNodes).some(child => {
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            return true;
                        }
                        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
                            return true;
                        }
                        return false;
                    });

                    if (!hasContent) {
                        parent.removeChild(blockquote);
                    }
                });

                return doc.body.innerHTML;
            } catch (error) {
                return html;
            }
        }

        cleanBlockWrapping(html) {
            // Remove paragraph tags that wrap our custom block elements
            // This prevents double-wrapping when TipTap parses the content
            
            // Pattern to match <p> tags containing only block-level custom elements
            const blockElements = [
                'div[data-shortcode-block]',
                'div[data-github-alert]',
                'div[data-raw-block]',
                'div[data-preserved-block]',
                'div[data-summary-delimiter]',
                'div[data-shortcode]',
                'div.shortcode-block',
                'div.markdown-alert',
                'div.raw-block',
                'div.preserved-block',
                'div.summary-delimiter'
            ];
            
            // Create a temporary DOM to manipulate
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Find all paragraphs
            const paragraphs = doc.querySelectorAll('p');
            
            paragraphs.forEach(p => {
                // Check if paragraph contains only whitespace and a single block element
                const children = Array.from(p.childNodes).filter(node => {
                    // Filter out whitespace-only text nodes
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.textContent.trim().length > 0;
                    }
                    return true;
                });
                
                // If there's exactly one child and it's a block element
                if (children.length === 1 && children[0].nodeType === Node.ELEMENT_NODE) {
                    const child = children[0];
                    const isCustomBlock = blockElements.some(selector => {
                        try {
                            return child.matches(selector);
                        } catch (e) {
                            return false;
                        }
                    });
                    
                    if (isCustomBlock) {
                        // Replace the paragraph with its content
                        p.parentNode.replaceChild(child, p);
                    }
                }
            });
            
            // Return the cleaned HTML
            return doc.body.innerHTML;
        }

        markdownToEditor(markdown) {
            return this.basicMarkdownToHtml(markdown);
        }

        updateTextarea() {
            this.isUpdatingTextarea = true;
            
            // Validation: Count inline shortcodes before conversion
            const editorHTML = this.editor.getHTML();
            const inlineShortcodesInEditor = (editorHTML.match(/data-preserved-inline="true"/g) || []).length;

            const content = this.editorToMarkdown();
            const restored = this.preserver.restoreContent(content, this.preservedBlocks);
            
            // Validation: Count inline shortcodes after conversion
            const inlineShortcodePatterns = [
                /\[mark[^\]]*\][^\[]*\[\/mark\]/g,
                /\[highlight[^\]]*\][^\[]*\[\/highlight\]/g,
                /\[span[^\]]*\][^\[]*\[\/span\]/g,
                /\[kbd[^\]]*\][^\[]*\[\/kbd\]/g,
                /\[code[^\]]*\][^\[]*\[\/code\]/g,
                /\[em[^\]]*\][^\[]*\[\/em\]/g,
                /\[strong[^\]]*\][^\[]*\[\/strong\]/g,
                /\[del[^\]]*\][^\[]*\[\/del\]/g,
                /\[ins[^\]]*\][^\[]*\[\/ins\]/g,
                /\[sub[^\]]*\][^\[]*\[\/sub\]/g,
                /\[sup[^\]]*\][^\[]*\[\/sup\]/g
            ];
            
            let totalInlineShortcodesInMarkdown = 0;
            inlineShortcodePatterns.forEach(pattern => {
                const matches = restored.match(pattern) || [];
                totalInlineShortcodesInMarkdown += matches.length;
                if (matches.length > 0) {

                }
            });

            // Debug: Show what's actually being saved if it contains mark or section
            if (restored.includes('[mark') || restored.includes('[section')) {

            }
            
            // Validation warning if counts don't match
            if (inlineShortcodesInEditor !== totalInlineShortcodesInMarkdown) {

            }
            
            this.textarea.value = restored;
            this.lastTextareaValue = restored;
            
            // Update preserved blocks to reflect current content for next load
            // This ensures that if the page reloads, we get the current content, not old cached content
            try {
                const { processed, blocks } = this.preserver.preserveContent(restored);
                
                // Merge new blocks with existing preserved blocks to maintain any that weren't found in parsing
                // This is important for newly added inline shortcodes that might not be properly parsed yet
                const mergedBlocks = new Map(this.preservedBlocks);
                blocks.forEach((block, id) => {
                    mergedBlocks.set(id, block);
                });
                
                // Also ensure all blocks that are referenced in the editor HTML are preserved
                const blockIdRegex = /data-block-id="([^"]+)"/g;
                let match;
                const foundBlockIds = new Set();
                while ((match = blockIdRegex.exec(editorHTML)) !== null) {
                    const blockId = match[1];
                    foundBlockIds.add(blockId);
                    
                    if (!blocks.has(blockId) && this.preservedBlocks.has(blockId)) {
                        // This block exists in the editor but wasn't found in parsing
                        // Keep it in the preserved blocks

                        mergedBlocks.set(blockId, this.preservedBlocks.get(blockId));
                    } else if (!blocks.has(blockId) && !this.preservedBlocks.has(blockId)) {
                        // This block exists in editor but not in preservedBlocks - try to reconstruct from DOM

                        const spanElement = document.querySelector(`[data-block-id="${blockId}"]`);
                        if (spanElement) {
                            const blockDataJson = spanElement.getAttribute('data-block-data');
                            if (blockDataJson) {
                                try {
                                    const blockData = JSON.parse(blockDataJson);
                                    mergedBlocks.set(blockId, blockData);

                                } catch (e) {

                                }
                            }
                        }
                    }
                }
                
                // Log preserved blocks status

                this.preservedBlocks = mergedBlocks;
                this.originalMarkdown = restored;
            } catch (e) {

            }
            
            // Trigger change event for Grav admin
            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            this.isUpdatingTextarea = false;
        }

        editorToMarkdown() {
            // Get editor content and convert both shortcode and preserved blocks
            let content = this.editor.getHTML();
            
            // Clean up empty paragraphs around block elements before converting to markdown
            content = this.cleanupTrailingBreakParagraphs(content);
            
            // Create a temporary DOM element to process the content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            
            // First pass: Convert special nodes to placeholders
            // This prevents them from being processed by htmlToMarkdown
            
            // Convert preserved inline elements back to their original format
            // IMPORTANT: Collect all replacements first, then apply them
            // This avoids DOM mutation issues during iteration
            const preservedInlineSpans = Array.from(tempDiv.querySelectorAll('span[data-preserved-inline="true"], span[data-shortcode-inline="true"]'));

            // Collect all replacement data first
            const replacements = [];
            
            preservedInlineSpans.forEach((span, index) => {
                const blockDataJson = span.getAttribute('data-block-data');
                const blockId = span.getAttribute('data-block-id') || span.getAttribute('data-placeholder-id');

                let originalText = '';
                
                // Try to get original text from block data
                if (blockDataJson) {
                    try {
                        const blockData = JSON.parse(blockDataJson);
                        originalText = blockData.original || '';

                    } catch (e) {

                    }
                }
                
                // If no original text from blockData, try preserved blocks
                if (!originalText && blockId) {
                    const preservedBlock = this.preservedBlocks?.get(blockId);
                    if (preservedBlock && preservedBlock.original) {
                        originalText = preservedBlock.original;

                    }
                }
                
                // If still no original text, try the preserver blockMap
                if (!originalText && blockId) {
                    const block = this.preserver?.blockMap?.get(blockId);
                    if (block && block.original) {
                        originalText = block.original;

                    }
                }
                
                if (originalText) {

                    replacements.push({
                        span: span,
                        text: originalText
                    });
                } else {
                    // Try to reconstruct shortcode from span attributes for data-shortcode-inline spans
                    if (span.hasAttribute('data-shortcode-inline')) {
                        const shortcodeName = span.getAttribute('data-shortcode-name');
                        const paramsBase64 = span.getAttribute('data-params-base64');
                        const params = span.getAttribute('data-params');
                        const attributesJson = span.getAttribute('data-attributes');
                        const content = span.getAttribute('data-content') || '';
                        
                        let reconstructedText = '';
                        
                        // Try to decode params from base64 first
                        let finalParams = '';
                        if (paramsBase64) {
                            try {
                                finalParams = decodeURIComponent(escape(atob(paramsBase64)));
                            } catch (e) {
                                finalParams = params || '';
                            }
                        } else {
                            finalParams = params || '';
                        }
                        
                        // If no params but we have attributes JSON, build params from that
                        if (!finalParams && attributesJson) {
                            try {
                                const attributes = JSON.parse(attributesJson);
                                const paramParts = [];
                                for (const [key, value] of Object.entries(attributes)) {
                                    if (value !== null && value !== undefined && value !== '') {
                                        paramParts.push(`${key}="${value}"`);
                                    }
                                }
                                finalParams = paramParts.join(' ');
                            } catch (e) {

                            }
                        }
                        
                        // Reconstruct the shortcode
                        if (shortcodeName) {
                            if (content) {
                                reconstructedText = `[${shortcodeName}${finalParams ? ` ${finalParams}` : ''}]${content}[/${shortcodeName}]`;
                            } else {
                                // Self-closing or empty content
                                reconstructedText = `[${shortcodeName}${finalParams ? ` ${finalParams}` : ''} /]`;
                            }

                            replacements.push({
                                span: span,
                                text: reconstructedText
                            });
                        } else {
                            // Can't reconstruct, use fallback

                            const fallbackText = span.textContent || '';
                            replacements.push({
                                span: span,
                                text: fallbackText
                            });
                        }
                    } else {

                        // Keep the span's text content as fallback
                        const fallbackText = span.textContent || '';

                        replacements.push({
                            span: span,
                            text: fallbackText
                        });
                    }
                }
            });
            
            // Now apply all replacements
            // Process in reverse order to maintain DOM structure integrity
            replacements.reverse().forEach(({ span, text }) => {
                const textNode = document.createTextNode(text);
                span.parentNode.replaceChild(textNode, span);
            });

            // Convert shortcode block nodes
            tempDiv.querySelectorAll('div[data-shortcode-block="true"]').forEach(div => {
                const shortcodeName = div.getAttribute('data-shortcode-name');
                const attributesJson = div.getAttribute('data-attributes') || '{}';
                const placeholderId = div.getAttribute('data-placeholder-id');
                let parsedAttributes = {};
                try {
                    parsedAttributes = JSON.parse(attributesJson);
                } catch (e) {
                    parsedAttributes = {};
                }
                
                // Debug logging for nested shortcodes and inline shortcodes
                if (shortcodeName === 'tab' || shortcodeName === 'tabs' || shortcodeName === 'highlight' || shortcodeName === 'mark') {

                }
                
                // Before converting to markdown, ensure preserved inline elements are converted back
                const preservedInlines = Array.from(div.querySelectorAll('span[data-preserved-inline="true"], span[data-shortcode-inline="true"]'));
                if (preservedInlines.length > 0) {

                }
                
                // Collect replacements first to avoid DOM mutation issues
                const nestedReplacements = [];
                
                preservedInlines.forEach(span => {
                    const blockDataJson = span.getAttribute('data-block-data');
                    const blockId = span.getAttribute('data-block-id') || span.getAttribute('data-placeholder-id');
                    const blockType = span.getAttribute('data-block-type') || 'shortcode';

                    let originalText = '';
                    
                    if (blockDataJson) {
                        try {
                            const blockData = JSON.parse(blockDataJson);
                            originalText = blockData.original || '';

                        } catch (e) {

                        }
                    }
                    
                    // If we didn't get originalText from blockData, try preserved blocks
                    if (!originalText && blockId) {
                        const block = this.preservedBlocks?.get(blockId);
                        if (block && block.original) {
                            originalText = block.original;

                        }
                    }
                    
                    // If still no original text, try to reconstruct from span attributes
                    if (!originalText) {
                        const title = span.getAttribute('title');
                        if (title && title.includes('[') && title.includes(']')) {
                            originalText = title.replace('(click to edit)', '').trim();

                        }
                    }
                    
                    // As last resort, try to guess from the content and type
                    if (!originalText && blockType === 'shortcode') {
                        const content = span.textContent || '';
                        // If the span text already looks like a complete shortcode, use it directly
                        if (content.includes('[') && content.includes(']') && content.includes('[/')) {
                            originalText = content;

                        } else {
                            // Try to guess the shortcode based on the styling or class
                            const classes = span.className || '';
                            if (classes.includes('highlight')) {
                                originalText = `[highlight]${content}[/highlight]`;
                            } else if (classes.includes('mark')) {
                                originalText = `[mark]${content}[/mark]`;
                            } else {
                                originalText = content; // fallback to just the text
                            }

                        }
                    }
                    
                    if (originalText) {

                        nestedReplacements.push({
                            span: span,
                            text: originalText
                        });
                    } else {

                    }
                });
                
                // Apply nested replacements in reverse order
                nestedReplacements.reverse().forEach(({ span, text }) => {
                    const textNode = document.createTextNode(text);
                    span.parentNode.replaceChild(textNode, span);
                });
                
                // Now get the inner content after processing preserved inlines
                // Check if this is a code-type shortcode
                const contentType = div.getAttribute('data-content-type') || 'blocks';
                let finalInnerContent;

                if (contentType === 'code') {
                    // For code-type shortcodes, get raw content from data attribute
                    const codeContentBase64 = div.getAttribute('data-code-content');
                    if (codeContentBase64) {
                        try {
                            finalInnerContent = decodeURIComponent(escape(atob(codeContentBase64)));
                        } catch (e) {
                            finalInnerContent = '';
                        }
                    } else {
                        finalInnerContent = '';
                    }
                } else {
                    // Regular shortcode - convert inner HTML to markdown
                    finalInnerContent = this.htmlToMarkdown(div.innerHTML);
                }

                // Check if the final content contains inline shortcodes that should not be treated as blocks
                const hasInlineShortcodes = /\[(mark|highlight|span|kbd|code|em|strong|del|ins|sub|sup)[^\]]*\][^\[]*\[\/\1\]/.test(finalInnerContent);
                if (hasInlineShortcodes) {

                }
                
                // Try to decode params from base64 first (for better preservation)
                let params = '';
                const paramsBase64 = div.getAttribute('data-params-base64');
                if (paramsBase64) {
                    try {
                        params = decodeURIComponent(escape(atob(paramsBase64)));
                    } catch (e) {
                        params = div.getAttribute('data-params') || '';
                    }
                } else {
                    params = div.getAttribute('data-params') || '';
                }
                
                if (params && !paramsBase64) {
                    // Unescape HTML entities in params
                    params = params.replace(/&quot;/g, '"');
                }
                
                if (!params) {
                    // Fall back to reconstructing from attributes JSON if no params string
                    if (parsedAttributes && Object.keys(parsedAttributes).length > 0) {
                        const paramParts = [];
                        for (const [key, value] of Object.entries(parsedAttributes)) {
                            // Check if value contains spaces or special characters that need quotes
                            if (value && (value.includes(' ') || value.includes('"') || value.includes("'"))) {
                                // Use double quotes and escape any internal double quotes
                                paramParts.push(`${key}="${value.replace(/"/g, '\\"')}"`);
                            } else if (value === '' || value === null || value === undefined) {
                                // For empty values, always use quotes to preserve them
                                paramParts.push(`${key}=""`);
                            } else {
                                // For simple non-empty values, preserve unquoted format
                                paramParts.push(`${key}=${value}`);
                            }
                        }
                        params = paramParts.join(' ');
                    } else {

                        params = '';
                    }
                }
                
                // Determine if this is a block-level shortcode
                let isBlockLevel = true; // Default to block
                
                // Try to get the type from the shortcode registry
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const shortcodeConfig = registry.get(shortcodeName);
                        if (shortcodeConfig) {
                            isBlockLevel = shortcodeConfig.type === 'block';
                        }
                    }
                }
                
                // Define known inline shortcodes that should never be treated as blocks
                const knownInlineShortcodes = ['mark', 'highlight', 'span', 'kbd', 'code', 'em', 'strong', 'del', 'ins', 'sub', 'sup'];
                const knownBlockShortcodes = ['section', 'columns', 'ui-accordion', 'ui-accordion-item', 'column', 'notice', 'details', 'div', 'figure', 'ui-tabs', 'ui-tab'];
                
                // Override with known shortcode types
                if (knownInlineShortcodes.includes(shortcodeName.toLowerCase())) {
                    isBlockLevel = false;
                } else if (knownBlockShortcodes.includes(shortcodeName.toLowerCase())) {
                    isBlockLevel = true;
                } else if (!window.EditorPro || !window.EditorPro.getShortcodeRegistry) {
                    // Fallback when registry not available - be more conservative
                    isBlockLevel = knownBlockShortcodes.some(name => shortcodeName.toLowerCase() === name.toLowerCase());
                }
                
                // Check if this shortcode should be self-closing
                let isSelfClosing = false;
                
                // Check if we have a preserved block for this
                if (placeholderId && this.preservedBlocks && this.preservedBlocks.has(placeholderId)) {
                    const preservedBlock = this.preservedBlocks.get(placeholderId);
                    isSelfClosing = preservedBlock.isSelfClosing || false;
                }
                
                // Also check if the shortcode config says it has no content
                if (!isSelfClosing && window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const shortcodeConfig = registry.get(shortcodeName);
                        if (shortcodeConfig && shortcodeConfig.hasContent === false) {
                            isSelfClosing = true;
                        }
                    }
                }
                
                // Format with proper newlines for block shortcodes
                let shortcodeMarkdown;
                if (isSelfClosing) {
                    // Self-closing shortcode - use [shortcode /] format
                    if (isBlockLevel) {
                        shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''} /]\n`;
                    } else {
                        shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''} /]`;
                    }

                } else if (isBlockLevel && finalInnerContent.trim()) {
                    // For block shortcodes, always use block formatting with newlines
                    const trimmedContent = finalInnerContent.trim();
                    
                    // Always use proper block formatting for section and other structural shortcodes
                    shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''}]\n${trimmedContent}\n[/${shortcodeName}]\n`;

                } else if (isBlockLevel) {
                    // Empty block shortcode - add single newline
                    shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]\n`;
                } else if (finalInnerContent.trim()) {
                    // Inline shortcode - no extra spacing
                    shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''}]${finalInnerContent.trim()}[/${shortcodeName}]`;
                } else {
                    // Empty inline shortcode
                    shortcodeMarkdown = `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]`;
                }
                
                // Debug logging for inline shortcodes and sections with inline content
                if (!isBlockLevel || shortcodeName === 'highlight' || shortcodeName === 'mark' || shortcodeName === 'section') {

                }
                
                // Keep preserved block map in sync so first-time saves capture content
                if (placeholderId && this.preservedBlocks) {
                    const existingBlock = this.preservedBlocks.get(placeholderId) || {};
                    const normalizedParams = params ? params.trim() : '';
                    const normalizedContent = isSelfClosing ? '' : finalInnerContent.trim();
                    const updatedBlock = {
                        ...existingBlock,
                        type: 'shortcode',
                        tagName: shortcodeName,
                        shortcodeName: shortcodeName,
                        shortcodeType: isBlockLevel ? 'block' : 'inline',
                        params: normalizedParams,
                        attributes: parsedAttributes,
                        content: normalizedContent,
                        original: shortcodeMarkdown.trim(),
                        isSelfClosing,
                        isClosing: !isSelfClosing,
                        isBlock: isBlockLevel
                    };
                    this.preservedBlocks.set(placeholderId, updatedBlock);
                }

                const textNode = document.createTextNode(shortcodeMarkdown);
                div.parentNode.replaceChild(textNode, div);
            });
            
            // Convert legacy shortcode nodes (for backward compatibility)
            tempDiv.querySelectorAll('div[data-shortcode]').forEach(div => {
                const tagName = div.getAttribute('data-shortcode');
                const params = div.getAttribute('data-params') || '';
                const innerContent = this.htmlToMarkdown(div.innerHTML);
                
                // Unescape parameters for shortcode output
                const unescapedParams = params.replace(/&quot;/g, '"');
                
                // Determine if this is a block-level shortcode
                let isBlockLevel = true; // Default to block
                
                // Try to get the type from the shortcode registry
                if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                    const registry = window.EditorPro.getShortcodeRegistry();
                    if (registry) {
                        const shortcodeConfig = registry.get(tagName);
                        if (shortcodeConfig) {
                            isBlockLevel = shortcodeConfig.type === 'block';
                        }
                    }
                }
                
                // Define known inline shortcodes that should never be treated as blocks
                const knownInlineShortcodes = ['mark', 'highlight', 'span', 'kbd', 'code', 'em', 'strong', 'del', 'ins', 'sub', 'sup'];
                const knownBlockShortcodes = ['section', 'columns', 'ui-accordion', 'ui-accordion-item', 'column', 'notice', 'details', 'div', 'figure', 'ui-tabs', 'ui-tab'];
                
                // Override with known shortcode types
                if (knownInlineShortcodes.includes(tagName.toLowerCase())) {
                    isBlockLevel = false;
                } else if (knownBlockShortcodes.includes(tagName.toLowerCase())) {
                    isBlockLevel = true;
                } else if (!window.EditorPro || !window.EditorPro.getShortcodeRegistry) {
                    // Fallback when registry not available - be more conservative
                    isBlockLevel = knownBlockShortcodes.some(name => tagName.toLowerCase() === name.toLowerCase());
                }
                
                // Format with proper newlines for block shortcodes
                let shortcodeMarkdown;
                if (isBlockLevel && innerContent.trim()) {
                    // For block shortcodes, ensure content ends with a newline before closing tag
                    const trimmedContent = innerContent.trim();
                    shortcodeMarkdown = `[${tagName}${unescapedParams ? ` ${unescapedParams}` : ''}]\n${trimmedContent}\n[/${tagName}]`;
                } else if (innerContent.trim()) {
                    shortcodeMarkdown = `[${tagName}${unescapedParams ? ` ${unescapedParams}` : ''}]${innerContent.trim()}[/${tagName}]`;
                } else {
                    shortcodeMarkdown = `[${tagName}${unescapedParams ? ` ${unescapedParams}` : ''}][/${tagName}]`;
                }
                
                const textNode = document.createTextNode(shortcodeMarkdown);
                div.parentNode.replaceChild(textNode, div);
            });
            
            // Convert RawBlock nodes back to placeholders
            tempDiv.querySelectorAll('div[data-raw-block="true"]').forEach(div => {
                const blockId = div.getAttribute('data-block-id');
                const language = div.getAttribute('data-language') || 'html';
                let content = '';
                
                // First, try to get the content from the actual TipTap node
                // The bundled RawBlock might store content differently
                if (this.editor && blockId) {
                    let nodeContent = null;
                    let foundNode = false;
                    this.editor.state.doc.descendants((node, pos) => {
                        if (node.type.name === 'rawBlock' && node.attrs.blockId === blockId) {
                            // Check all possible places where content might be stored
                            nodeContent = node.attrs.content || node.textContent || node.text;
                            foundNode = true;
                            return false; // Stop searching
                        }
                    });
                    
                    if (foundNode && nodeContent) {
                        content = nodeContent;
                    }
                }
                
                // If we couldn't get from node, try other methods
                if (!content) {
                    const contentBase64 = div.getAttribute('data-content-base64');
                    
                    // Try to get content from base64 encoded attribute
                    if (contentBase64) {
                        try {
                            content = decodeURIComponent(escape(atob(contentBase64)));
                        } catch (e) {
                            // Fall back to text content - check multiple possible selectors
                            const cmContent = div.querySelector('.cm-content');
                            const preElement = div.querySelector('pre.raw-block-content, .raw-block-editor');
                            if (cmContent) {
                                // CodeMirror content
                                content = cmContent.textContent || '';
                            } else if (preElement) {
                                content = preElement.textContent || '';
                            } else {
                                content = div.textContent || '';
                            }
                        }
                    } else {
                        // Get content from CodeMirror or pre element
                        const cmContent = div.querySelector('.cm-content');
                        const preElement = div.querySelector('pre.raw-block-content, .raw-block-editor');
                        if (cmContent) {
                            // CodeMirror content
                            content = cmContent.textContent || '';
                        } else if (preElement) {
                            content = preElement.textContent || '';
                        } else {
                            content = div.textContent || '';
                        }
                    }
                }
                
                // Always update preserved blocks with the latest content
                this.preservedBlocks.set(blockId, {
                    type: language,
                    content: content,
                    original: content,
                    isBlock: true
                });
                
                const textNode = document.createTextNode(`{{RAW_BLOCK_${blockId}}}`);
                div.parentNode.replaceChild(textNode, div);
            });

            // Convert inline raw elements (Twig variables etc.) back to original content
            tempDiv.querySelectorAll('code.raw-inline[data-raw-content]').forEach(code => {
                let content = '';
                try {
                    content = decodeURIComponent(code.getAttribute('data-raw-content') || '');
                } catch (e) {
                    content = code.textContent || '';
                }

                const textNode = document.createTextNode(content);
                code.parentNode.replaceChild(textNode, code);
            });

            // Convert preserved block nodes back to placeholders
            tempDiv.querySelectorAll('div[data-preserved-block="true"]').forEach(div => {
                const blockId = div.getAttribute('data-block-id');
                const textNode = document.createTextNode(`{{PRESERVED_BLOCK_${blockId}}}`);
                div.parentNode.replaceChild(textNode, div);
            });
            
            // Convert GitHub alerts back to markdown syntax
            const githubAlerts = tempDiv.querySelectorAll('div[data-github-alert="true"]');
            
            githubAlerts.forEach(div => {
                const alertType = div.getAttribute('data-alert-type') || 'note';
                const contentDiv = div.querySelector('.markdown-alert-content');
                
                if (contentDiv) {
                    // Convert the content to markdown
                    const innerContent = this.htmlToMarkdown(contentDiv.innerHTML);
                    
                    // Build the markdown alert syntax
                    const lines = innerContent.trim().split('\n');
                    const markdownAlert = `> [!${alertType.toUpperCase()}]\n${lines.map(line => `> ${line}`).join('\n')}`;
                    
                    // Add double newline after alert to ensure separation
                    const textNode = document.createTextNode(markdownAlert + '\n\n');
                    div.parentNode.replaceChild(textNode, div);
                }
            });
            
            // Get the processed HTML
            content = tempDiv.innerHTML;
            
            // Convert HTML back to markdown
            return this.htmlToMarkdown(content);
        }

        /**
         * Normalize inline formatting by merging adjacent same-type tags.
         * Handles patterns like:
         *   <em>foo</em><em>bar</em> → <em>foobar</em>
         *   <em>A</em><strong><em>B</em></strong><em>C</em> → <em>A<strong>B</strong>C</em>
         * This fixes issues where TipTap splits formatting when nesting bold/italic.
         */
        normalizeInlineFormatting(container) {
            const inlineTags = ['em', 'i', 'strong', 'b', 's', 'strike', 'u'];

            // Pass 1: Handle nested patterns like <em>A</em><strong><em>B</em></strong><em>C</em>
            // Transform to <em>A<strong>B</strong>C</em>
            for (const outerTag of inlineTags) {
                let changed = true;
                while (changed) {
                    changed = false;
                    const elements = Array.from(container.getElementsByTagName(outerTag));

                    for (const element of elements) {
                        const nextSibling = element.nextSibling;
                        if (!nextSibling || nextSibling.nodeType !== Node.ELEMENT_NODE) continue;

                        const middleTagName = nextSibling.tagName.toLowerCase();
                        // Middle must be a different inline tag
                        if (!inlineTags.includes(middleTagName) || middleTagName === outerTag) continue;

                        // Check if middle element contains a nested element of same type as outer
                        const nestedSameType = nextSibling.querySelector(outerTag);
                        if (!nestedSameType) continue;

                        // Check if there's another outer element after the middle
                        const afterMiddle = nextSibling.nextSibling;
                        if (!afterMiddle || afterMiddle.nodeType !== Node.ELEMENT_NODE) continue;
                        if (afterMiddle.tagName.toLowerCase() !== outerTag) continue;

                        // We have the pattern! Transform it.
                        // 1. Unwrap the nested same-type element inside middle
                        while (nestedSameType.firstChild) {
                            nestedSameType.parentNode.insertBefore(nestedSameType.firstChild, nestedSameType);
                        }
                        nestedSameType.parentNode.removeChild(nestedSameType);

                        // 2. Move middle element into first outer element
                        element.appendChild(nextSibling);

                        // 3. Move content from afterMiddle into first outer element
                        while (afterMiddle.firstChild) {
                            element.appendChild(afterMiddle.firstChild);
                        }
                        afterMiddle.parentNode.removeChild(afterMiddle);

                        changed = true;
                        break;
                    }
                }
            }

            // Pass 2: Merge directly adjacent same-type tags
            for (const tagName of inlineTags) {
                let changed = true;
                while (changed) {
                    changed = false;
                    const elements = Array.from(container.getElementsByTagName(tagName));

                    for (const element of elements) {
                        const nextSibling = element.nextSibling;
                        if (nextSibling &&
                            nextSibling.nodeType === Node.ELEMENT_NODE &&
                            nextSibling.tagName.toLowerCase() === tagName) {
                            // Merge: move children from nextSibling into element
                            while (nextSibling.firstChild) {
                                element.appendChild(nextSibling.firstChild);
                            }
                            nextSibling.parentNode.removeChild(nextSibling);
                            changed = true;
                            break;
                        }
                    }
                }
            }
        }

        htmlToMarkdown(html) {
            // Comprehensive HTML to Markdown conversion
            // Create a temporary container to parse the HTML properly
            const container = document.createElement('div');
            container.innerHTML = html;

            // DEBUG: Log HTML structure for nested lists
            console.log('htmlToMarkdown input:', container.innerHTML);

            // Normalize inline formatting to merge adjacent same-type tags
            // This fixes bold/italic nesting issues (GitHub Issue #519)
            this.normalizeInlineFormatting(container);

            // Process the DOM tree recursively
            const processNode = (node, context = { inList: false, listDepth: 0 }) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // Return text content without escaping
                    // We'll handle escaping context-specifically where needed
                    let text = node.textContent;
                    
                    // Restore placeholders in text nodes
                    if (this.preservedBlocks && text.includes('{{')) {
                        text = this.preserver.restoreContent(text, this.preservedBlocks);
                    }
                    
                    return text;
                }
                
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return '';
                }
                
                const tag = node.tagName.toLowerCase();
                const children = Array.from(node.childNodes).map(child => processNode(child, context)).join('');
                
                // Handle different element types
                switch (tag) {
                    // GitHub Alerts (custom handling)
                    case 'div':
                        if (node.getAttribute('data-summary-delimiter') === 'true') {
                            const explicitDelimiter = node.getAttribute('data-delimiter');
                            const fallbackDelimiter = this.summaryDelimiter || this.summaryDelimiterTrimmed || '===';
                            const delimiterValue = (explicitDelimiter && explicitDelimiter.length) ? explicitDelimiter : fallbackDelimiter;
                            return `${delimiterValue}\n\n`;
                        }
                        // Check if this is a preserved block first
                        if (node.getAttribute('data-preserved-block') === 'true') {
                            const blockId = node.getAttribute('data-block-id');
                            const blockType = node.getAttribute('data-block-type');
                            
                            if (blockId && this.preservedBlocks) {
                                const block = this.preservedBlocks.get(blockId);
                                if (block && block.original) {
                                    return block.original + '\n';
                                }
                            }
                            
                            // Fallback: try to get from data-block-data
                            const blockData = node.getAttribute('data-block-data');
                            if (blockData) {
                                try {
                                    const data = JSON.parse(blockData);
                                    if (data.original) {
                                        return data.original + '\n';
                                    }
                                } catch (e) {

                                }
                            }
                        }
                        
                        // Raw blocks (HTML/Twig)
                        if (node.getAttribute('data-raw-block') === 'true') {
                            const blockId = node.getAttribute('data-block-id');
                            if (blockId && this.preservedBlocks) {
                                const block = this.preservedBlocks.get(blockId);
                                if (block && block.original) {
                                    return block.original + '\n\n';
                                }
                            }
                            // Fallback: return placeholder
                            return `{{RAW_BLOCK_${blockId}}}\n\n`;
                        }

                        // GitHub alerts
                        if (node.getAttribute('data-github-alert') === 'true') {
                            const alertType = node.getAttribute('data-alert-type');
                            const contentDiv = node.querySelector('.markdown-alert-content');
                            if (contentDiv) {
                                // Process content maintaining structure
                                let content = Array.from(contentDiv.childNodes)
                                    .map(processNode)
                                    .join('')
                                    .trim();
                                
                                // Restore any placeholders within the alert content
                                if (this.preservedBlocks) {
                                    content = this.preserver.restoreContent(content, this.preservedBlocks);
                                }
                                
                                // Split into lines and add > prefix to each
                                const lines = content.split('\n');
                                const quotedLines = lines.map(line => {
                                    // Don't add > to empty lines within the alert
                                    return line.trim() ? `${line}` : '';
                                }).filter(line => line !== ''); // Remove empty lines
                                
                                // Format as GitHub alert with proper quoting
                                const alertHeader = `> [!${alertType.toUpperCase()}]`;
                                const alertContent = quotedLines.map(line => `> ${line}`).join('\n');
                                
                                return `${alertHeader}\n${alertContent}\n\n`;
                            }
                        }
                        
                        // Shortcode blocks
                        if (node.getAttribute('data-shortcode-block') === 'true') {
                            // Check if this shortcode has a placeholder ID
                            const placeholderId = node.getAttribute('data-placeholder-id');
                            if (placeholderId && this.preservedBlocks && this.preservedBlocks.has(placeholderId)) {
                                // Return the placeholder which will be restored with normalized params and newlines
                                return `{{SHORTCODE_PLACEHOLDER_${placeholderId}}}`;
                            }
                            
                            // No placeholder or not in preserved blocks - reconstruct with proper formatting
                            const shortcodeName = node.getAttribute('data-shortcode-name');
                            const paramsBase64 = node.getAttribute('data-params-base64');
                            let params = '';
                            
                            if (paramsBase64) {
                                try {
                                    params = decodeURIComponent(escape(atob(paramsBase64)));
                                } catch (e) {

                                }
                            } else {
                                // Try regular params attribute
                                params = node.getAttribute('data-params') || '';
                            }
                            
                            // Process inner content while maintaining block structure
                            let innerContent = '';
                            const childNodes = Array.from(node.childNodes);
                            
                            // Process children and maintain proper spacing between blocks
                            childNodes.forEach((child, index) => {
                                const content = processNode(child);
                                if (content) {
                                    // Check if this is a block-level element
                                    if (child.nodeType === Node.ELEMENT_NODE) {
                                        const childTag = child.tagName.toLowerCase();
                                        const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'ul', 'ol', 'pre'];
                                        if (blockTags.includes(childTag)) {
                                            // Add proper spacing between block elements
                                            if (innerContent && !innerContent.endsWith('\n\n')) {
                                                innerContent += '\n';
                                                if (!innerContent.endsWith('\n\n')) {
                                                    innerContent += '\n';
                                                }
                                            }
                                            innerContent += content;
                                            // Ensure block elements end with newlines
                                            if (!content.endsWith('\n')) {
                                                innerContent += '\n';
                                            }
                                        } else {
                                            innerContent += content;
                                        }
                                    } else {
                                        innerContent += content;
                                    }
                                }
                            });
                            
                            // Determine if this is a block-level shortcode
                            let isBlockLevel = true; // Default to block
                            
                            // Try to get the type from the shortcode registry
                            if (window.EditorPro && window.EditorPro.getShortcodeRegistry) {
                                const registry = window.EditorPro.getShortcodeRegistry();
                                if (registry) {
                                    const shortcodeConfig = registry.get(shortcodeName);
                                    if (shortcodeConfig) {
                                        isBlockLevel = shortcodeConfig.type === 'block';
                                    }
                                }
                            }
                            
                            // Also check known block-level shortcodes as fallback
                            const blockLevelShortcodes = ['section', 'columns', 'ui-accordion', 'ui-accordion-item', 'column', 'notice', 'details', 'div', 'figure'];
                            if (!window.EditorPro || !window.EditorPro.getShortcodeRegistry) {
                                // Fallback when registry not available
                                isBlockLevel = blockLevelShortcodes.some(name => shortcodeName.toLowerCase() === name.toLowerCase());
                            }
                            
                            // Clean up inner content trailing newlines but preserve structure
                            innerContent = innerContent.replace(/\n+$/, '\n');
                            
                            // Format with proper newlines for block shortcodes
                            if (isBlockLevel) {
                                if (innerContent.trim()) {
                                    // Ensure newlines are added for block shortcodes
                                    const trimmedContent = innerContent.trim();
                                    // Add single newline after block shortcodes
                                    return `[${shortcodeName}${params ? ` ${params}` : ''}]\n${trimmedContent}\n[/${shortcodeName}]\n`;
                                } else {
                                    // Empty block shortcode - add single newline
                                    return `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]\n`;
                                }
                            } else {
                                // Inline shortcode - keep compact
                                if (innerContent.trim()) {
                                    return `[${shortcodeName}${params ? ` ${params}` : ''}]${innerContent.trim()}[/${shortcodeName}]`;
                                } else {
                                    return `[${shortcodeName}${params ? ` ${params}` : ''}][/${shortcodeName}]`;
                                }
                            }
                        }
                        
                        // For other divs, process children but check for placeholders
                        if (this.preservedBlocks && children.includes('{{')) {
                            return this.preserver.restoreContent(children, this.preservedBlocks);
                        }
                        return children;
                    
                    // Images
                    case 'img':
                        const src = node.getAttribute('src') || '';
                        const alt = node.getAttribute('alt') || '';
                        const imgTitle = node.getAttribute('title') || '';
                        const dataSrc = node.getAttribute('data-src');
                        const titleSuffix = imgTitle ? ` "${imgTitle}"` : '';

                        // First check data-src for original path
                        if (dataSrc) {
                            return `![${alt}](${dataSrc}${titleSuffix})`;
                        }

                        // Then check path mappings
                        for (const [original, mapping] of Object.entries(this.pathMappings?.images || {})) {
                            if (mapping.resolved === src) {
                                return `![${alt}](${original}${titleSuffix})`;
                            }
                        }

                        // Fallback to src
                        return `![${alt}](${src}${titleSuffix})`;
                    
                    // Links
                    case 'a':
                        const href = node.getAttribute('href') || '';
                        const dataHref = node.getAttribute('data-href');
                        const linkText = children;
                        
                        // Skip empty links
                        if (!href) return linkText;
                        
                        // First check data-href for original path
                        if (dataHref) {
                            return `[${linkText}](${dataHref})`;
                        }
                        
                        // Then check path mappings
                        for (const [original, mapping] of Object.entries(this.pathMappings?.links || {})) {
                            if (mapping.resolved === href) {
                                return `[${linkText}](${original})`;
                            }
                        }
                        
                        // Fallback to href
                        return `[${linkText}](${href})`;
                    
                    // Text formatting
                    case 'strong':
                    case 'b':
                        return `**${children}**`;
                    
                    case 'em':
                    case 'i':
                        return `_${children}_`;  // Use underscore for italic (visual distinction from bold **)
                    
                    case 's':
                    case 'strike':
                        return `~~${children}~~`;
                    
                    case 'u':
                        return `<u>${children}</u>`; // Markdown doesn't have underline
                    
                    // Semantic HTML elements - preserve as raw HTML
                    case 'abbr':
                        const title = node.getAttribute('title');
                        return title ? `<abbr title="${title}">${children}</abbr>` : `<abbr>${children}</abbr>`;
                    
                    case 'cite':
                        return `<cite>${children}</cite>`;
                    
                    case 'kbd':
                        return `<kbd>${children}</kbd>`;
                    
                    case 'sup':
                        return `<sup>${children}</sup>`;
                    
                    case 'sub':
                        return `<sub>${children}</sub>`;
                    
                    case 'var':
                        return `<var>${children}</var>`;
                    
                    case 'mark':
                        return `<mark>${children}</mark>`;
                    
                    case 'time':
                        const datetime = node.getAttribute('datetime');
                        return datetime ? `<time datetime="${datetime}">${children}</time>` : `<time>${children}</time>`;
                    
                    case 'samp':
                        return `<samp>${children}</samp>`;
                    
                    case 'dfn':
                        return `<dfn>${children}</dfn>`;
                    
                    case 'q':
                        const citeAttr = node.getAttribute('cite');
                        return citeAttr ? `<q cite="${citeAttr}">${children}</q>` : `<q>${children}</q>`;
                    
                    case 'small':
                        return `<small>${children}</small>`;
                    
                    case 'ins':
                        const insDatetime = node.getAttribute('datetime');
                        const insCite = node.getAttribute('cite');
                        let insTag = '<ins';
                        if (insDatetime) insTag += ` datetime="${insDatetime}"`;
                        if (insCite) insTag += ` cite="${insCite}"`;
                        insTag += `>${children}</ins>`;
                        return insTag;
                    
                    case 'del':
                        const delDatetime = node.getAttribute('datetime');
                        const delCite = node.getAttribute('cite');
                        let delTag = '<del';
                        if (delDatetime) delTag += ` datetime="${delDatetime}"`;
                        if (delCite) delTag += ` cite="${delCite}"`;
                        delTag += `>${children}</del>`;
                        return delTag;
                    
                    case 'code':
                        // Inline code
                        return `\`${children.replace(/`/g, '\\`')}\``;
                    
                    // Headers
                    case 'h1':
                    case 'h2':
                    case 'h3':
                    case 'h4':
                    case 'h5':
                    case 'h6':
                        const level = parseInt(tag.charAt(1));
                        return `${'#'.repeat(level)} ${children}\n\n`;
                    
                    // Paragraphs
                    case 'p':
                        // Skip empty paragraphs
                        if (!children.trim()) return '';
                        // In list context, don't add double newlines (fixes nested list spacing - Issue #520)
                        if (context.inList) {
                            return children;
                        }
                        return `${children}\n\n`;
                    
                    // Line breaks
                    case 'br':
                        return '  \n'; // Two spaces for markdown line break
                    
                    // Lists (rewritten for proper nested list support - Issue #520)
                    case 'ul':
                    case 'ol':
                        const listDepth = context.listDepth || 0;
                        const indent = '    '.repeat(listDepth); // 4 spaces per level (standard markdown nesting)

                        const listItems = Array.from(node.children)
                            .filter(child => child.tagName === 'LI')
                            .map((li, index) => {
                                const prefix = tag === 'ul' ? '- ' : `${index + 1}. `;

                                // Separate text content from nested lists
                                let textContent = '';
                                let nestedListContent = '';

                                Array.from(li.childNodes).forEach(child => {
                                    if (child.nodeType === Node.ELEMENT_NODE) {
                                        const childTag = child.tagName.toLowerCase();
                                        if (childTag === 'ul' || childTag === 'ol') {
                                            // Process nested list with increased depth
                                            nestedListContent += processNode(child, {
                                                inList: true,
                                                listDepth: listDepth + 1
                                            });
                                        } else {
                                            // Process other elements (p, text formatting, etc.)
                                            textContent += processNode(child, {
                                                inList: true,
                                                listDepth: listDepth
                                            });
                                        }
                                    } else {
                                        textContent += processNode(child, {
                                            inList: true,
                                            listDepth: listDepth
                                        });
                                    }
                                });

                                let result = indent + prefix + textContent.trim();

                                // Append nested list if present (it already has proper indentation)
                                if (nestedListContent) {
                                    // Remove leading newlines but preserve indentation, trim trailing whitespace
                                    result += '\n' + nestedListContent.replace(/^\n+/, '').trimEnd();
                                }

                                return result;
                            })
                            .join('\n');

                        // Add trailing newlines only for top-level lists
                        return listDepth === 0 ? listItems + '\n\n' : listItems;

                    // List items are handled by their parent ul/ol
                    case 'li':
                        return '';  // Content processed by parent
                    
                    // Blockquotes
                    case 'blockquote':
                        // Check if this blockquote contains GitHub alert syntax (fallback case)
                        const alertMatch = children.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)/s);
                        if (alertMatch) {
                            // This is a GitHub alert that wasn't converted to a proper alert div
                            const alertType = alertMatch[1];
                            const restContent = alertMatch[2] || '';
                            
                            // Format as GitHub alert markdown
                            const alertHeader = `> [!${alertType}]`;
                            if (restContent.trim()) {
                                const contentLines = restContent.trim().split('\n');
                                const quotedContent = contentLines.map(line => line.trim() ? `> ${line.trim()}` : '>').join('\n');
                                return `${alertHeader}\n${quotedContent}\n\n`;
                            } else {
                                return `${alertHeader}\n\n`;
                            }
                        }
                        
                        // Regular blockquote
                        const quoteLines = children.trim().split('\n');
                        const quotedContent = quoteLines.map(line => `> ${line}`).join('\n');
                        return `${quotedContent}\n\n`;
                    
                    // Code blocks
                    case 'pre':
                        const codeElement = node.querySelector('code');
                        if (codeElement) {
                            const language = codeElement.className.match(/language-(\w+)/)?.[1] || '';
                            // Trim trailing newline from code content to avoid duplication
                            const code = codeElement.textContent.replace(/\n$/, '');
                            return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
                        }
                        // Trim trailing newline to avoid duplication
                        const trimmedChildren = children.replace(/\n$/, '');
                        return `\`\`\`\n${trimmedChildren}\n\`\`\`\n\n`;
                    
                    // Horizontal rule
                    case 'hr':
                        return '---\n\n';
                    
                    // Table elements
                    case 'table':
                        const rows = Array.from(node.querySelectorAll('tr'));
                        if (rows.length === 0) return '';
                        
                        let markdown = '';
                        let headerProcessed = false;
                        
                        rows.forEach((row, rowIndex) => {
                            const cells = Array.from(row.querySelectorAll('td, th'));
                            const cellContents = cells.map(cell => {
                                const content = Array.from(cell.childNodes).map(processNode).join('').trim();
                                // Replace newlines with <br> tags for markdown tables
                                // and escape pipes in cell content
                                return content
                                    .replace(/\n+/g, '<br>')  // Replace newlines with <br>
                                    .replace(/\|/g, '\\|');   // Escape pipes
                            });
                            
                            markdown += '| ' + cellContents.join(' | ') + ' |\n';
                            
                            // Add separator after header row
                            if (rowIndex === 0 && row.querySelector('th')) {
                                headerProcessed = true;
                                const separator = cells.map(() => '---').join(' | ');
                                markdown += '| ' + separator + ' |\n';
                            } else if (rowIndex === 0 && !headerProcessed) {
                                // If first row has td instead of th, still add separator
                                const separator = cells.map(() => '---').join(' | ');
                                markdown += '| ' + separator + ' |\n';
                            }
                        });
                        
                        return markdown + '\n';
                    
                    // Skip these during recursion (handled by parent)
                    case 'thead':
                    case 'tbody':
                    case 'tr':
                    case 'td':
                    case 'th':
                        return '';
                    
                    // Handle span elements (including preserved inline)
                    case 'span':
                        // Check if this is a preserved inline element
                        if (node.getAttribute('data-preserved-inline') === 'true') {
                            const blockData = node.getAttribute('data-block-data');
                            if (blockData) {
                                try {
                                    const data = JSON.parse(blockData);
                                    return data.original || children;
                                } catch (e) {
                                    return children;
                                }
                            }
                        }
                        // For regular spans, just return the children
                        return children;
                    
                    // Default: just return the children
                    default:
                        return children;
                }
            };
            
            // Process the entire container
            let markdown = Array.from(container.childNodes).map(processNode).join('');
            
            // Clean up the markdown
            // Special handling for GitHub alerts - ensure they have proper spacing
            markdown = markdown
                // First, ensure GitHub alerts are properly separated
                .replace(/(> \[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n> [^\n]*)*)\n+(> \[!)/g, '$1\n\n$2')
                // Then do general cleanup
                .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
                .replace(/^\n+|\n+$/g, '') // Trim leading/trailing newlines
                .trim();
            
            return markdown;
        }
        
        updateCharacterCount() {
            if (!this.editor || !this.characterCountDisplay) return;
            
            // Get the character count from the extension
            const storage = this.editor.storage.characterCount;
            if (storage) {
                const chars = storage.characters();
                const words = storage.words();
                
                // Update the display
                const charsSpan = this.characterCountDisplay.querySelector('.count-chars');
                const wordsSpan = this.characterCountDisplay.querySelector('.count-words');
                
                if (charsSpan) charsSpan.textContent = chars;
                if (wordsSpan) wordsSpan.textContent = words;
            }
        }

        updateToolbarState() {
            // Update toolbar button states based on current selection
            const buttons = this.toolbar.querySelectorAll('button[data-toolbar-item]');
            
            buttons.forEach(button => {
                const item = button.dataset.toolbarItem;
                
                // Don't remove active state from drag handle button
                if (item !== 'dragHandle') {
                    button.classList.remove('is-active');
                }
                
                switch (item) {
                    case 'bold':
                        if (this.editor.isActive('bold')) button.classList.add('is-active');
                        break;
                    case 'italic':
                        if (this.editor.isActive('italic')) button.classList.add('is-active');
                        break;
                    case 'underline':
                        if (this.editor.isActive('underline')) button.classList.add('is-active');
                        break;
                    case 'strikethrough':
                        if (this.editor.isActive('strike')) button.classList.add('is-active');
                        break;
                    case 'heading':
                        if (this.editor.isActive('heading')) button.classList.add('is-active');
                        break;
                    case 'blockquote':
                        if (this.editor.isActive('blockquote')) button.classList.add('is-active');
                        break;
                    case 'bulletList':
                        if (this.editor.isActive('bulletList')) button.classList.add('is-active');
                        break;
                    case 'orderedList':
                        if (this.editor.isActive('orderedList')) button.classList.add('is-active');
                        break;
                    case 'codeBlock':
                        if (this.editor.isActive('codeBlock')) button.classList.add('is-active');
                        break;
                    case 'link':
                        if (this.editor.isActive('link')) button.classList.add('is-active');
                        break;
                    case 'theme-toggle':
                        // Update theme toggle icon based on current theme
                        const isDark = document.documentElement.classList.contains('dark-theme');
                        button.innerHTML = this.getIcon(isDark ? 'moon' : 'sun');
                        break;
                }
            });
        }

        toggleTheme() {
            const root = document.documentElement;
            const isDark = root.classList.contains('dark-theme');
            
            if (isDark) {
                root.classList.remove('dark-theme');
                localStorage.setItem('editor-pro-theme', 'light');
            } else {
                root.classList.add('dark-theme');
                localStorage.setItem('editor-pro-theme', 'dark');
            }
            
            // Update toolbar state to refresh theme toggle icon
            this.updateToolbarState();
        }

        // Initialize theme from localStorage
        initializeTheme() {
            const savedTheme = localStorage.getItem('editor-pro-theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                document.documentElement.classList.add('dark-theme');
            }
        }

        setupEventListeners() {
            // Form submission handler to ensure content is synced
            const form = this.textarea.closest('form');
            if (form) {
                form.addEventListener('submit', () => {
                    this.updateTextarea();
                });
            }
            
            // Add keyboard shortcut for save (Cmd-S/Ctrl-S)
            document.addEventListener('keydown', (e) => {
                // Check if we're in the editor
                if (!this.editor || !this.editor.view.hasFocus()) return;
                
                // Cmd-S or Ctrl-S to save
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    this.updateTextarea();
                    
                    // Try to find and click the save button
                    const saveButton = document.querySelector('button[name="task"][value="save"], button[type="submit"]');
                    if (saveButton) {
                        saveButton.click();
                    } else if (form) {
                        // Fallback to form submission
                        const event = new Event('submit', { cancelable: true });
                        form.dispatchEvent(event);
                    }
                }
            });
            
            // Listen for external changes to the textarea (e.g., from Grav media panel)
            this.lastTextareaValue = this.textarea.value;
            
            // Use both input and change events to catch all modifications
            const handleTextareaChange = (event) => {
                // Check if the change came from outside Editor Pro
                const currentValue = this.textarea.value;
                if (currentValue !== this.lastTextareaValue && !this.isUpdatingTextarea) {
                    // External change detected
                    
                    // Check if this is an insertion (media drag/drop)
                    const isInsertion = currentValue.includes(this.lastTextareaValue);
                    const imageSyntaxRegex = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/;
                    
                    if (isInsertion && imageSyntaxRegex.test(currentValue)) {
                        
                        // Find all new images that need resolution
                        const newImages = [];
                        let match;
                        const regex = new RegExp(imageSyntaxRegex, 'g');
                        while ((match = regex.exec(currentValue)) !== null) {
                            const [fullMatch, alt, src, title] = match;
                            // Check if this image is already in pathMappings
                            if (!this.pathMappings?.images?.[src]) {
                                newImages.push({ src, alt, title });
                            }
                        }
                        
                        if (newImages.length > 0) {
                            
                            // Resolve all new images
                            Promise.all(newImages.map(img => 
                                this.resolveImageUrl(img.src).then(resolvedHtml => {
                                    // Extract the resolved src from the HTML
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(resolvedHtml, 'text/html');
                                    const imgElement = doc.querySelector('img');
                                    const resolvedSrc = imgElement ? imgElement.getAttribute('src') : img.src;
                                    
                                    // Add to pathMappings
                                    if (!this.pathMappings.images) {
                                        this.pathMappings.images = {};
                                    }
                                    this.pathMappings.images[img.src] = {
                                        resolved: resolvedSrc,
                                        original: img.src,
                                        data_src: img.src,
                                        html: resolvedHtml
                                    };
                                    
                                    return { src: img.src, resolved: resolvedSrc };
                                }).catch(error => {

                                    return { src: img.src, resolved: img.src };
                                })
                            )).then(() => {
                                // Now process the content with updated pathMappings
                                const { processed, blocks } = this.preserver.preserveContent(currentValue);
                                this.preservedBlocks = blocks;
                                const htmlContent = this.basicMarkdownToHtml(processed);
                                this.editor.commands.setContent(htmlContent);
                                this.lastTextareaValue = currentValue;
                            });
                            
                            return;
                        }
                        
                        // If no new images, just update content
                        const { processed, blocks } = this.preserver.preserveContent(currentValue);
                        this.preservedBlocks = blocks;
                        const htmlContent = this.basicMarkdownToHtml(processed);
                        this.editor.commands.setContent(htmlContent);
                        this.lastTextareaValue = currentValue;
                        return;
                    }
                    
                    // Fall back to full content replacement for other changes
                    const { processed, blocks } = this.preserver.preserveContent(currentValue);
                    this.preservedBlocks = blocks;
                    const htmlContent = this.basicMarkdownToHtml(processed);
                    this.editor.commands.setContent(htmlContent);
                    this.lastTextareaValue = currentValue;
                }
            };
            
            // Listen for both input and change events
            this.textarea.addEventListener('input', handleTextareaChange);
            this.textarea.addEventListener('change', handleTextareaChange);
            
            // Listen for changes in preserved block content areas
            const container = this.textarea.parentNode.querySelector('.editor-pro-container');
            if (container) {
                container.addEventListener('input', (event) => {
                    const target = event.target;
                    if (target.classList.contains('preserved-block-content')) {
                        const blockElement = target.closest('[data-block-id]');
                        if (blockElement) {
                            const blockId = blockElement.getAttribute('data-block-id');
                            const block = this.preservedBlocks.get(blockId);
                            if (block) {
                                // Update the block content - convert from HTML back to markdown for shortcodes
                                if (block.type === 'shortcode' && block.isClosing) {
                                    // Convert HTML content back to markdown, preserving original Grav image syntax
                                    let htmlContent = target.innerHTML;
                                    let markdownContent = this.htmlToMarkdown(htmlContent);
                                    
                                    // Restore original Grav image paths by reversing resolution
                                    markdownContent = markdownContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, resolvedPath) => {
                                        // Find the original path that matches this resolved path
                                        for (const [original, mapping] of Object.entries(this.pathMappings?.images || {})) {
                                            if (mapping.resolved === resolvedPath) {
                                                return `![${alt}](${original})`;
                                            }
                                        }
                                        return match; // Return as-is if no mapping found
                                    });
                                    
                                    block.content = markdownContent;
                                    const params = block.params ? ` ${block.params}` : '';
                                    block.original = `[${block.tagName}${params}]${block.content}[/${block.tagName}]`;
                                } else {
                                    block.content = target.textContent;
                                    block.original = target.textContent;
                                }
                                
                                // Update the data attribute on the element
                                blockElement.setAttribute('data-block-data', JSON.stringify(block));
                                
                                // Sync changes back to textarea after a short delay
                                clearTimeout(this.updateTimeout);
                                this.updateTimeout = setTimeout(() => {
                                    this.updateTextarea();
                                }, 300);
                            }
                        }
                    }
                });
            }
        }

        createDropdown(item) {
            const dropdownContainer = document.createElement('div');
            dropdownContainer.className = 'editor-pro-dropdown';
            dropdownContainer.dataset.toolbarItem = item.name;
            
            // Create button
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'editor-pro-dropdown-toggle';
            button.setAttribute('data-tooltip', item.title);
            button.innerHTML = this.getIcon(item.icon) + '<span class="dropdown-arrow">▼</span>';
            
            // Create dropdown menu
            const menu = document.createElement('div');
            menu.className = 'editor-pro-dropdown-menu';
            
            // Add dropdown items
            item.items.forEach(dropItem => {
                if (dropItem.type === 'separator') {
                    const separator = document.createElement('div');
                    separator.className = 'editor-pro-dropdown-separator';
                    menu.appendChild(separator);
                } else {
                    const menuItem = document.createElement('button');
                    menuItem.type = 'button';
                    menuItem.className = 'editor-pro-dropdown-item';
                    menuItem.innerHTML = `
                        <span class="dropdown-item-icon">${this.getIcon(dropItem.icon)}</span>
                        <span class="dropdown-item-text">${dropItem.title}</span>
                    `;
                    menuItem.onmousedown = (e) => {
                        e.preventDefault(); // Prevent selection loss
                        e.stopPropagation();
                    };
                    menuItem.onclick = (e) => {
                        e.stopPropagation();
                        dropItem.action();
                        this.closeDropdown(dropdownContainer);
                        // Refocus editor to maintain selection
                        this.editor.commands.focus();
                    };
                    menu.appendChild(menuItem);
                }
            });
            
            // Toggle dropdown on click
            button.onmousedown = (e) => {
                e.preventDefault(); // Prevent selection loss
            };
            button.onclick = (e) => {
                e.stopPropagation();
                this.toggleDropdown(dropdownContainer);
            };
            
            dropdownContainer.appendChild(button);
            dropdownContainer.appendChild(menu);
            
            return dropdownContainer;
        }
        
        toggleDropdown(dropdown) {
            const isOpen = dropdown.classList.contains('is-open');
            
            // Close all other dropdowns
            document.querySelectorAll('.editor-pro-dropdown.is-open').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('is-open');
                }
            });
            
            if (!isOpen) {
                dropdown.classList.add('is-open');
                
                // Close on outside click
                const closeHandler = (e) => {
                    if (!dropdown.contains(e.target)) {
                        dropdown.classList.remove('is-open');
                        document.removeEventListener('click', closeHandler);
                    }
                };
                
                setTimeout(() => {
                    document.addEventListener('click', closeHandler);
                }, 0);
            } else {
                dropdown.classList.remove('is-open');
            }
        }
        
        closeDropdown(dropdown) {
            dropdown.classList.remove('is-open');
        }

        // Toolbar Action Methods
        toggleHeading() {
            if (this.editor.isActive('heading')) {
                this.editor.commands.setParagraph();
            } else {
                this.editor.commands.toggleHeading({ level: 2 });
            }
        }
        
        setHeading(level) {
            this.editor.commands.setHeading({ level });
        }

        toggleInlineHtml(tagName) {
            if (!this.editor) return;
            
            // Check if the mark is active
            const isActive = this.editor.isActive(tagName);
            
            if (isActive) {
                // Remove the mark
                this.editor.chain().focus().unsetMark(tagName).run();
            } else {
                // Apply the mark
                this.editor.chain().focus().toggleMark(tagName).run();
            }
        }

        // Create custom modal for better UX
        createModal(title, content, onConfirm, onCancel = null, customButtons = null) {
            // Remove existing modal if any
            const existing = document.querySelector('.editor-pro-modal');
            if (existing) existing.remove();
            
            let footerContent;
            if (customButtons && Array.isArray(customButtons)) {
                footerContent = customButtons.map((button, index) => {
                    const style = button.style || 'secondary';
                    const buttonClass = style === 'primary' ? 'modal-confirm' : 'modal-cancel';
                    return `<button type="button" class="custom-btn-${index} ${buttonClass}" data-button-index="${index}">${button.text}</button>`;
                }).join('');
            } else {
                footerContent = `
                    <button type="button" class="modal-cancel">Cancel</button>
                    <button type="button" class="modal-confirm">OK</button>
                `;
            }
            
            const modal = document.createElement('div');
            modal.className = 'editor-pro-modal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button type="button" class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${footerContent}
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);

            // Sync checkbox states - innerHTML doesn't always sync checked attribute to property
            modal.querySelectorAll('input[type="checkbox"][checked]').forEach(checkbox => {
                checkbox.checked = true;
            });

            // Set up toggle switch click handlers
            modal.querySelectorAll('.editor-pro-toggle').forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    const checkbox = toggle.querySelector('input[type="checkbox"]');
                    const track = toggle.querySelector('.toggle-track');
                    const thumb = toggle.querySelector('.toggle-thumb');

                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        const isNowChecked = checkbox.checked;

                        // Update visual state
                        track.style.backgroundColor = isNowChecked ? '#4a7dff' : '#ccc';
                        thumb.style.left = isNowChecked ? '22px' : '2px';
                        toggle.dataset.checked = isNowChecked;
                    }
                });
            });

            // Event handlers
            const close = () => {
                modal.remove();
                if (onCancel) onCancel();
            };
            
            // Prevent keyboard events from propagating to the editor
            const modalContent = modal.querySelector('.modal-content');
            ['keydown', 'keypress', 'keyup'].forEach(eventType => {
                modalContent.addEventListener(eventType, (e) => {
                    e.stopPropagation();
                    // Allow ESC key to close modal
                    if (eventType === 'keydown' && e.key === 'Escape') {
                        close();
                    }
                }, true);
            });
            
            // Prevent input events from propagating to editor, but allow them within modal
            modalContent.addEventListener('input', (e) => {
                // Only stop propagation if the event is leaving the modal
                if (!modalContent.contains(e.target)) {
                    e.stopPropagation();
                }
            }, true);
            
            modal.querySelector('.modal-close').onclick = close;
            modal.querySelector('.modal-overlay').onclick = close;
            
            if (customButtons && Array.isArray(customButtons)) {
                // Handle custom buttons
                customButtons.forEach((button, index) => {
                    const buttonElement = modal.querySelector(`.custom-btn-${index}`);
                    if (buttonElement && button.callback) {
                        buttonElement.onclick = () => {
                            if (button.callback) {
                                const modalElement = modal;
                                if (button.style === 'primary') {
                                    modal.remove();
                                }
                                button.callback(modalElement);
                                if (button.style !== 'primary') {
                                    modal.remove();
                                }
                            }
                        };
                    }
                });
            } else {
                // Default button handlers
                const cancelBtn = modal.querySelector('.modal-cancel');
                const confirmBtn = modal.querySelector('.modal-confirm');
                
                if (cancelBtn) cancelBtn.onclick = close;
                if (confirmBtn) {
                    confirmBtn.onclick = () => {
                        const modalElement = modal;
                        modal.remove();
                        if (onConfirm) onConfirm(modalElement);
                    };
                }
            }
            
            // Call onConfirm callback if provided (for initialization)
            if (onConfirm && typeof onConfirm === 'function' && (!customButtons || customButtons.length === 0)) {
                // Only call for non-custom button modals during initialization
                setTimeout(() => {
                    if (modal.parentNode) { // Make sure modal is still in DOM
                        onConfirm(modal);
                    }
                }, 10);
            } else if (onConfirm && typeof onConfirm === 'function') {
                // For custom buttons, call onConfirm for initialization
                setTimeout(() => {
                    if (modal.parentNode) {
                        onConfirm(modal);
                    }
                }, 10);
            }
            
            return modal;
        }

        insertSummaryDelimiter() {
            if (!this.editor) {
                return;
            }

            const delimiterValue = this.summaryDelimiter || this.summaryDelimiterTrimmed || '===';
            const contentToInsert = [
                {
                    type: 'summaryDelimiter',
                    attrs: {
                        delimiter: delimiterValue
                    }
                },
                {
                    type: 'paragraph'
                }
            ];

            let inserted = this.editor.chain().focus().insertContent(contentToInsert).run();

            if (!inserted) {
                inserted = this.editor.chain().focus().insertContent({
                    type: 'summaryDelimiter',
                    attrs: {
                        delimiter: delimiterValue
                    }
                }).run();
            }

            if (inserted) {
                this.ensureSummaryInsertionContext();
            }
        }

        ensureSummaryInsertionContext() {
            // Ensure focus so subsequent commands apply to trailing paragraph
            this.editor.commands.focus();

            // If we ended up inside a list item, lift out so the break stands alone
            if (this.editor.isActive('listItem')) {
                this.editor.commands.liftListItem('listItem');
            }

            // Remove blockquote context if still active
            if (this.editor.isActive('blockquote')) {
                this.editor.commands.lift();
            }

            if (this.editor.isActive('blockquote')) {
                this.editor.commands.clearNodes();
            }

            // Final guarantee: ensure the caret sits in a plain paragraph after the summary
            this.editor.commands.clearNodes();
            this.normalizeSummaryDelimiterNodes();
        }

        normalizeSummaryDelimiterNodes() {
            this.unwrapSummaryBlockquotes();

            if (!this.editor) {
                return;
            }

            const currentHtml = this.editor.getHTML();
            const sanitizedHtml = this.fixSummaryDelimiterBlockquotes(currentHtml);

            if (sanitizedHtml !== currentHtml) {
                const initialSelection = this.editor.state.selection;
                const from = initialSelection ? initialSelection.from : null;
                const to = initialSelection ? initialSelection.to : null;

                this.editor.commands.setContent(sanitizedHtml, true);

                if (from !== null && to !== null) {
                    const docSize = this.editor.state.doc.content.size;
                    const safeFrom = Math.min(from, docSize);
                    const safeTo = Math.min(to, docSize);
                    this.editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
                }

                this.updateTextarea();
            }
        }

        unwrapSummaryBlockquotes() {
            if (!this.editor) {
                return;
            }

            const { state, view } = this.editor;
            const replacements = [];

            state.doc.descendants((node, pos) => {
                if (node.type.name === 'blockquote' && node.childCount === 1 && node.firstChild.type.name === 'summaryDelimiter') {
                    replacements.push({ pos, size: node.nodeSize, content: node.content });
                    return false;
                }
            });

            if (!replacements.length) {
                return;
            }

            let tr = state.tr;
            replacements.reverse().forEach(({ pos, size, content }) => {
                tr = tr.replaceWith(pos, pos + size, content);
            });

            view.dispatch(tr);
            this.updateTextarea();
        }

        insertLink() {
            // Check if we're already in a link to edit it
            const isActive = this.editor.isActive('link');
            const attrs = isActive ? this.editor.getAttributes('link') : {};
            const currentUrl = attrs['data-href'] || attrs.href || '';
            const currentText = isActive ? '' : this.editor.state.doc.textBetween(
                this.editor.state.selection.from,
                this.editor.state.selection.to
            );
            
            const content = `
                <div class="form-group">
                    <label for="link-url">URL</label>
                    <input type="url" id="link-url" value="${currentUrl}" placeholder="https://example.com" />
                </div>
                <div class="form-group">
                    <label for="link-text">Link Text</label>
                    <input type="text" id="link-text" value="${currentText}" placeholder="Link text" />
                </div>
                ${isActive ? '<div class="form-group"><label><input type="checkbox" id="remove-link" /> Remove link</label></div>' : ''}
            `;
            
            this.createModal(
                isActive ? 'Edit Link' : 'Insert Link',
                content,
                (modalElement) => {
                    const url = modalElement.querySelector('#link-url').value.trim();
                    const text = modalElement.querySelector('#link-text').value.trim();
                    const removeLink = modalElement.querySelector('#remove-link')?.checked;
                    
                    if (removeLink || !url) {
                        this.editor.commands.unsetLink();
                    } else {
                        // Resolve URL first to get complete HTML from Excerpts
                        this.resolveLinkUrl(url).then(processedHtml => {
                            // Parse the returned HTML to extract all attributes
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(processedHtml, 'text/html');
                            const link = doc.querySelector('a');
                            
                            if (link) {
                                // Get href from processed link and preserve query string
                                let processedHref = link.getAttribute('href') || url;
                                
                                try {
                                    // Extract query string from original url
                                    const queryIndex = url.indexOf('?');
                                    if (queryIndex !== -1) {
                                        const queryString = url.substring(queryIndex);
                                        // Check if processed href already has a query string
                                        if (processedHref.indexOf('?') === -1) {
                                            processedHref = processedHref + queryString;
                                        }
                                    }
                                } catch (e) {

                                }
                                
                                // Get all attributes from the processed link
                                const attrs = {
                                    href: processedHref,
                                    'data-href': url
                                };
                                
                                // Copy any additional attributes (class, rel, etc.)
                                Array.from(link.attributes).forEach(attr => {
                                    if (!['href'].includes(attr.name)) {
                                        attrs[attr.name] = attr.value;
                                    }
                                });
                                
                                if (!isActive && text) {
                                    // Build link HTML with all attributes
                                    const attrString = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
                                    this.editor.commands.insertContent(`<a ${attrString}>${text}</a>`);
                                } else {
                                    // Update existing link or selection
                                    this.editor.commands.setLink(attrs);
                                }
                            } else {
                                // Fallback if parsing fails
                                if (!isActive && text) {
                                    this.editor.commands.insertContent(`<a href="${url}" data-href="${url}">${text}</a>`);
                                } else {
                                    this.editor.commands.setLink({ 
                                        href: url,
                                        'data-href': url 
                                    });
                                }
                            }
                        }).catch(error => {

                            // Fallback to direct insert on error
                            if (!isActive && text) {
                                this.editor.commands.insertContent(`<a href="${url}" data-href="${url}">${text}</a>`);
                            } else {
                                this.editor.commands.setLink({ 
                                    href: url,
                                    'data-href': url 
                                });
                            }
                        });
                    }
                }
            );
        }

        insertImage() {
            const content = `
                <div class="form-group">
                    <label for="image-src">Image URL</label>
                    <input type="url" id="image-src" placeholder="https://example.com/image.jpg" />
                </div>
                <div class="form-group">
                    <label for="image-alt">Alt Text</label>
                    <input type="text" id="image-alt" placeholder="Describe the image" />
                </div>
                <div class="form-group">
                    <label for="image-title">Title</label>
                    <input type="text" id="image-title" placeholder="Image title (tooltip)" />
                </div>
            `;

            this.createModal(
                'Insert Image',
                content,
                (modalElement) => {
                    const src = modalElement.querySelector('#image-src').value.trim();
                    const alt = modalElement.querySelector('#image-alt').value.trim();
                    const title = modalElement.querySelector('#image-title').value.trim();

                    if (src) {
                        // Resolve URL first to get complete HTML from Excerpts
                        this.resolveImageUrl(src).then(processedHtml => {
                            // Parse the returned HTML to extract all attributes
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(processedHtml, 'text/html');
                            const img = doc.querySelector('img');

                            if (img) {
                                // Get all attributes from the processed image
                                const attrs = {
                                    src: img.getAttribute('src') || src,
                                    alt: alt || img.getAttribute('alt') || '',
                                    'data-src': img.getAttribute('data-src') || src
                                };

                                // Add title if provided
                                if (title) {
                                    attrs.title = title;
                                }

                                // Copy any additional attributes (class, style, etc.)
                                Array.from(img.attributes).forEach(attr => {
                                    if (!['src', 'alt', 'title'].includes(attr.name)) {
                                        attrs[attr.name] = attr.value;
                                    }
                                });

                                this.editor.commands.setImage(attrs);
                            } else {
                                // Fallback if parsing fails
                                const attrs = { src, alt };
                                if (title) attrs.title = title;
                                this.editor.commands.setImage(attrs);
                            }
                        }).catch(error => {

                            // Fallback to direct insert on error
                            const attrs = { src, alt };
                            if (title) attrs.title = title;
                            this.editor.commands.setImage(attrs);
                        });
                    }
                }
            );
        }

        editImage(imgElement) {
            // Get the position of the image in the editor
            const view = this.editor.view;
            let pos;
            try {
                pos = view.posAtDOM(imgElement, 0);
            } catch (error) {

                return;
            }
            
            // Get the node at this position
            const node = view.state.doc.nodeAt(pos);
            if (!node || node.type.name !== 'image') {

                return;
            }
            
            // Get current attributes from the node
            const currentSrc = node.attrs.src || '';
            const currentAlt = node.attrs.alt || '';
            const currentTitle = node.attrs.title || '';
            const originalSrc = node.attrs['data-src'] || currentSrc;

            const content = `
                <div class="form-group">
                    <label for="image-src">Image URL</label>
                    <input type="url" id="image-src" value="${originalSrc}" placeholder="https://example.com/image.jpg" />
                </div>
                <div class="form-group">
                    <label for="image-alt">Alt Text</label>
                    <input type="text" id="image-alt" value="${currentAlt}" placeholder="Describe the image" />
                </div>
                <div class="form-group">
                    <label for="image-title">Title</label>
                    <input type="text" id="image-title" value="${currentTitle}" placeholder="Image title (tooltip)" />
                </div>
                <div class="form-group">
                    <label><input type="checkbox" id="remove-image" /> Remove image</label>
                </div>
            `;
            
            this.createModal(
                'Edit Image',
                content,
                async (modalElement) => {
                    // Capture values from the modal element before it's removed
                    const newSrc = modalElement.querySelector('#image-src').value.trim();
                    const newAlt = modalElement.querySelector('#image-alt').value.trim();
                    const newTitle = modalElement.querySelector('#image-title').value.trim();
                    const removeImage = modalElement.querySelector('#remove-image').checked;

                    // Set selection to the image
                    this.editor.commands.setNodeSelection(pos);

                    if (removeImage) {
                        // Remove the image using TipTap command
                        this.editor.commands.deleteSelection();
                    } else if (newSrc) {
                        try {
                            // Resolve the new URL via AJAX (returns full HTML)
                            const resolvedHtml = await this.resolveImageUrl(newSrc);

                            // Parse the resolved HTML to get the new attributes
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(resolvedHtml, 'text/html');
                            const resolvedImg = doc.querySelector('img');

                            if (resolvedImg) {
                                // Build attributes object from resolved image
                                const attrs = {
                                    src: resolvedImg.getAttribute('src') || newSrc,
                                    alt: newAlt || resolvedImg.getAttribute('alt') || '',
                                    title: newTitle || null,
                                    'data-src': newSrc // Always keep the original user input
                                };

                                // Copy any additional attributes (class, style, etc.)
                                Array.from(resolvedImg.attributes).forEach(attr => {
                                    if (!['src', 'alt', 'title'].includes(attr.name)) {
                                        attrs[attr.name] = attr.value;
                                    }
                                });

                                // Update the image node with new attributes
                                const tr = view.state.tr;
                                tr.setNodeMarkup(pos, null, attrs);
                                view.dispatch(tr);
                            } else {
                                // Fallback if parsing fails
                                const tr = view.state.tr;
                                tr.setNodeMarkup(pos, null, {
                                    ...node.attrs,
                                    src: newSrc,
                                    alt: newAlt,
                                    title: newTitle || null,
                                    'data-src': newSrc
                                });
                                view.dispatch(tr);
                            }
                        } catch (error) {

                            // Fallback to direct update
                            const tr = view.state.tr;
                            tr.setNodeMarkup(pos, null, {
                                ...node.attrs,
                                src: newSrc,
                                alt: newAlt,
                                title: newTitle || null,
                                'data-src': newSrc
                            });
                            view.dispatch(tr);
                        }
                    } else if (newAlt !== currentAlt || newTitle !== currentTitle) {
                        // Just update alt text and/or title
                        const tr = view.state.tr;
                        tr.setNodeMarkup(pos, null, {
                            ...node.attrs,
                            alt: newAlt,
                            title: newTitle || null
                        });
                        view.dispatch(tr);
                    }
                }
            );
        }

        editLink(linkElement) {
            // Get the position of the link in the editor
            const view = this.editor.view;
            let pos;
            
            try {
                // Try to get position from the link element or its first text node
                if (linkElement.firstChild && linkElement.firstChild.nodeType === Node.TEXT_NODE) {
                    pos = view.posAtDOM(linkElement.firstChild, 0);
                } else {
                    pos = view.posAtDOM(linkElement, 0);
                }
            } catch (e) {

                return;
            }
            
            // Try to find link mark at the position or in the surrounding area
            let linkMark = null;
            let linkFrom = pos;
            let linkTo = pos;
            
            // First try exact position
            const $pos = view.state.doc.resolve(pos);
            const marks = $pos.marks();
            linkMark = marks.find(mark => mark.type.name === 'link');
            
            // If not found, search in a range around the position
            if (!linkMark) {
                const { from, to } = view.state.selection;
                view.state.doc.nodesBetween(Math.max(0, pos - 10), Math.min(view.state.doc.content.size, pos + 10), (node, nodePos) => {
                    if (linkMark) return false; // Stop if already found
                    
                    if (node.marks.some(mark => mark.type.name === 'link')) {
                        const mark = node.marks.find(mark => mark.type.name === 'link');
                        if (mark) {
                            linkMark = mark;
                            linkFrom = nodePos;
                            linkTo = nodePos + node.nodeSize;
                            return false;
                        }
                    }
                });
            }
            
            if (!linkMark) {

                return;
            }
            
            // Get current attributes
            const currentHref = linkMark.attrs.href || '';
            const currentTarget = linkMark.attrs.target || '';
            const originalHref = linkMark.attrs['data-href'] || currentHref;
            const currentText = linkElement.textContent || '';
            
            const content = `
                <div class="form-group">
                    <label for="link-url">URL</label>
                    <input type="url" id="link-url" value="${originalHref}" placeholder="https://example.com" />
                </div>
                <div class="form-group">
                    <label for="link-text">Link Text</label>
                    <input type="text" id="link-text" value="${currentText}" placeholder="Link text" />
                </div>
                <div class="form-group">
                    <label for="link-target">Target</label>
                    <select id="link-target">
                        <option value="">Same window</option>
                        <option value="_blank" ${currentTarget === '_blank' ? 'selected' : ''}>New window</option>
                    </select>
                </div>
                <div class="form-group">
                    <label><input type="checkbox" id="remove-link" /> Remove link</label>
                </div>
            `;
            
            this.createModal(
                'Edit Link',
                content,
                async (modalElement) => {
                    // Capture values from the modal element before it's removed
                    const newHref = modalElement.querySelector('#link-url').value.trim();
                    const newText = modalElement.querySelector('#link-text').value.trim();
                    const target = modalElement.querySelector('#link-target').value;
                    const removeLink = modalElement.querySelector('#remove-link').checked;
                    
                    // Find the range of the link
                    let from = linkFrom !== undefined ? linkFrom : pos;
                    let to = linkTo !== undefined ? linkTo : pos;
                    
                    // If we don't have the range, find it by walking the document
                    if (from === to) {
                        const doc = view.state.doc;
                        
                        // Walk backward to find the start of the link
                        from = pos;
                        while (from > 0) {
                            const $from = doc.resolve(from - 1);
                            if (!$from.marks().some(m => m.type.name === 'link' && m.eq(linkMark))) {
                                break;
                            }
                            from--;
                        }
                        
                        // Walk forward to find the end of the link
                        to = pos;
                        while (to < doc.content.size) {
                            const $to = doc.resolve(to);
                            if (!$to.marks().some(m => m.type.name === 'link' && m.eq(linkMark))) {
                                break;
                            }
                            to++;
                        }
                    }
                    
                    // Set the selection to the link
                    this.editor.commands.setTextSelection({ from, to });
                    
                    if (removeLink) {
                        // Remove link using TipTap command
                        this.editor.commands.unsetLink();
                    } else if (newHref) {
                        // Update text if provided and different
                        if (newText && newText !== currentText) {
                            // First, replace the text content
                            this.editor.commands.insertContent(newText);
                            // Re-select the newly inserted text
                            this.editor.commands.setTextSelection({ from, to: from + newText.length });
                        }
                        
                        try {
                            // Resolve the new URL via AJAX (returns full HTML)
                            const resolvedHtml = await this.resolveLinkUrl(newHref);
                            
                            // Parse the resolved HTML to get the new attributes
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(resolvedHtml, 'text/html');
                            const resolvedLink = doc.querySelector('a');
                            
                            if (resolvedLink) {
                                // Parse the newHref to preserve query string
                                let resolvedHref = resolvedLink.getAttribute('href') || newHref;
                                
                                try {
                                    // Extract query string from newHref
                                    const queryIndex = newHref.indexOf('?');
                                    if (queryIndex !== -1) {
                                        const queryString = newHref.substring(queryIndex);
                                        // Check if resolved href already has a query string
                                        if (resolvedHref.indexOf('?') === -1) {
                                            resolvedHref = resolvedHref + queryString;
                                        }
                                    }
                                } catch (e) {
                                    // Fallback to original if parsing fails

                                }
                                
                                // Update link with all attributes using TipTap command
                                const attrs = {
                                    href: resolvedHref,
                                    'data-href': newHref,
                                    target: target || null
                                };
                                
                                // Copy any additional attributes from resolved link
                                Array.from(resolvedLink.attributes).forEach(attr => {
                                    if (!['href', 'target'].includes(attr.name)) {
                                        attrs[attr.name] = attr.value;
                                    }
                                });
                                
                                this.editor.commands.setLink(attrs);
                            } else {
                                // Fallback if parsing fails
                                this.editor.commands.setLink({
                                    href: newHref,
                                    'data-href': newHref,
                                    target: target || null
                                });
                            }
                        } catch (error) {

                            // Fallback to direct update
                            this.editor.commands.setLink({
                                href: newHref,
                                'data-href': newHref,
                                target: target || null
                            });
                        }
                    }
                }
            );
        }

        insertTable() {
            // Insert table with proper paragraph content in cells
            const { state, dispatch } = this.editor.view;
            const { $from } = state.selection;
            
            // Create table structure with paragraphs in cells
            const paragraph = state.schema.nodes.paragraph;
            const tableCell = state.schema.nodes.tableCell;
            const tableHeader = state.schema.nodes.tableHeader;
            const tableRow = state.schema.nodes.tableRow;
            const table = state.schema.nodes.table;
            
            // Create cells with empty paragraphs
            const createCell = (isHeader) => {
                const cellType = isHeader ? tableHeader : tableCell;
                return cellType.createAndFill(null, paragraph.create());
            };
            
            // Create rows
            const headerRow = tableRow.create(null, [
                createCell(true),
                createCell(true),
                createCell(true)
            ]);
            
            const bodyRows = [
                tableRow.create(null, [createCell(false), createCell(false), createCell(false)]),
                tableRow.create(null, [createCell(false), createCell(false), createCell(false)])
            ];
            
            // Create table
            const tableNode = table.create(null, [headerRow, ...bodyRows]);
            
            // Insert the table
            const tr = state.tr.replaceSelectionWith(tableNode);
            dispatch(tr);
        }

        // Table manipulation methods
        addRowBefore() {
            this.editor.commands.addRowBefore();
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                this.fixEmptyTableCellsInEditor();
            });
        }

        addRowAfter() {
            this.editor.commands.addRowAfter();
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                this.fixEmptyTableCellsInEditor();
            });
        }

        deleteRow() {
            this.editor.commands.deleteRow();
        }

        addColumnBefore() {
            this.editor.commands.addColumnBefore();
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                this.fixEmptyTableCellsInEditor();
            });
        }

        addColumnAfter() {
            this.editor.commands.addColumnAfter();
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                this.fixEmptyTableCellsInEditor();
            });
        }

        deleteColumn() {
            this.editor.commands.deleteColumn();
        }

        deleteTable() {
            this.editor.commands.deleteTable();
        }

        toggleHeaderRow() {
            this.editor.commands.toggleHeaderRow();
        }

        toggleHeaderColumn() {
            this.editor.commands.toggleHeaderColumn();
        }

        toggleHeaderCell() {
            this.editor.commands.toggleHeaderCell();
        }

        insertHtmlBlock() {
            // Insert an empty raw block (editable) without prompting
            if (this.editor.commands.insertRawBlock) {
                this.editor.commands.insertRawBlock('', 'html');
            } else {

            }
        }

        insertShortcodeBlock() {
            if (!this.shortcodeRegistry) {

                return;
            }
            
            this.showShortcodeSelector();
        }
        
        toggleDragHandle() {

            if (!this.editor) {

                return;
            }
            
            // Toggle the state
            this.dragHandlesVisible = !this.dragHandlesVisible;

            // Update button state and ensure it persists
            const button = this.toolbar.querySelector('[data-toolbar-item="dragHandle"]');
            if (button) {
                if (this.dragHandlesVisible) {
                    button.classList.add('is-active');
                } else {
                    button.classList.remove('is-active');
                }
            }
            
            // Update the editor wrapper class to show/hide drag handles
            const wrapper = this.textarea.closest('.editor-pro-wrapper');
            if (wrapper) {
                if (this.dragHandlesVisible) {
                    wrapper.classList.add('show-drag-handles');
                } else {
                    wrapper.classList.remove('show-drag-handles');
                }

            }
            
            // Store the state in localStorage to persist across page loads
            localStorage.setItem('editor-pro-drag-handles', this.dragHandlesVisible ? 'true' : 'false');
        }
        
        toggleTypography() {
            if (!this.editor) {
                return;
            }
            
            // Toggle the state
            this.typographyEnabled = !this.typographyEnabled;
            
            // Update button state
            const button = this.toolbar.querySelector('[data-toolbar-item="typography"]');
            if (button) {
                if (this.typographyEnabled) {
                    button.classList.remove('is-active');
                    button.innerHTML = this.getIcon('typography');
                    button.setAttribute('data-tooltip', 'Disable Typography Shortcuts');
                } else {
                    button.classList.add('is-active');
                    button.innerHTML = this.getIcon('typographyOff');
                    button.setAttribute('data-tooltip', 'Enable Typography Shortcuts');
                }
            }
            
            // Update the ExtraTypography extension
            if (this.extraTypographyExtension) {
                // Re-configure the extension with enabled/disabled state
                this.editor.extensionManager.extensions.forEach(ext => {
                    if (ext.name === 'extraTypography') {
                        ext.options.enabled = this.typographyEnabled;
                    }
                });
                
                // Force editor to re-process input rules
                // We need to recreate the editor to apply the change
                const currentContent = this.editor.getHTML();
                this.editor.destroy();
                this.initializeEditor();
                this.editor.commands.setContent(currentContent);
            }
            
            // Store the state in localStorage to persist across page loads
            localStorage.setItem('editor-pro-typography', this.typographyEnabled ? 'true' : 'false');
        }

        async toggleMarkdownMode() {
            if (!this.editor) {
                return;
            }

            if (this.isMarkdownMode) {
                // Exit markdown mode - handled by the RawMarkdownMode class
                if (this.rawMarkdownMode) {
                    const success = await this.rawMarkdownMode.exit();
                    if (success) {
                        this.isMarkdownMode = false;
                        const button = this.toolbar.querySelector('[data-toolbar-item="markdown-toggle"]');
                        if (button) {
                            button.classList.remove('is-active');
                        }
                    }
                }
            } else {
                // Enter markdown mode
                try {
                    // Lazy load the RawMarkdownMode module
                    if (!this.rawMarkdownMode) {
                        // Import from the bundled TipTap bundle which includes RawMarkdownMode
                        if (window.RawMarkdownMode) {
                            this.rawMarkdownMode = new window.RawMarkdownMode(this);
                        } else {
                            console.error('RawMarkdownMode not loaded in bundle');
                            return;
                        }
                    }

                    await this.rawMarkdownMode.enter();
                    this.isMarkdownMode = true;

                    const button = this.toolbar.querySelector('[data-toolbar-item="markdown-toggle"]');
                    if (button) {
                        button.classList.add('is-active');
                    }
                } catch (error) {
                    console.error('Failed to enter markdown mode:', error);
                }
            }
        }

        showFindReplace() {
            // Toggle search bar visibility
            if (this.searchBar && this.searchBar.classList.contains('active')) {
                this.hideFindReplace();
            } else {
                this.createSearchBar();
            }
        }
        
        createSearchBar() {
            // Check if search bar already exists
            if (!this.searchBar) {
                // Create search bar element
                const searchBar = document.createElement('div');
                searchBar.className = 'editor-pro-search-bar';
                searchBar.innerHTML = `
                    <div class="search-bar-content">
                        <div class="search-input-group">
                            <input type="text" class="search-input" id="find-text" placeholder="Find..." />
                            <span class="search-results-count">0 of 0</span>
                        </div>
                        <div class="replace-input-group">
                            <input type="text" class="replace-input" id="replace-text" placeholder="Replace with..." />
                        </div>
                        <div class="search-actions">
                            <button type="button" class="search-btn" data-action="prev" title="Previous match (Shift+Enter)">
                                ${this.getIcon('chevronUp')}
                            </button>
                            <button type="button" class="search-btn" data-action="next" title="Next match (Enter)">
                                ${this.getIcon('chevronDown')}
                            </button>
                            <button type="button" class="search-btn" data-action="replace" title="Replace">
                                Replace
                            </button>
                            <button type="button" class="search-btn" data-action="replace-all" title="Replace All">
                                Replace All
                            </button>
                            <button type="button" class="search-btn close-search" data-action="close" title="Close (Esc)">
                                ${this.getIcon('x')}
                            </button>
                        </div>
                    </div>
                `;
                
                // Insert inside toolbar container to maintain sticky behavior
                // First check if there's a toolbar wrapper (for sticky positioning)
                const toolbarWrapper = this.toolbar.closest('.editor-pro-toolbar-wrapper');
                if (toolbarWrapper) {
                    // Insert after toolbar but inside the wrapper
                    toolbarWrapper.appendChild(searchBar);
                } else {
                    // Create a wrapper for both toolbar and search bar
                    const wrapper = document.createElement('div');
                    wrapper.className = 'editor-pro-toolbar-wrapper';
                    this.toolbar.parentNode.insertBefore(wrapper, this.toolbar);
                    wrapper.appendChild(this.toolbar);
                    wrapper.appendChild(searchBar);
                }
                this.searchBar = searchBar;
                
                // Setup event handlers
                this.setupSearchBarHandlers();
            }
            
            // Show the search bar with animation
            requestAnimationFrame(() => {
                this.searchBar.classList.add('active');
                this.searchBar.querySelector('#find-text').focus();
                
                // Update sticky toolbar height if needed
                this.updateStickyHeight();
            });
            
            // Initialize search
            this.initializeSearch();
        }
        
        hideFindReplace() {
            if (this.searchBar) {
                this.searchBar.classList.remove('active');
                this.clearSearchHighlights();
                // Clear search state
                this.searchResults = [];
                this.currentSearchIndex = -1;
                this.findText = '';
                this.replaceText = '';
                
                // Update sticky toolbar height
                setTimeout(() => this.updateStickyHeight(), 300); // Wait for animation
            }
        }
        
        updateStickyHeight() {
            // Update the placeholder height if toolbar is sticky
            const wrapper = document.querySelector('.editor-pro-toolbar-wrapper');
            const placeholder = document.querySelector('.editor-pro-toolbar-placeholder');
            
            if (wrapper && placeholder && wrapper.classList.contains('is-sticky')) {
                placeholder.style.height = wrapper.offsetHeight + 'px';
            }
        }
        
        setupSearchBarHandlers() {
            const findInput = this.searchBar.querySelector('#find-text');
            const replaceInput = this.searchBar.querySelector('#replace-text');
            
            // Initialize search state
            this.findText = '';
            this.replaceText = '';
            this.searchResults = [];
            this.currentSearchIndex = -1;
            
            // Input handlers with debounced search
            let searchTimeout;
            findInput.addEventListener('input', (e) => {
                this.findText = e.target.value;
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.performSearch(), 150);
            });
            
            replaceInput.addEventListener('input', (e) => {
                this.replaceText = e.target.value;
            });
            
            // Keyboard shortcuts in search inputs
            findInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.findPrevious();
                    } else {
                        this.findNext();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideFindReplace();
                }
            });
            
            replaceInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.replaceNext();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideFindReplace();
                }
            });
            
            // Button click handlers
            this.searchBar.querySelectorAll('.search-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    switch(action) {
                        case 'prev':
                            this.findPrevious();
                            break;
                        case 'next':
                            this.findNext();
                            break;
                        case 'replace':
                            this.replaceNext();
                            break;
                        case 'replace-all':
                            this.replaceAll();
                            break;
                        case 'close':
                            this.hideFindReplace();
                            break;
                    }
                });
            });
            
            // Add click handler to editor to focus when user clicks on content
            if (this.editor && this.editor.view) {
                this.editor.view.dom.addEventListener('mousedown', (e) => {
                    // If search bar is active and user clicks in editor, focus the editor
                    if (this.searchBar && this.searchBar.classList.contains('active')) {
                        // Allow the click to proceed and focus the editor
                        setTimeout(() => {
                            this.editor.commands.focus();
                        }, 10);
                    }
                }, { once: false });
            }
        }
        
        initializeSearch() {
            if (this.findText) {
                this.performSearch();
            }
        }
        
        performSearch() {
            this.clearSearchHighlights();
            this.searchResults = [];
            this.currentSearchIndex = -1;
            
            if (!this.findText) {
                this.updateSearchCount();
                return;
            }
            
            // Search through the editor content and highlight matches
            const { state } = this.editor;
            const searchTerm = this.findText.toLowerCase();
            let matches = [];
            
            state.doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                    const text = node.text.toLowerCase();
                    let index = 0;
                    while ((index = text.indexOf(searchTerm, index)) !== -1) {
                        matches.push({
                            from: pos + index,
                            to: pos + index + searchTerm.length
                        });
                        index += searchTerm.length;
                    }
                }
            });
            
            this.searchResults = matches;
            this.highlightSearchResults();
            
            // Auto-select first result
            if (matches.length > 0) {
                this.currentSearchIndex = 0;
                this.selectSearchResult(0);
            }
            
            this.updateSearchCount();
        }
        
        highlightSearchResults() {
            if (!this.editor || !this.searchExtension) return;
            
            // Update the search extension with current results
            this.searchExtension.storage.searchResults = this.searchResults;
            this.searchExtension.storage.currentIndex = this.currentSearchIndex;
            
            // Force editor to re-render decorations
            this.editor.view.dispatch(this.editor.state.tr);
        }
        
        clearSearchHighlights() {
            if (!this.editor || !this.searchExtension) return;
            
            // Clear search results in extension storage
            this.searchExtension.storage.searchResults = [];
            this.searchExtension.storage.currentIndex = -1;
            
            // Force editor to re-render decorations
            this.editor.view.dispatch(this.editor.state.tr);
        }
        
        createSearchHighlightExtension() {
            const self = this;
            
            return TiptapCore.Extension.create({
                name: 'searchHighlight',
                
                addStorage() {
                    return {
                        searchResults: [],
                        currentIndex: -1
                    };
                },
                
                addProseMirrorPlugins() {
                    // Check if PM modules are available
                    if (!window.TiptapPM || !window.TiptapPMView) {

                        return [];
                    }
                    
                    const { Plugin, PluginKey } = window.TiptapPM;
                    const { Decoration, DecorationSet } = window.TiptapPMView;
                    
                    return [
                        new Plugin({
                            key: new PluginKey('searchHighlight'),
                            
                            props: {
                                decorations: (state) => {
                                    try {
                                        const storage = this.storage;
                                        const decorations = [];
                                        
                                        // Create decorations for each search result
                                        if (storage && storage.searchResults) {
                                            storage.searchResults.forEach((result, index) => {
                                                const isCurrentResult = index === storage.currentIndex;
                                                const className = isCurrentResult ? 
                                                    'search-result search-result-current' : 
                                                    'search-result';
                                                
                                                const decoration = Decoration.inline(
                                                    result.from,
                                                    result.to,
                                                    { class: className }
                                                );
                                                decorations.push(decoration);
                                            });
                                        }
                                        
                                        return DecorationSet.create(state.doc, decorations);
                                    } catch (error) {

                                        return DecorationSet.empty;
                                    }
                                }
                            }
                        })
                    ];
                }
            });
        }
        
        selectSearchResult(index, shouldFocusEditor = false) {
            if (index >= 0 && index < this.searchResults.length) {
                const result = this.searchResults[index];
                this.currentSearchIndex = index;
                
                // Set selection without focusing
                this.editor.commands.setTextSelection({ from: result.from, to: result.to });
                
                // Scroll the result into view WITHOUT focusing the editor
                // Use scrollIntoView on the DOM element directly
                const { state, view } = this.editor;
                
                // Get the DOM node for the selection
                try {
                    const domAtPos = view.domAtPos(result.from);
                    if (domAtPos && domAtPos.node) {
                        const element = domAtPos.node.nodeType === Node.TEXT_NODE 
                            ? domAtPos.node.parentElement 
                            : domAtPos.node;
                        
                        if (element) {
                            element.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                                inline: 'nearest'
                            });
                        }
                    }
                } catch (e) {
                    // Fallback: dispatch scroll transaction without focus
                    const tr = state.tr.scrollIntoView();
                    view.dispatch(tr);
                }
                
                // Enhanced scrolling to ensure visibility
                setTimeout(() => {
                    try {
                        const coords = view.coordsAtPos(result.from);
                        const editorRect = view.dom.getBoundingClientRect();
                        
                        // Find the scrollable container
                        let scrollContainer = view.dom.closest('.editor-pro-container');
                        if (!scrollContainer) {
                            // Try to find the scrollable parent
                            scrollContainer = view.dom.parentElement;
                            while (scrollContainer && scrollContainer !== document.body) {
                                const style = window.getComputedStyle(scrollContainer);
                                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                                    break;
                                }
                                scrollContainer = scrollContainer.parentElement;
                            }
                        }
                        
                        if (scrollContainer) {
                            const containerRect = scrollContainer.getBoundingClientRect();
                            const relativeTop = coords.top - containerRect.top + scrollContainer.scrollTop;
                            
                            // Check if we need to scroll
                            const isAbove = coords.top < containerRect.top + 100;
                            const isBelow = coords.bottom > containerRect.bottom - 100;
                            
                            if (isAbove || isBelow) {
                                // Center the result in the viewport
                                const targetScroll = relativeTop - (containerRect.height / 2);
                                scrollContainer.scrollTo({
                                    top: targetScroll,
                                    behavior: 'smooth'
                                });
                            }
                        }
                    } catch (e) {

                    }
                }, 100);
                
                this.updateSearchCount();
                
                // Update the highlighting to show current result
                if (this.searchExtension) {
                    this.searchExtension.storage.currentIndex = index;
                    // Force re-render of decorations
                    this.editor.view.dispatch(this.editor.state.tr);
                }
                
                // Only focus editor if explicitly requested
                if (shouldFocusEditor) {
                    this.editor.commands.focus();
                }
            }
        }
        
        findPrevious() {
            if (this.searchResults.length === 0) return;
            
            let newIndex = this.currentSearchIndex - 1;
            if (newIndex < 0) {
                newIndex = this.searchResults.length - 1;
            }
            this.selectSearchResult(newIndex);
        }
        
        updateSearchCount() {
            const countElement = this.searchBar.querySelector('.search-results-count');
            if (this.searchResults.length === 0) {
                countElement.textContent = '0 of 0';
            } else {
                countElement.textContent = `${this.currentSearchIndex + 1} of ${this.searchResults.length}`;
            }
        }
        
        findNext() {
            if (this.searchResults.length === 0) {
                // Perform search if not done yet
                if (this.findText) {
                    this.performSearch();
                }
                return;
            }
            
            let newIndex = this.currentSearchIndex + 1;
            if (newIndex >= this.searchResults.length) {
                newIndex = 0;
            }
            this.selectSearchResult(newIndex);
        }
        
        replaceNext() {
            if (!this.findText || this.replaceText === undefined) return;
            
            // Store current focus state
            const searchInput = this.searchBar.querySelector('#find-text');
            const replaceInput = this.searchBar.querySelector('#replace-text');
            const hadSearchFocus = document.activeElement === searchInput || document.activeElement === replaceInput;
            
            // Check if we have a current search result selected
            if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchResults.length) {
                const result = this.searchResults[this.currentSearchIndex];
                const { state } = this.editor;
                const { from, to } = state.selection;
                
                // Verify the selection matches our search result
                if (from === result.from && to === result.to) {
                    // Replace the current selection without focusing editor
                    this.editor.chain()
                        .insertContent(this.replaceText)
                        .run();
                    
                    // Re-perform search to update positions
                    setTimeout(() => {
                        this.performSearch();
                        // Try to maintain position or go to next
                        if (this.currentSearchIndex < this.searchResults.length) {
                            this.selectSearchResult(this.currentSearchIndex, false); // Don't focus
                        } else if (this.searchResults.length > 0) {
                            this.selectSearchResult(0, false); // Don't focus
                        }
                        
                        // Restore focus to search/replace input
                        if (hadSearchFocus) {
                            replaceInput.focus();
                        }
                    }, 10);
                } else {
                    // Selection doesn't match, find next
                    this.findNext();
                }
            } else {
                // No current selection, find next
                this.findNext();
            }
        }
        
        replaceAll() {
            if (!this.findText || this.replaceText === undefined) return;
            
            // Store current view position
            const { state } = this.editor;
            const { from } = state.selection;
            
            // Get the current content
            const content = this.editor.getHTML();
            
            // Create a regex for case-insensitive replacement
            const regex = new RegExp(this.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const newContent = content.replace(regex, this.replaceText);
            
            // Set the new content
            this.editor.commands.setContent(newContent);
            
            // Clear search results and update count
            this.searchResults = [];
            this.currentSearchIndex = -1;
            this.updateSearchCount();
            
            // Try to restore cursor position
            try {
                this.editor.commands.setTextSelection({ from: Math.min(from, this.editor.state.doc.content.size - 1) });
            } catch (e) {
                // Ignore selection errors
            }
        }

        showShortcodeSelector() {
            const shortcodes = this.shortcodeRegistry.getAllSortedLogically();
            
            if (shortcodes.length === 0) {
                this.createModal(
                    'No Shortcodes Available',
                    '<p>No shortcodes are currently registered. Please check your plugin configuration.</p>',
                    null,
                    () => {}
                );
                return;
            }

            const content = `
                <div class="shortcode-selector">
                    <div class="shortcode-search-wrapper">
                        <input type="text" 
                               id="shortcode-search" 
                               class="shortcode-search"
                               placeholder="Search shortcodes...">
                    </div>
                    <div class="shortcode-list">
                        ${shortcodes.map(shortcode => {
                            const isParentOnly = shortcode.parentOnly;
                            return `
                            <div class="shortcode-option ${isParentOnly ? 'parent-only' : ''}" 
                                 data-shortcode="${shortcode.name}" 
                                 data-search-terms="${shortcode.name.toLowerCase()} ${shortcode.title.toLowerCase()} ${(shortcode.description || '').toLowerCase()}"
                                 ${isParentOnly ? 'data-parent-only="true"' : ''}>
                                ${shortcode.icon ? `<div class="shortcode-icon">${shortcode.icon}</div>` : '<div class="shortcode-icon"></div>'}
                                <div class="shortcode-info">
                                    <div class="shortcode-info-header">
                                        <span class="shortcode-title">${shortcode.title}</span>
                                        <span class="shortcode-type-badge">${shortcode.type}</span>
                                        ${isParentOnly ? '<span class="shortcode-parent-badge">parent-only</span>' : ''}
                                    </div>
                                    ${shortcode.description ? `<div class="shortcode-description">${shortcode.description}</div>` : ''}
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                </div>
            `;

            this.createModal(
                'Insert Shortcode',
                content,
                (modalElement) => {
                    // Set up search functionality
                    const searchInput = modalElement.querySelector('#shortcode-search');
                    const options = modalElement.querySelectorAll('.shortcode-option');

                    if (!searchInput || options.length === 0) {

                        return;
                    }
                    
                    // Filter function
                    const filterShortcodes = (searchTerm) => {
                        const term = searchTerm.toLowerCase().trim();
                        let visibleCount = 0;
                        
                        options.forEach(option => {
                            const searchTerms = option.dataset.searchTerms || '';
                            // Debug log
                            if (term && option.dataset.shortcode === 'page-inject') {

                            }
                            // Simple partial match - if the search term appears anywhere in the searchTerms
                            const isVisible = !term || searchTerms.includes(term);
                            option.style.display = isVisible ? 'flex' : 'none';
                            if (isVisible) visibleCount++;
                        });
                        
                        // Show/hide "no results" message
                        let noResultsMsg = modalElement.querySelector('.no-results-message');
                        if (visibleCount === 0 && term) {
                            if (!noResultsMsg) {
                                noResultsMsg = document.createElement('div');
                                noResultsMsg.className = 'no-results-message';
                                // Use CSS class instead of inline styles
                                noResultsMsg.textContent = 'No shortcodes found matching your search.';
                                modalElement.querySelector('.shortcode-list').appendChild(noResultsMsg);
                            }
                            noResultsMsg.style.display = 'block';
                        } else if (noResultsMsg) {
                            noResultsMsg.style.display = 'none';
                        }
                    };
                    
                    // Set up search event listener
                    searchInput.addEventListener('input', (e) => {

                        filterShortcodes(e.target.value);
                    }, false);
                    
                    searchInput.addEventListener('keypress', (e) => {
                        e.stopPropagation();
                    });
                    
                    searchInput.addEventListener('keyup', (e) => {
                        e.stopPropagation();
                    });
                    
                    searchInput.addEventListener('keydown', (e) => {
                        e.stopPropagation(); // Always stop propagation first
                        const visibleOptions = Array.from(options).filter(opt => opt.style.display !== 'none');
                        let currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('highlighted'));
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (currentIndex < visibleOptions.length - 1) {
                                if (currentIndex >= 0) visibleOptions[currentIndex].classList.remove('highlighted');
                                currentIndex++;
                                visibleOptions[currentIndex].classList.add('highlighted');
                                visibleOptions[currentIndex].scrollIntoView({ block: 'nearest' });
                            }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (currentIndex > 0) {
                                visibleOptions[currentIndex].classList.remove('highlighted');
                                currentIndex--;
                                visibleOptions[currentIndex].classList.add('highlighted');
                                visibleOptions[currentIndex].scrollIntoView({ block: 'nearest' });
                            }
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (currentIndex >= 0) {
                                const shortcodeName = visibleOptions[currentIndex].dataset.shortcode;
                                this.showShortcodeForm(shortcodeName);
                            }
                        }
                    });

                    // Add hover effects and click handlers
                    options.forEach(option => {
                        option.addEventListener('mouseenter', () => {
                            // Remove highlight from other options
                            options.forEach(opt => opt.classList.remove('highlighted'));
                            option.classList.add('highlighted');
                            option.style.backgroundColor = '#f8f9fa';
                        });
                        option.addEventListener('mouseleave', () => {
                            option.classList.remove('highlighted');
                            option.style.backgroundColor = '';
                        });
                        option.addEventListener('click', () => {
                            // Don't allow clicking on parent-only shortcodes
                            if (option.dataset.parentOnly === 'true') {
                                return;
                            }
                            const shortcodeName = option.dataset.shortcode;
                            this.showShortcodeForm(shortcodeName);
                        });
                    });
                    
                    // Focus search input AFTER all event listeners are attached
                    setTimeout(() => {
                        searchInput.focus();
                    }, 50);
                },
                () => {} // Cancel callback
            );
        }

        showShortcodeForm(shortcodeName) {
            const shortcode = this.shortcodeRegistry.get(shortcodeName);
            if (!shortcode) {

                return;
            }

            // Get the currently selected text (for inline shortcodes)
            const { from, to } = this.editor.state.selection;
            const selectedText = this.editor.state.doc.textBetween(from, to, ' ');

            const attributeEntries = Object.entries(shortcode.attributes);
            const hasAttributes = attributeEntries.length > 0;
            // Block shortcodes don't need content field since they edit inline
            const showContentField = shortcode.hasContent && shortcode.type !== 'block';
            
            // If no attributes and no content field, just insert directly
            if (!hasAttributes && !showContentField) {
                // Insert the shortcode directly without showing modal
                const placeholderId = `shortcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // For inline shortcodes with hasContent, use selected text as content
                const contentToUse = (shortcode.hasContent && shortcode.type === 'inline' && selectedText) ? selectedText : '';
                
                if (shortcode.type === 'block' && this.editor.commands.insertShortcodeBlock) {
                    this.editor.commands.insertShortcodeBlock(
                        shortcodeName,
                        '',
                        {},
                        contentToUse,
                        placeholderId
                    );
                } else if (shortcode.type === 'inline') {
                    // For inline shortcodes, build the shortcode string with selected text
                    const shortcodeText = shortcode.hasContent 
                        ? `[${shortcodeName}]${contentToUse || 'Default content'}[/${shortcodeName}]`
                        : `[${shortcodeName}/]`;
                    
                    // Insert the shortcode (this will handle selected text replacement)
                    this.insertShortcode(shortcode, shortcodeText, {}, contentToUse);
                } else {
                    // Fallback
                    const shortcodeHTML = shortcode.hasContent 
                        ? `[${shortcodeName}]${contentToUse || 'Default content'}[/${shortcodeName}]`
                        : `[${shortcodeName}/]`;
                    this.editor.commands.insertContent(shortcodeHTML);
                }
                
                this.editor.focus();
                return;
            }

            const content = `
                <div class="shortcode-form-container">
                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                        <h3 class="shortcode-modal-title" style="margin: 0 0 8px; color: #333; display: flex; align-items: center; gap: 10px;">
                            ${shortcode.icon ? `<span class="shortcode-modal-icon">${shortcode.icon}</span>` : ''}
                            ${shortcode.title}
                        </h3>
                        <p style="margin: 0; color: #666; font-size: 14px;">${shortcode.description}</p>
                        <p style="margin: 5px 0 0; color: #888; font-size: 12px;">Type: ${shortcode.type}</p>
                    </div>
                    
                    <form class="shortcode-form" style="margin-bottom: 20px;">
                        ${hasAttributes ? attributeEntries.map(([name, config]) => `
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 14px;">
                                    ${config.title || (name.charAt(0).toUpperCase() + name.slice(1))}
                                    ${config.required ? '<span style="color: #e74c3c;">*</span>' : '<span style="color: #888; font-weight: normal;">(optional)</span>'}
                                </label>
                                ${this.renderShortcodeFormField(name, config)}
                                ${config.description ? `<small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">${config.description}</small>` : ''}
                            </div>
                        `).join('') : '<p style="color: #666; font-style: italic;">This shortcode has no configurable attributes.</p>'}
                        
                        ${showContentField ? `
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 14px;">Content</label>
                                <textarea name="content" placeholder="Enter content..." style="
                                    width: 100%;
                                    min-height: 80px;
                                    padding: 8px;
                                    border: 1px solid #ddd;
                                    border-radius: 4px;
                                    font-family: inherit;
                                    resize: vertical;
                                ">${selectedText || ''}</textarea>
                            </div>
                        ` : ''}
                    </form>
                </div>
            `;

            this.createModal(
                'Configure Shortcode',
                content,
                (modalElement) => {
                    // Focus first input
                    const firstInput = modalElement.querySelector('input, textarea, select');
                    if (firstInput) firstInput.focus();
                    
                    // Set up page picker buttons
                    const pagePickerBtns = modalElement.querySelectorAll('.page-picker-btn');
                    pagePickerBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            const attributeName = btn.dataset.attributeName;
                            const field = modalElement.querySelector(`.page-picker-field[data-attribute-name="${attributeName}"]`);
                            const hiddenInput = field.querySelector(`input[name="${attributeName}"]`);
                            const displayInput = field.querySelector('.page-picker-display');
                            
                            // Use our custom page picker
                            if (window.EditorProPagePicker) {
                                window.EditorProPagePicker.show(hiddenInput.value, (selectedRoute) => {
                                    hiddenInput.value = selectedRoute;
                                    displayInput.value = selectedRoute;
                                    
                                    // Fetch page title
                                    fetch(`${window.GravAdmin.config.base_url_relative}/task:pageInjectData`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded',
                                        },
                                        body: `admin-nonce=${window.GravAdmin.config.admin_nonce}&routes[]=${encodeURIComponent(selectedRoute)}`
                                    })
                                    .then(response => response.json())
                                    .then(data => {
                                        if (data.data && data.data[0] && data.data[0].status === 'success') {
                                            const pageData = data.data[0].data;
                                            displayInput.value = `${pageData.title} (${pageData.route})`;
                                            hiddenInput.setAttribute('data-title', pageData.title);
                                        }
                                    })
                                    .catch(err => {

                                        // Still show the route even if title fetch fails
                                        displayInput.value = selectedRoute;
                                    });
                                });
                            } else {
                                // Fallback to simple prompt
                                const newRoute = prompt('Enter page route (e.g. /home, /typography):', hiddenInput.value || '/');
                                if (newRoute) {
                                    hiddenInput.value = newRoute;
                                    displayInput.value = newRoute;
                                    
                                    // Fetch page title
                                    fetch(`${window.GravAdmin.config.base_url_relative}/task:pageInjectData`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded',
                                        },
                                        body: `admin-nonce=${window.GravAdmin.config.admin_nonce}&routes[]=${encodeURIComponent(newRoute)}`
                                    })
                                    .then(response => response.json())
                                    .then(data => {
                                        if (data.data && data.data[0] && data.data[0].status === 'success') {
                                            const pageData = data.data[0].data;
                                            displayInput.value = `${pageData.title} (${pageData.route})`;
                                            hiddenInput.setAttribute('data-title', pageData.title);
                                        }
                                    })
                                    .catch(err => {
                                        // Error handling
                                    });
                                }
                            }
                        });
                    });
                    
                    // Also make display inputs clickable
                    const pageDisplayInputs = modalElement.querySelectorAll('.page-picker-display');
                    pageDisplayInputs.forEach(input => {
                        input.addEventListener('click', (e) => {
                            const field = e.target.closest('.page-picker-field');
                            const btn = field.querySelector('.page-picker-btn');
                            if (btn) btn.click();
                        });
                    });
                },
                () => {}, // Cancel callback
                [
                    {
                        text: 'Back',
                        style: 'secondary',
                        callback: () => {
                            this.showShortcodeSelector();
                        }
                    },
                    {
                        text: 'Insert Shortcode',
                        style: 'primary',
                        callback: (modalElement) => {
                            this.insertConfiguredShortcode(shortcode, modalElement);
                        }
                    }
                ]
            );
        }

        renderShortcodeFormField(name, config) {
            const baseStyle = `
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: inherit;
                font-size: 14px;
            `;

            switch (config.type) {
                case 'select':
                    return `
                        <select name="${name}" style="${baseStyle}">
                            ${config.options ? config.options.map(option => `
                                <option value="${option}" ${option === config.default ? 'selected' : ''}>${option}</option>
                            `).join('') : ''}
                        </select>
                    `;
                case 'color':
                    return `
                        <input type="color" name="${name}" value="${config.default || '#000000'}" style="${baseStyle} height: 40px;">
                    `;
                case 'number':
                    return `
                        <input type="number" name="${name}" value="${config.default || ''}" 
                               ${config.min !== undefined ? `min="${config.min}"` : ''} 
                               ${config.max !== undefined ? `max="${config.max}"` : ''} 
                               ${config.step !== undefined ? `step="${config.step}"` : ''}
                               style="${baseStyle}">
                    `;
                case 'checkbox':
                    return `
                        <label style="display: flex; align-items: center; cursor: pointer; padding: 8px;">
                            <input type="checkbox" name="${name}" ${config.default ? 'checked' : ''} 
                                   style="margin-right: 8px;">
                            ${config.label || 'Enable'}
                        </label>
                    `;
                case 'textarea':
                    return `
                        <textarea name="${name}" placeholder="${config.placeholder || ''}" style="
                            ${baseStyle}
                            min-height: 60px;
                            resize: vertical;
                        ">${config.default || ''}</textarea>
                    `;
                case 'page':
                    return `
                        <div class="page-picker-field" data-attribute-name="${name}">
                            <input type="hidden" name="${name}" value="${config.default || ''}" />
                            <input type="text" 
                                   class="page-picker-display" 
                                   value="${config.default || ''}" 
                                   placeholder="${config.placeholder || 'Click to select a page'}" 
                                   readonly
                                   style="${baseStyle} cursor: pointer; background-color: #f5f5f5;">
                            <button type="button" 
                                    class="btn btn-sm page-picker-btn" 
                                    data-attribute-name="${name}"
                                    style="margin-top: 8px;">
                                Select Page
                            </button>
                        </div>
                    `;
                default: // text
                    return `
                        <input type="text" name="${name}" value="${config.default || ''}" 
                               placeholder="${config.placeholder || ''}" style="${baseStyle}">
                    `;
            }
        }

        insertConfiguredShortcode(shortcode, modalElement) {
            const form = modalElement.querySelector('.shortcode-form');
            const formData = new FormData(form);
            
            // Validate required fields
            const validation = this.validateShortcodeForm(shortcode, formData);
            if (!validation.valid) {
                alert('Please correct the following errors:\n' + validation.errors.join('\n'));
                return;
            }
            
            // Build shortcode string
            const attributes = {};
            Object.entries(shortcode.attributes).forEach(([name, config]) => {
                const value = formData.get(name);
                if (value !== null && value !== '') {
                    if (config.type === 'checkbox') {
                        attributes[name] = form.querySelector(`[name="${name}"]`).checked;
                    } else if (config.type === 'page') {
                        // For page type, also get the title
                        const hiddenInput = form.querySelector(`input[name="${name}"]`);
                        attributes[name] = value;
                        const title = hiddenInput.getAttribute('data-title');
                        // Only add title if not explicitly skipped
                        if (title && !config.skipTitleAttribute) {
                            attributes.title = title;
                        }
                    } else {
                        attributes[name] = value;
                    }
                }
            });
            
            const content = shortcode.hasContent ? (formData.get('content') || '') : '';
            const shortcodeText = this.buildShortcodeString(shortcode, attributes, content);
            
            // Insert the shortcode
            this.insertShortcode(shortcode, shortcodeText, attributes, content);
        }

        validateShortcodeForm(shortcode, formData) {
            const errors = [];
            
            Object.entries(shortcode.attributes).forEach(([name, config]) => {
                const value = formData.get(name);
                
                if (config.required && (!value || value.trim() === '')) {
                    errors.push(`${config.title || name} is required`);
                }
                
                if (value && config.type === 'number') {
                    const numValue = parseFloat(value);
                    if (isNaN(numValue)) {
                        errors.push(`${config.title || name} must be a valid number`);
                    } else {
                        if (config.min !== undefined && numValue < config.min) {
                            errors.push(`${config.title || name} must be at least ${config.min}`);
                        }
                        if (config.max !== undefined && numValue > config.max) {
                            errors.push(`${config.title || name} must be at most ${config.max}`);
                        }
                    }
                }
            });
            
            return { valid: errors.length === 0, errors };
        }

        buildShortcodeString(shortcode, attributes, content) {
            let shortcodeText = `[${shortcode.name}`;
            
            // Add attributes
            Object.entries(attributes).forEach(([name, value]) => {
                if (value === undefined || value === null || value === '') {
                    return;
                }
                // Skip if matches default on config
                const defaultVal = shortcode?.attributes?.[name]?.default;
                if (defaultVal !== undefined && defaultVal === value) {
                    return;
                }
                if (typeof value === 'boolean') {
                    if (value) {
                        shortcodeText += ` ${name}="true"`;
                    }
                    return;
                }
                shortcodeText += ` ${name}="${value}"`;
            });
            
            // Close tag based on shortcode type and content capability
            if (shortcode.hasContent) {
                // Paired shortcode with inner content
                shortcodeText += ']';
                shortcodeText += content + `[/${shortcode.name}]`;
            } else if (shortcode.type === 'inline') {
                // Self-closing inline shortcode
                shortcodeText += '/]';
            } else {
                // Fallback: for non-inline shortcodes with no content, close normally
                shortcodeText += ']';
            }
            
            return shortcodeText;
        }

        insertShortcode(shortcode, shortcodeText, attributes, content) {
            const blockId = this.preserver.generateBlockId();
            
            // Create enhanced block data
            const blockData = {
                type: 'shortcode',
                tagName: shortcode.name,
                shortcodeName: shortcode.name,
                shortcodeType: shortcode.type,
                params: this.buildParamsString(attributes, shortcode),
                attributes: attributes,
                content: content,
                original: shortcodeText,
                isClosing: shortcode.hasContent,
                // Mark as self-closing when shortcode does not support content (especially for inline shortcodes)
                isSelfClosing: shortcode.hasContent === false,
                shortcodeConfig: shortcode
            };
            
            this.preservedBlocks.set(blockId, blockData);
            
            // Insert different node types based on shortcode type
            if (shortcode.type === 'inline') {
                this.insertInlineShortcode(blockId, shortcode, shortcodeText, blockData);
            } else {
                this.insertBlockShortcode(blockId, shortcode, shortcodeText, blockData);
            }
        }

        buildParamsString(attributes, shortcode = null) {
            return Object.entries(attributes).map(([name, value]) => {
                if (value === undefined || value === null || value === '') {
                    return '';
                }
                // Skip defaults when available on config
                const defaultVal = shortcode?.attributes?.[name]?.default;
                if (defaultVal !== undefined && defaultVal === value) {
                    return '';
                }
                if (typeof value === 'boolean') {
                    return ` ${name}="${value ? 'true' : 'false'}"`;
                }
                return ` ${name}="${value}"`;
            }).join('');
        }

        insertBlockShortcode(blockId, shortcode, shortcodeText, blockData) {
            // Use shortcodeBlock node type for proper block shortcode rendering
            const nodeType = 'shortcodeBlock';
            
            // Generate a unique placeholder ID for content preservation
            const placeholderId = blockId || `shortcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create the shortcode block with proper attributes
            const shortcodeNode = this.editor.state.schema.nodes[nodeType].create({
                shortcodeName: shortcode.name,
                params: blockData.params || '',
                attributes: blockData.attributes || {},
                placeholderId: placeholderId
            }, this.editor.state.schema.nodes.paragraph.create());
            
            // Add to preserved blocks for proper markdown conversion
            if (!this.preservedBlocks.has(placeholderId)) {
                this.preservedBlocks.set(placeholderId, {
                    type: 'shortcode',
                    tagName: shortcode.name,
                    shortcodeName: shortcode.name,
                    shortcodeType: 'block',
                    params: blockData.params || '',
                    attributes: blockData.attributes || {},
                    content: '',
                    original: shortcodeText,
                    isClosing: true,
                    isBlock: true
                });
            }
            
            // Insert with proper transaction handling
            const tr = this.editor.state.tr;
            const selection = tr.selection;
            
            tr.replaceSelectionWith(shortcodeNode);
            tr.setMeta('addToHistory', true);
            
            this.editor.view.dispatch(tr);
            
            // Apply custom CSS for WYSIWYG preview if available
            if (shortcode.cssTemplate) {
                this.applyShortcodeCSS(placeholderId, shortcode, blockData.attributes);
            }
            
            // Focus inside the new shortcode
            setTimeout(() => {
                const pos = this.editor.state.selection.from;
                this.editor.chain()
                    .focus()
                    .setTextSelection(pos + 1)
                    .run();
            }, 100);
        }

        applyShortcodeCSS(blockId, shortcode, attributes) {
            // Generate CSS from template
            const customCSS = this.shortcodeRegistry.generateCSS(shortcode.name, attributes);
            if (!customCSS) return;
            
            // Create or update style element for this shortcode
            let styleId = `shortcode-css-${blockId}`;
            let styleElement = document.getElementById(styleId);
            
            if (!styleElement) {
                styleElement = document.createElement('style');
                styleElement.id = styleId;
                document.head.appendChild(styleElement);
            }
            
            // Scope CSS to this specific block
            const scopedCSS = `
                .preserved-block[data-block-id="${blockId}"] .preserved-block-content {
                    ${customCSS}
                }
            `;
            
            styleElement.textContent = scopedCSS;
        }

        removeShortcodeCSS(blockId) {
            const styleElement = document.getElementById(`shortcode-css-${blockId}`);
            if (styleElement) {
                styleElement.remove();
            }
        }

        enhanceShortcodeBlocks() {

            // Enhance preserved shortcode blocks with registry data
            this.preservedBlocks.forEach((block, blockId) => {
                if (block.type === 'shortcode' && this.shortcodeRegistry) {
                    const config = this.shortcodeRegistry.get(block.tagName);
                    if (config) {
                        // Update block with registry data
                        block.shortcodeConfig = config;
                        block.shortcodeType = config.type || 'block';
                        block.isBlock = block.shortcodeType === 'block';
                    } else {

                    }
                }
            });
        }

        applyAllShortcodeCSS() {
            // First enhance all shortcode blocks with registry data
            this.enhanceShortcodeBlocks();
            
            // Apply CSS for all shortcode blocks after editor loads
            this.preservedBlocks.forEach((block, blockId) => {
                if (block.type === 'shortcode' && block.shortcodeConfig && block.shortcodeConfig.cssTemplate) {
                    this.applyShortcodeCSS(blockId, block.shortcodeConfig, block.attributes || {});
                }
            });
        }

        insertInlineShortcode(blockId, shortcode, shortcodeText, blockData) {
            // Use TipTap's command system to insert inline shortcode
            this.editor.commands.insertContent({
                type: 'preservedInline',
                attrs: {
                    blockId: blockId,
                    blockType: 'shortcode',
                    blockContent: shortcodeText,
                    blockData: blockData
                }
            });
            
            // Apply CSS template immediately after creation for consistency
            if (shortcode.cssTemplate) {
                // Use setTimeout to ensure the DOM element exists
                setTimeout(() => {
                    const span = document.querySelector(`[data-block-id="${blockId}"]`);
                    if (span) {
                        const customCSS = this.shortcodeRegistry.generateCSS(shortcode.name, blockData.attributes || {});
                        if (customCSS) {
                            span.style.cssText += `; ${customCSS}`;
                        }
                    }
                }, 0);
            }
        }

        setupInlineShortcodeEventDelegation() {
            // Use event delegation on the editor element to handle clicks on inline shortcodes
            // This works even when TipTap re-renders content
            if (this.editorElement) {
                // Remove any existing click handler to avoid duplicates
                if (this.inlineShortcodeClickHandler) {
                    this.editorElement.removeEventListener('click', this.inlineShortcodeClickHandler);
                }
                
                // Create the click handler
                this.inlineShortcodeClickHandler = (e) => {
                    // Check if clicked element is a preserved inline shortcode
                    const target = e.target;
                    
                    // Debug: Log what was clicked
                    if (target && target.classList && target.classList.contains('preserved-inline')) {

                    }
                    
                    // Check if the target itself is a preserved inline span
                    if (target && target.matches && target.matches('span[data-preserved-inline="true"][data-block-id]')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const blockId = target.getAttribute('data-block-id');

                        // Always try to reconstruct from DOM first
                        const reconstructed = this.reconstructInlineShortcodeBlock(target, blockId);
                        if (reconstructed) {
                            this.editInlineShortcode(blockId);
                        } else if (blockId && this.preservedBlocks.has(blockId)) {
                            this.editInlineShortcode(blockId);
                        } else {

                        }
                        return;
                    }
                    
                    // Check if clicked inside a preserved inline span
                    const preservedInline = target.closest && target.closest('span[data-preserved-inline="true"][data-block-id]');
                    if (preservedInline) {
                        e.preventDefault();
                        e.stopPropagation();
                        const blockId = preservedInline.getAttribute('data-block-id');

                        // Always try to reconstruct from DOM first
                        const reconstructed = this.reconstructInlineShortcodeBlock(preservedInline, blockId);
                        if (reconstructed) {
                            this.editInlineShortcode(blockId);
                        } else if (blockId && this.preservedBlocks.has(blockId)) {
                            this.editInlineShortcode(blockId);
                        } else {

                        }
                    }
                };
                
                // Add the click handler
                this.editorElement.addEventListener('click', this.inlineShortcodeClickHandler);

            } else {

            }
        }
        
        reconstructInlineShortcodeBlock(span, blockId) {
            // Try to reconstruct the block data from the span attributes
            const blockDataJson = span.getAttribute('data-block-data');

            if (blockDataJson) {
                try {
                    const blockData = JSON.parse(blockDataJson);

                    // Ensure we have the shortcode config
                    if (blockData.tagName || blockData.shortcodeName) {
                        const name = blockData.tagName || blockData.shortcodeName;
                        if (this.shortcodeRegistry) {
                            this.shortcodeRegistry.ensureInitialized();
                            const config = this.shortcodeRegistry.get(name);
                            if (config) {
                                blockData.shortcodeConfig = config;

                            } else {

                            }
                        }
                    }
                    
                    // Add to preserved blocks
                    this.preservedBlocks.set(blockId, blockData);

                    return true;
                } catch (e) {

                    return false;
                }
            }

            return false;
        }

        editInlineShortcode(blockId) {
            const block = this.preservedBlocks.get(blockId);
            if (!block) {

                return;
            }
            
            // If shortcodeConfig is missing, try to get it from registry
            if (!block.shortcodeConfig && this.shortcodeRegistry) {
                const shortcodeName = block.tagName || block.shortcodeName;
                if (shortcodeName) {
                    this.shortcodeRegistry.ensureInitialized();
                    const config = this.shortcodeRegistry.get(shortcodeName);
                    if (config) {
                        block.shortcodeConfig = config;

                    } else {
                        // Create a minimal config for unknown shortcodes

                        block.shortcodeConfig = {
                            name: shortcodeName,
                            title: shortcodeName.charAt(0).toUpperCase() + shortcodeName.slice(1),
                            description: `Edit ${shortcodeName} shortcode`,
                            type: block.shortcodeType || 'inline',
                            hasContent: true,
                            attributes: {}
                        };
                        
                        // Try to infer attributes from params
                        if (block.params) {
                            const attrRegex = /([\w-]+)\s*=\s*"([^"]*)"/g;
                            let match;
                            while ((match = attrRegex.exec(block.params)) !== null) {
                                block.shortcodeConfig.attributes[match[1]] = {
                                    type: 'text',
                                    title: match[1].charAt(0).toUpperCase() + match[1].slice(1),
                                    default: match[2]
                                };
                            }
                        }
                    }
                }
            }
            
            if (!block.shortcodeConfig) {

                return;
            }

            const shortcode = block.shortcodeConfig;

            // Extract BBCode value if present and map to appropriate attribute
            // BBCode format: [shortcode=value] or [shortcode="value"]
            if (block.params && shortcode.bbcodeAttribute) {
                const bbcodeMatch = block.params.match(/^\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'\/\]]+))/);
                if (bbcodeMatch) {
                    const bbcodeValue = bbcodeMatch[1] || bbcodeMatch[2] || bbcodeMatch[3];
                    if (!block.attributes) {
                        block.attributes = {};
                    }
                    if (!block.attributes[shortcode.bbcodeAttribute]) {
                        block.attributes[shortcode.bbcodeAttribute] = bbcodeValue;
                    }
                }
            }

            this.showShortcodeEditForm(shortcode, block, blockId);
        }

        showShortcodeEditForm(shortcode, block, blockId, onUpdateCallback = null) {
            const attributeEntries = Object.entries(shortcode.attributes);
            const hasAttributes = attributeEntries.length > 0;

            const content = `
                <div class="shortcode-edit-form-container">
                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                        <h3 class="shortcode-modal-title" style="margin: 0 0 8px; color: #333; display: flex; align-items: center; gap: 10px;">
                            ${shortcode.icon ? `<span class="shortcode-modal-icon">${shortcode.icon}</span>` : ''}
                            Edit ${shortcode.title}
                        </h3>
                        <p style="margin: 0; color: #666; font-size: 14px;">${shortcode.description}</p>
                        <p style="margin: 5px 0 0; color: #888; font-size: 12px;">Type: ${shortcode.type}</p>
                    </div>
                    
                    <form class="shortcode-edit-form" style="margin-bottom: 20px;">
                        ${hasAttributes ? attributeEntries.map(([name, config]) => `
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 14px;">
                                    ${config.title || (name.charAt(0).toUpperCase() + name.slice(1))}
                                    ${config.required ? '<span style="color: #e74c3c;">*</span>' : '<span style="color: #888; font-weight: normal;">(optional)</span>'}
                                </label>
                                ${this.renderShortcodeEditField(name, config, block.attributes[name])}
                                ${config.description ? `<small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">${config.description}</small>` : ''}
                            </div>
                        `).join('') : '<p style="color: #666; font-style: italic;">This shortcode has no configurable attributes.</p>'}
                        
                        ${shortcode.hasContent && shortcode.type !== 'block' ? `
                            <div class="form-group" style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 14px;">Content</label>
                                <textarea name="content" placeholder="Enter content..." style="
                                    width: 100%;
                                    min-height: 80px;
                                    padding: 8px;
                                    border: 1px solid #ddd;
                                    border-radius: 4px;
                                    font-family: inherit;
                                    resize: vertical;
                                ">${block.content || ''}</textarea>
                            </div>
                        ` : ''}
                    </form>
                </div>
            `;

            this.createModal(
                'Edit Shortcode',
                content,
                (modalElement) => {
                    // Focus first input
                    const firstInput = modalElement.querySelector('input, textarea, select');
                    if (firstInput) firstInput.focus();
                    
                    // Set up page picker buttons (same as in showShortcodeForm)
                    const pagePickerBtns = modalElement.querySelectorAll('.page-picker-btn');
                    pagePickerBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            const attributeName = btn.dataset.attributeName;
                            const field = modalElement.querySelector(`.page-picker-field[data-attribute-name="${attributeName}"]`);
                            const hiddenInput = field.querySelector(`input[name="${attributeName}"]`);
                            const displayInput = field.querySelector('.page-picker-display');
                            
                            // Use our custom page picker
                            if (window.EditorProPagePicker) {
                                window.EditorProPagePicker.show(hiddenInput.value, (selectedRoute) => {
                                    hiddenInput.value = selectedRoute;
                                    displayInput.value = selectedRoute;
                                    
                                    // Fetch page title
                                    fetch(`${window.GravAdmin.config.base_url_relative}/task:pageInjectData`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded',
                                        },
                                        body: `admin-nonce=${window.GravAdmin.config.admin_nonce}&routes[]=${encodeURIComponent(selectedRoute)}`
                                    })
                                    .then(response => response.json())
                                    .then(data => {
                                        if (data.data && data.data[0] && data.data[0].status === 'success') {
                                            const pageData = data.data[0].data;
                                            displayInput.value = `${pageData.title} (${pageData.route})`;
                                            hiddenInput.setAttribute('data-title', pageData.title);
                                        }
                                    })
                                    .catch(err => {

                                        displayInput.value = selectedRoute;
                                    });
                                });
                            }
                        });
                    });
                    
                    // Also make display inputs clickable
                    const pageDisplayInputs = modalElement.querySelectorAll('.page-picker-display');
                    pageDisplayInputs.forEach(input => {
                        input.addEventListener('click', (e) => {
                            const field = e.target.closest('.page-picker-field');
                            const btn = field.querySelector('.page-picker-btn');
                            if (btn) btn.click();
                        });
                    });
                    
                    // If we have existing values, fetch their titles
                    const pageFields = modalElement.querySelectorAll('.page-picker-field');
                    pageFields.forEach(field => {
                        const hiddenInput = field.querySelector('input[type="hidden"]');
                        const displayInput = field.querySelector('.page-picker-display');
                        if (hiddenInput.value) {
                            fetch(`${window.GravAdmin.config.base_url_relative}/task:pageInjectData`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                body: `admin-nonce=${window.GravAdmin.config.admin_nonce}&routes[]=${encodeURIComponent(hiddenInput.value)}`
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.data && data.data[0] && data.data[0].status === 'success') {
                                    const pageData = data.data[0].data;
                                    displayInput.value = `${pageData.title} (${pageData.route})`;
                                    hiddenInput.setAttribute('data-title', pageData.title);
                                }
                            });
                        }
                    });
                },
                () => {}, // Cancel callback
                [
                    {
                        text: 'Delete',
                        style: 'danger',
                        callback: () => {
                            this.deleteInlineShortcode(blockId);
                        }
                    },
                    {
                        text: 'Cancel',
                        style: 'secondary',
                        callback: () => {
                            // Just close modal
                        }
                    },
                    {
                        text: 'Update Shortcode',
                        style: 'primary',
                        callback: (modalElement) => {
                            if (onUpdateCallback) {
                                // Use custom callback for new shortcode blocks
                                const updatedBlock = this.extractShortcodeFormData(modalElement, shortcode, block);
                                onUpdateCallback(updatedBlock);
                            } else if (shortcode.type === 'inline') {
                                this.updateInlineShortcode(shortcode, block, blockId, modalElement);
                            } else {
                                this.updateBlockShortcode(shortcode, block, blockId, modalElement);
                            }
                        }
                    }
                ]
            );
        }

        extractShortcodeFormData(modalElement, shortcode, originalBlock) {
            const form = modalElement.querySelector('.shortcode-edit-form');
            const attributes = {};
            
            // Extract attribute values from form
            Object.entries(shortcode.attributes).forEach(([name, config]) => {
                if (config.type === 'page') {
                    // For page type, get value and title
                    const hiddenInput = form.querySelector(`input[name="${name}"]`);
                    if (hiddenInput) {
                        attributes[name] = hiddenInput.value;
                        const title = hiddenInput.getAttribute('data-title');
                        // Only add title if not explicitly skipped
                        if (title && !config.skipTitleAttribute) {
                            attributes.title = title;
                        }
                    }
                } else if (config.type === 'checkbox') {
                    // For checkboxes, use .checked property not .value
                    const checkbox = form.querySelector(`input[name="${name}"]`);
                    if (checkbox) {
                        attributes[name] = checkbox.checked;
                    }
                } else {
                    const input = form.querySelector(`[name="${name}"]`);
                    if (input) {
                        attributes[name] = input.value;
                    }
                }
            });
            
            // Extract content if shortcode has content
            let content = originalBlock.content || '';
            if (shortcode.hasContent) {
                const contentInput = form.querySelector('[name="content"]');
                if (contentInput) {
                    content = contentInput.value;
                }
            }
            
            // Build params string from attributes - use buildParamsString for consistency
            const params = this.buildParamsString(attributes);
            
            return {
                tagName: shortcode.name,
                params: params,
                attributes: attributes,
                content: content,
                type: 'shortcode',
                shortcodeConfig: shortcode
            };
        }

        renderShortcodeEditField(name, config, currentValue) {
            const baseStyle = `
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-family: inherit;
                font-size: 14px;
            `;

            // For editing existing shortcodes, only use current value - don't fall back to default
            // This ensures fields show actual state, not defaults
            const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== '';
            const value = hasValue ? currentValue : '';

            switch (config.type) {
                case 'select':
                    // Support options as array or object (value => label)
                    const options = config.options || [];
                    const optionHtml = Array.isArray(options)
                        ? options.map(option => `
                                <option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>
                            `).join('')
                        : Object.entries(options).map(([val, label]) => `
                                <option value="${val}" ${val === value ? 'selected' : ''}>${label}</option>
                            `).join('');
                    return `
                        <div style="position: relative;">
                            <select name="${name}" style="
                                ${baseStyle}
                                appearance: none;
                                -webkit-appearance: none;
                                -moz-appearance: none;
                                padding-right: 36px;
                                cursor: pointer;
                                background-color: #fff;
                                border: 1px solid #ddd;
                            ">
                                ${optionHtml}
                            </select>
                            <span style="
                                position: absolute;
                                right: 12px;
                                top: 50%;
                                transform: translateY(-50%);
                                pointer-events: none;
                                color: #666;
                                font-size: 10px;
                                display: flex;
                                flex-direction: column;
                                line-height: 10px;
                            ">
                                ▼
                            </span>
                        </div>
                    `;
                case 'color':
                    return `
                        <input type="color" name="${name}" value="${value || '#000000'}" style="${baseStyle} height: 40px;">
                    `;
                case 'number':
                    return `
                        <input type="number" name="${name}" value="${value}" 
                               ${config.min !== undefined ? `min="${config.min}"` : ''} 
                               ${config.max !== undefined ? `max="${config.max}"` : ''} 
                               ${config.step !== undefined ? `step="${config.step}"` : ''}
                               style="${baseStyle}">
                    `;
                case 'checkbox':
                    // Handle both boolean true and string "true"
                    const isChecked = value === true || value === 'true';
                    // Use a simple toggle switch with data attribute for state
                    return `
                        <div class="editor-pro-toggle" data-checked="${isChecked}" style="display: flex; align-items: center; padding: 8px 0; cursor: pointer;">
                            <input type="checkbox" name="${name}" ${isChecked ? 'checked' : ''} style="display: none;">
                            <div class="toggle-track" style="
                                width: 44px;
                                height: 24px;
                                background-color: ${isChecked ? '#4a7dff' : '#ccc'};
                                border-radius: 12px;
                                position: relative;
                                transition: background-color 0.2s;
                                margin-right: 10px;
                                flex-shrink: 0;
                            ">
                                <div class="toggle-thumb" style="
                                    width: 20px;
                                    height: 20px;
                                    background-color: white;
                                    border-radius: 50%;
                                    position: absolute;
                                    top: 2px;
                                    left: ${isChecked ? '22px' : '2px'};
                                    transition: left 0.2s;
                                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                "></div>
                            </div>
                            <span style="color: #333; font-size: 14px; user-select: none;">${config.label || 'Enable'}</span>
                        </div>
                    `;
                case 'textarea':
                    return `
                        <textarea name="${name}" placeholder="${config.placeholder || ''}" style="
                            ${baseStyle}
                            min-height: 60px;
                            resize: vertical;
                        ">${value}</textarea>
                    `;
                case 'page':
                    return `
                        <div class="page-picker-field" data-attribute-name="${name}">
                            <input type="hidden" name="${name}" value="${value}" />
                            <input type="text" 
                                   class="page-picker-display" 
                                   value="${value}" 
                                   placeholder="${config.placeholder || 'Click to select a page'}" 
                                   readonly
                                   style="${baseStyle} cursor: pointer; background-color: #f5f5f5;">
                            <button type="button" 
                                    class="btn btn-sm page-picker-btn" 
                                    data-attribute-name="${name}"
                                    style="margin-top: 8px;">
                                Select Page
                            </button>
                        </div>
                    `;
                default: // text
                    return `
                        <input type="text" name="${name}" value="${value}" 
                               placeholder="${config.placeholder || ''}" style="${baseStyle}">
                    `;
            }
        }

        updateInlineShortcode(shortcode, block, blockId, modalElement) {
            const form = modalElement.querySelector('.shortcode-edit-form');
            const formData = new FormData(form);
            
            // Validate required fields
            const validation = this.validateShortcodeForm(shortcode, formData);
            if (!validation.valid) {
                alert('Please correct the following errors:\n' + validation.errors.join('\n'));
                return;
            }
            
            // Build updated attributes
            const attributes = {};
            Object.entries(shortcode.attributes).forEach(([name, config]) => {
                const value = formData.get(name);
                if (value !== null && value !== '') {
                    if (config.type === 'checkbox') {
                        attributes[name] = form.querySelector(`[name="${name}"]`).checked;
                    } else {
                        attributes[name] = value;
                    }
                }
            });
            
            const content = shortcode.hasContent ? (formData.get('content') || '') : '';
            const shortcodeText = this.buildShortcodeString(shortcode, attributes, content);
            
            // Update block data
            block.attributes = attributes;
            block.content = content;
            block.original = shortcodeText;
            block.params = this.buildParamsString(attributes);
            // Ensure self-closing flag is correct for inline shortcodes without content
            if (shortcode.type === 'inline' && shortcode.hasContent === false) {
                block.isSelfClosing = true;
            }
            
            // Ensure preservedBlocks map has the updated object with new original
            try {
                if (this.preservedBlocks && blockId) {
                    // Create a fresh block object to ensure we don't have stale references
                    const updatedBlock = {
                        ...block,
                        attributes: attributes,
                        content: content,
                        original: shortcodeText,
                        params: this.buildParamsString(attributes, shortcode)
                    };
                    this.preservedBlocks.set(blockId, updatedBlock);

                }
            } catch (e) {

            }

            // Update visual element and inline metadata so save uses fresh data
            // CRITICAL: Use the actual editor DOM, not document
            const container = this.editor?.view?.dom || this.editorElement || document.querySelector('.tiptap');
            
            // Look for all possible inline shortcode selectors
            const selectors = [
                `[data-block-id="${blockId}"]`,
                `[data-preserved-inline="true"][data-block-id="${blockId}"]`,
                `span.preserved-inline[data-block-id="${blockId}"]`,
                `.shortcode[data-block-id="${blockId}"]`
            ];
            const spans = container.querySelectorAll(selectors.join(', '));

            if (spans.length === 0) {

                const allInlines = container.querySelectorAll('[data-preserved-inline="true"]');

                // Log the first few for debugging
                allInlines.forEach((span, i) => {
                    if (i < 3) {

                    }
                });
            }
            spans.forEach((span, index) => {

                // Use unified shortcode renderer for visual display
                const displayText = window.EditorPro?.pluginSystem?.renderShortcodeForEditor(block);
                span.innerHTML = displayText;
                span.title = shortcodeText;
                
                // Update all relevant data attributes with FRESH data
                try {
                    // Create a clean block object for serialization with updated values
                    const blockDataForSave = {
                        type: 'shortcode',
                        tagName: block.tagName || shortcode.name,
                        attributes: attributes,  // Use the NEW attributes from the form
                        params: this.buildParamsString(attributes, shortcode),  // Build fresh params string
                        content: content,  // Use the NEW content
                        original: shortcodeText,  // Use the freshly built shortcode text
                        isSelfClosing: block.isSelfClosing !== false,
                        shortcodeType: block.shortcodeType || shortcode.type || 'inline',
                        isBlock: false,
                        isInline: true
                    };
                    
                    // Update all data attributes to ensure persistence
                    span.setAttribute('data-block-data', JSON.stringify(blockDataForSave));
                    span.setAttribute('data-block-type', 'shortcode');
                    span.setAttribute('data-block-id', blockId);
                    span.setAttribute('data-preserved-inline', 'true');

                } catch (e) {

                }

                // Apply custom CSS if available
                if (shortcode.cssTemplate) {
                    const customCSS = this.shortcodeRegistry.generateCSS(shortcode.name, attributes);
                    if (customCSS) {
                        span.style.cssText += `; ${customCSS}`;
                    }
                }
            });

            // Also update any legacy inline shortcode spans that use data-shortcode-inline + data-placeholder-id
            const inlineSpans = container.querySelectorAll(`span[data-shortcode-inline="true"][data-placeholder-id="${blockId}"]`);
            inlineSpans.forEach(span => {
                // Update params and attributes on the inline element so serializer can reconstruct
                const paramsString = this.buildParamsString(attributes).trim();
                const normalizedParams = this.preserver.normalizeShortcodeParams(paramsString.replace(/^\s+/, ''));
                const encodedParams = btoa(unescape(encodeURIComponent(normalizedParams)));
                span.setAttribute('data-params', normalizedParams);
                span.setAttribute('data-params-base64', encodedParams);
                span.setAttribute('data-attributes', JSON.stringify(attributes || {}));
                // Replace visible inner text with the latest original shortcode source
                span.textContent = shortcodeText;  // Use the updated shortcodeText instead of block.original
                
                // Also update data-block-data for consistency
                const blockDataForSave = {
                    type: 'shortcode',
                    tagName: block.tagName || shortcode.name,
                    attributes: attributes,
                    params: normalizedParams,
                    content: content,
                    original: shortcodeText,
                    isSelfClosing: block.isSelfClosing,
                    shortcodeType: block.shortcodeType || shortcode.type
                };
                span.setAttribute('data-block-data', JSON.stringify(blockDataForSave));

            });
            
            // CRITICAL: Update the TipTap node itself, not just the DOM
            // Find and update the preservedInline node in the editor
            if (this.editor) {
                let nodeFound = false;
                let nodePos = null;
                
                // Find the node position in the editor
                this.editor.state.doc.descendants((node, pos) => {
                    if (node.type.name === 'preservedInline' && node.attrs.blockId === blockId) {
                        nodeFound = true;
                        nodePos = pos;
                        return false; // Stop searching
                    }
                });
                
                if (nodeFound && nodePos !== null) {

                    // Update the node with new attributes
                    const tr = this.editor.state.tr;
                    const displayText = window.EditorPro?.pluginSystem?.renderShortcodeForEditor(block) || shortcodeText;
                    tr.setNodeMarkup(nodePos, null, {
                        blockId: blockId,
                        blockType: 'shortcode',
                        blockContent: displayText,
                        blockData: {
                            type: 'shortcode',
                            tagName: shortcode.name,
                            attributes: attributes,
                            params: this.buildParamsString(attributes, shortcode),
                            content: content,
                            original: shortcodeText,
                            isSelfClosing: block.isSelfClosing !== false,
                            shortcodeType: 'inline',
                            isBlock: false,
                            isInline: true
                        }
                    });
                    this.editor.view.dispatch(tr);

                } else {

                }
            }
            
            // Sync changes back to textarea
            this.updateTextarea();
        }

        deleteInlineShortcode(blockId) {
            // Remove from preserved blocks
            this.preservedBlocks.delete(blockId);
            
            // Remove any custom CSS for this shortcode
            this.removeShortcodeCSS(blockId);
            
            // Remove visual element
            const span = document.querySelector(`[data-block-id="${blockId}"]`);
            if (span) {
                span.remove();
            }
            
            // Sync changes back to textarea
            this.updateTextarea();
        }

        editBlock(blockId) {
            const block = this.preservedBlocks.get(blockId);
            if (!block) return;
            
            // If this is a shortcode with configuration, use the enhanced editor
            if (block.type === 'shortcode' && block.shortcodeConfig) {
                this.showShortcodeEditForm(block.shortcodeConfig, block, blockId);
                return;
            }
            
            // If this is a shortcode without configuration, use generic shortcode editor
            if (block.type === 'shortcode') {
                // Check if we have a registry config for this shortcode
                const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(block.tagName);
                if (config) {
                    // Found config - use the full editor
                    block.shortcodeConfig = config;
                    this.showShortcodeEditForm(config, block, blockId);
                    return;
                }
                
                // No config - use generic editor for undefined shortcodes
                this.showGenericShortcodeEditor(block.tagName, block.params, block.attributes, (updatedParams, updatedAttributes) => {
                    // Update the preserved block
                    block.params = updatedParams;
                    block.attributes = updatedAttributes;
                    
                    // Reconstruct the original shortcode syntax
                    if (block.isSelfClosing) {
                        block.original = `[${block.tagName}${updatedParams ? ' ' + updatedParams : ''} /]`;
                    } else {
                        block.original = `[${block.tagName}${updatedParams ? ' ' + updatedParams : ''}]${block.content || ''}[/${block.tagName}]`;
                    }
                    
                    // Force editor update
                    this.forceEditorUpdate();
                });
                return;
            }
            
            // Otherwise, use the basic modal editor for HTML/Twig blocks
            const blockTypeDisplay = block.type === 'html' ? 'HTML' : 
                                   block.type === 'twig' ? 'Twig' : 'Block';
            
            const content = `
                <div class="form-group">
                    <label for="block-content">${blockTypeDisplay} Content</label>
                    <textarea id="block-content" rows="10" style="font-family: monospace; width: 100%; box-sizing: border-box;">${block.original || ''}</textarea>
                </div>
            `;
            
            this.createModal(
                `Edit ${blockTypeDisplay}`,
                content,
                (modalElement) => {
                    const newContent = modalElement.querySelector('#block-content').value;
                    if (newContent !== block.original) {
                        // Update the preserved block
                        block.content = newContent;
                        block.original = newContent;
                        
                        // Find the editor node and update it
                        const editorElement = document.querySelector(`[data-block-id="${blockId}"]`);
                        if (editorElement) {
                            // Update the content display
                            const contentDiv = editorElement.querySelector('.preserved-block-content');
                            if (contentDiv) {
                                if (block.type === 'shortcode' && block.isClosing) {
                                    contentDiv.innerHTML = newContent;
                                } else {
                                    contentDiv.textContent = newContent;
                                }
                            }
                        }
                        
                        // If this is a shortcode with custom CSS, reapply it
                        if (block.type === 'shortcode' && block.shortcodeConfig && block.shortcodeConfig.cssTemplate) {
                            this.applyShortcodeCSS(blockId, block.shortcodeConfig, block.attributes);
                        }
                        
                        // Sync changes back to textarea
                        this.updateTextarea();
                    }
                }
            );
        }

        editRawBlock(blockId) {
            // Find the raw block node in the editor
            const { state } = this.editor;
            let targetPos = null;
            let targetNode = null;
            
            state.doc.descendants((node, pos) => {
                if (node.type.name === 'rawBlock' && node.attrs.blockId === blockId) {
                    targetPos = pos;
                    targetNode = node;
                    return false;
                }
            });
            
            if (!targetNode) return;
            
            const { language, content } = targetNode.attrs;
            
            const modalContent = `
                <div class="form-group">
                    <label for="raw-content">Raw ${language.toUpperCase()} Code</label>
                    <textarea id="raw-content" rows="15" style="font-family: monospace; width: 100%; box-sizing: border-box;">${content || ''}</textarea>
                </div>
            `;
            
            this.createModal(
                `Edit Raw ${language.toUpperCase()} Code`,
                modalContent,
                (modalElement) => {
                    const newContent = modalElement.querySelector('#raw-content').value;
                    if (newContent !== content) {
                        // Update the node with new content
                        const tr = this.editor.state.tr;
                        tr.setNodeMarkup(targetPos, null, {
                            ...targetNode.attrs,
                            content: newContent
                        });
                        this.editor.view.dispatch(tr);
                        
                        // Also update the preserved block if it exists
                        const block = this.preservedBlocks.get(blockId);
                        if (block) {
                            block.content = newContent;
                            block.original = newContent;
                        }
                        
                        // Sync changes back to textarea
                        this.updateTextarea();
                    }
                }
            );
        }

        editShortcodeBlock(pos, node, editor) {
            const { shortcodeName, params, attributes } = node.attrs;

            // Get shortcode config from registry
            const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(shortcodeName);

            if (!config) {
                // No configuration found - use generic editor
                this.showGenericShortcodeEditor(shortcodeName, params, attributes, (updatedParams, updatedAttributes) => {
                    // Update the node attributes with new values
                    const tr = editor.state.tr;
                    tr.setNodeMarkup(pos, null, {
                        shortcodeName: shortcodeName,
                        params: updatedParams,
                        attributes: updatedAttributes
                    });
                    editor.view.dispatch(tr);

                    // Update the textarea content
                    this.updateTextarea();
                });
                return;
            }

            // Extract BBCode value if present and map to appropriate attribute
            // BBCode format: [shortcode=value] or [shortcode="value"]
            let mergedAttributes = { ...(attributes || {}) };
            if (params && config.bbcodeAttribute) {
                const bbcodeMatch = params.match(/^\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))\s*$/);
                if (bbcodeMatch) {
                    const bbcodeValue = bbcodeMatch[1] || bbcodeMatch[2] || bbcodeMatch[3];
                    // Only set if the attribute isn't already set
                    if (!mergedAttributes[config.bbcodeAttribute]) {
                        mergedAttributes[config.bbcodeAttribute] = bbcodeValue;
                    }
                }
            }

            // Create a temporary block object compatible with showShortcodeEditForm
            const tempBlock = {
                type: 'shortcode',
                tagName: shortcodeName,
                params: params,
                attributes: mergedAttributes,
                shortcodeConfig: config
            };
            
            // Use the existing shortcode edit form
            this.showShortcodeEditForm(config, tempBlock, null, (updatedBlock) => {
                // Update the node attributes with new values, preserving existing attrs
                const tr = editor.state.tr;
                // Get current node to preserve codeContent and other attrs
                const currentNode = editor.state.doc.nodeAt(pos);
                tr.setNodeMarkup(pos, null, {
                    ...currentNode.attrs,  // Preserve all existing attrs (codeContent, contentType, placeholderId)
                    shortcodeName: updatedBlock.tagName,
                    params: updatedBlock.params,
                    attributes: updatedBlock.attributes
                });
                editor.view.dispatch(tr);

                // Update the textarea content
                this.updateTextarea();
            });
        }
        
        showGenericShortcodeEditor(shortcodeName, params, attributes, callback) {
            // Create a generic editor for undefined shortcodes
            const content = `
                <div class="form-group">
                    <label for="shortcode-name">Shortcode Name</label>
                    <input type="text" id="shortcode-name" class="form-control" value="${escapeHtml(shortcodeName)}" disabled />
                    <small class="form-text text-muted">This shortcode is not registered in the system.</small>
                </div>
                <div class="form-group">
                    <label for="shortcode-params">Parameters</label>
                    <input type="text" id="shortcode-params" class="form-control" value="${escapeHtml(params || '')}" 
                           placeholder='e.g., label="Click me" color="blue" size="large"' />
                    <small class="form-text text-muted">Enter parameters as key="value" pairs separated by spaces.</small>
                </div>
                <div class="form-group">
                    <label>Parsed Attributes (read-only)</label>
                    <div class="well" style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
                        ${Object.keys(attributes || {}).length > 0 ? 
                            Object.entries(attributes).map(([key, value]) => 
                                `<div><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`
                            ).join('') : 
                            '<em>No attributes parsed</em>'
                        }
                    </div>
                </div>
            `;
            
            this.createModal(
                `Edit Shortcode: [${shortcodeName}]`,
                content,
                (modalElement) => {
                    const paramsInput = modalElement.querySelector('#shortcode-params');
                    const updatedParams = paramsInput.value.trim();
                    
                    // Parse the parameters to attributes
                    const updatedAttributes = {};
                    if (updatedParams) {
                        const attrRegex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(updatedParams)) !== null) {
                            const value = attrMatch[2] !== undefined ? attrMatch[2] : 
                                         (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
                            updatedAttributes[attrMatch[1]] = value;
                        }
                    }
                    
                    callback(updatedParams, updatedAttributes);
                },
                () => {
                    // Cancel callback - do nothing
                }
            );
        }

        addChildShortcodeBlock(pos, parentNode, editor, allowedChildren) {
            if (!allowedChildren || allowedChildren.length === 0) {
                alert('No child shortcodes available for this parent.');
                return;
            }
            
            const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
            if (!registry) {
                alert('Shortcode registry not available.');
                return;
            }
            
            // If only one child type is allowed, use it directly
            if (allowedChildren.length === 1) {
                const childShortcodeName = allowedChildren[0];
                const childConfig = registry.get(childShortcodeName);
                if (!childConfig) {
                    alert(`Child shortcode configuration for "${childShortcodeName}" not found.`);
                    return;
                }
                
                this.insertChildShortcode(pos, parentNode, editor, childConfig);
                return;
            }
            
            // Multiple children available - show selection dialog
            const childShortcodes = allowedChildren.map(name => registry.get(name)).filter(Boolean);
            
            let optionsHtml = '';
            childShortcodes.forEach(config => {
                optionsHtml += `
                    <div class="shortcode-option" data-shortcode="${config.name}">
                        <div class="shortcode-option-content">
                            <h4>${config.title}</h4>
                            <p>${config.description || 'No description available.'}</p>
                        </div>
                    </div>
                `;
            });
            
            const content = `
                <div class="form-group">
                    <label>Select child shortcode to add:</label>
                    <div class="shortcode-options">
                        ${optionsHtml}
                    </div>
                </div>
            `;
            
            this.createModal(
                'Add Child Shortcode',
                content,
                (modalElement) => {
                    const selectedOption = modalElement.querySelector('.shortcode-option.selected');
                    if (!selectedOption) {
                        alert('Please select a shortcode to add.');
                        return false; // Prevent modal close
                    }
                    
                    const shortcodeName = selectedOption.getAttribute('data-shortcode');
                    const childConfig = registry.get(shortcodeName);
                    if (childConfig) {
                        this.insertChildShortcode(pos, parentNode, editor, childConfig);
                    }
                },
                () => {
                    // User cancelled - do nothing
                }
            );
            
            // Add click handlers for shortcode options
            setTimeout(() => {
                const options = document.querySelectorAll('.shortcode-option');
                options.forEach(option => {
                    option.addEventListener('click', () => {
                        // Remove selected class from all options
                        options.forEach(opt => opt.classList.remove('selected'));
                        // Add selected class to clicked option
                        option.classList.add('selected');
                    });
                });
            }, 100);
        }

        insertChildShortcode(pos, parentNode, editor, childConfig) {
            // Get fresh position and node reference
            const currentPos = typeof pos === 'function' ? pos() : pos;
            if (currentPos === undefined) {
                alert('Unable to determine parent position. Please try again.');
                return;
            }
            
            // Get the current node at this position to ensure it still exists
            const currentNode = editor.state.doc.nodeAt(currentPos);
            if (!currentNode || currentNode.type.name !== 'shortcodeBlock') {
                alert('Parent shortcode not found. It may have been moved or deleted.');
                return;
            }
            
            // Create child shortcode block with default attributes
            const defaultAttributes = {};
            if (childConfig.attributes) {
                Object.entries(childConfig.attributes).forEach(([name, config]) => {
                    if (config.default) {
                        defaultAttributes[name] = config.default;
                    }
                });
            }
            
            // Generate a unique placeholder ID for the child
            const placeholderId = `shortcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Add to preserved blocks for proper markdown conversion
            this.preservedBlocks.set(placeholderId, {
                type: 'shortcode',
                tagName: childConfig.name,
                shortcodeName: childConfig.name,
                shortcodeType: 'block',
                params: '',
                attributes: defaultAttributes,
                content: '',
                original: `[${childConfig.name}][/${childConfig.name}]`,
                isClosing: true,
                isBlock: true
            });
            
            // Calculate insertion position - find the position after the last child shortcode
            let insertPos = currentPos + 1; // Start after the parent node opening
            
            if (currentNode.content.size === 0) {
                // Parent is empty, insert at the beginning
                insertPos = currentPos + 1;
            } else {
                // Find the last child shortcode position
                let lastChildPos = currentPos + 1;
                currentNode.content.forEach((child, offset) => {
                    if (child.type.name === 'shortcodeBlock') {
                        lastChildPos = currentPos + 1 + offset + child.nodeSize;
                    }
                });
                insertPos = lastChildPos;
            }
            
            // Use the insertChildShortcodeBlock command if available
            if (editor.commands.insertChildShortcodeBlock) {
                editor.commands.insertChildShortcodeBlock(currentPos, childConfig.name, defaultAttributes);
            } else {
                // Fallback to manual insertion
                const childShortcodeNode = editor.state.schema.nodes.shortcodeBlock.create({
                    shortcodeName: childConfig.name,
                    params: '',
                    attributes: defaultAttributes,
                    placeholderId: placeholderId
                }, editor.state.schema.nodes.paragraph.create());
                
                editor.chain()
                    .focus()
                    .insertContentAt(insertPos, childShortcodeNode)
                    .run();
            }
            
            // Focus inside the new child shortcode
            setTimeout(() => {
                editor.chain()
                    .focus()
                    .setTextSelection(insertPos + 1)
                    .run();
            }, 100);
            
            // Update the textarea content
            this.updateTextarea();
        }

        deleteBlock(blockId) {
            const block = this.preservedBlocks.get(blockId);
            if (!block) return;
            
            const blockTypeDisplay = block.type === 'shortcode' ? 'Shortcode' : 
                                   block.type === 'html' ? 'HTML' : 
                                   block.type === 'twig' ? 'Twig' : 'Block';
            
            const content = `
                <div class="form-group">
                    <p>Are you sure you want to delete this ${blockTypeDisplay.toLowerCase()}?</p>
                    <p><strong>This action cannot be undone.</strong></p>
                </div>
            `;
            
            this.createModal(
                `Delete ${blockTypeDisplay}`,
                content,
                (modalElement) => {
                    // Delete the block
                    this.preservedBlocks.delete(blockId);
                    
                    // Remove any custom CSS for this shortcode
                    this.removeShortcodeCSS(blockId);
                    
                    // Remove the element from the editor
                    const editorElement = document.querySelector(`[data-block-id="${blockId}"]`);
                    if (editorElement) {
                        editorElement.remove();
                    }
                    
                    // Sync changes back to textarea
                    this.updateTextarea();
                },
                () => {
                    // User cancelled - do nothing
                }
            );
        }

        editGravImage(blockId) {
            const block = this.preservedBlocks.get(blockId);
            if (!block || block.type !== 'grav-image') return;
            
            // TODO: Open a proper modal UI for editing Grav image actions
            const newActions = prompt(`Edit Grav image actions (JSON format):`, JSON.stringify(block.actions, null, 2));
            if (newActions !== null) {
                try {
                    const parsedActions = JSON.parse(newActions);
                    block.actions = parsedActions;
                    
                    // Rebuild query string
                    const params = new URLSearchParams();
                    Object.entries(parsedActions).forEach(([key, value]) => {
                        params.set(key, value);
                    });
                    block.queryString = '?' + params.toString();
                    
                    // Update original markdown
                    block.original = `![${block.alt}](${block.imagePath}${block.queryString})`;
                } catch (error) {
                    alert('Invalid JSON format');
                }
            }
        }

        // Resolve image path using pre-loaded mappings (no AJAX needed)
        resolveImagePath(imagePath) {
            const mapping = this.pathMappings?.images?.[imagePath];
            
            if (mapping) {
                return {
                    resolved: mapping.resolved,
                    original: mapping.original,
                    dataSrc: mapping.data_src || mapping.original
                };
            }
            
            // Fallback for unmapped paths
            return {
                resolved: imagePath,
                original: imagePath,
                dataSrc: imagePath
            };
        }

        // Helper method for markdown shortcuts to resolve Grav image paths
        async resolveGravImagePath(imagePath) {
            try {
                const resolvedHtml = await this.resolveImageUrl(imagePath);
                if (resolvedHtml && typeof resolvedHtml === 'string') {
                    // Parse the HTML to extract the src
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(resolvedHtml, 'text/html');
                    const img = doc.querySelector('img');
                    if (img) {
                        return img.getAttribute('src');
                    }
                }
                return imagePath;
            } catch (error) {

                return imagePath;
            }
        }
        
        // Resolve single image URL via AJAX using NextGen Editor's convertUrls endpoint
        async resolveImageUrl(imagePath) {
            // Try to get admin context if not already loaded
            if (!this.adminRoute || !this.adminNonce) {
                this.loadAdminContext();
            }
            
            if (!this.adminRoute || !this.adminNonce) {

                return imagePath;
            }

            try {
                // Create HTML img element like NextGen Editor does
                const imgHtml = `<img src="${imagePath}" alt="" />`;
                
                const formData = new FormData();
                // Ensure proper route format (remove leading slash if present, then add it)
                const cleanRoute = this.pageRoute.startsWith('/') ? this.pageRoute : `/${this.pageRoute}`;
                formData.append('route', btoa(cleanRoute));
                formData.append('data', JSON.stringify({
                    img: [imgHtml],
                    a: []
                }));

                // Use the same URL format as NextGen Editor
                const baseUrl = window.GravAdmin?.config?.current_url || `${this.adminRoute}/pages`;
                const response = await fetch(`${baseUrl}/action:convertUrls/admin-nonce:${this.adminNonce}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.status === 'success' && data.data?.images?.[imgHtml]) {
                    // Return the complete processed HTML from the server
                    return data.data.images[imgHtml];
                }
                
                throw new Error('Failed to resolve image path');
            } catch (error) {

                throw error;
            }
        }

        // Resolve link path using pre-loaded mappings (no AJAX needed)
        resolveLinkPath(linkPath) {
            const mapping = this.pathMappings?.links?.[linkPath];
            
            if (mapping) {
                return {
                    resolved: mapping.resolved,
                    original: mapping.original,
                    dataHref: mapping.data_href || mapping.original
                };
            }
            
            // Fallback for unmapped paths
            return {
                resolved: linkPath,
                original: linkPath,
                dataHref: linkPath
            };
        }

        // Resolve single link URL via AJAX using NextGen Editor's convertUrls endpoint
        async resolveLinkUrl(linkPath) {
            if (!this.adminRoute || !this.adminNonce) {

                return linkPath;
            }

            try {
                // Create HTML a element like NextGen Editor does
                const linkHtml = `<a href="${linkPath}">Link</a>`;
                
                const formData = new FormData();
                // Ensure proper route format (remove leading slash if present, then add it)
                const cleanRoute = this.pageRoute.startsWith('/') ? this.pageRoute : `/${this.pageRoute}`;
                formData.append('route', btoa(cleanRoute));
                formData.append('data', JSON.stringify({
                    img: [],
                    a: [linkHtml]
                }));

                // Use the same URL format as NextGen Editor
                const baseUrl = window.GravAdmin?.config?.current_url || `${this.adminRoute}/pages`;
                const response = await fetch(`${baseUrl}/action:convertUrls/admin-nonce:${this.adminNonce}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.status === 'success' && data.data?.links?.[linkHtml]) {
                    // Return the complete processed HTML from the server
                    return data.data.links[linkHtml];
                }
                
                throw new Error('Failed to resolve link path');
            } catch (error) {

                throw error;
            }
        }

        // Reload admin context from wrapper element if not already loaded
        loadAdminContext() {
            const wrapper = this.textarea.closest('.editor-pro-wrapper');
            if (wrapper) {
                this.adminRoute = wrapper.getAttribute('data-admin-route');
                this.adminNonce = wrapper.getAttribute('data-admin-nonce');
                this.pageRoute = wrapper.getAttribute('data-page-route');
                
                // Fallback to NextGen Editor's global config if still missing
                if ((!this.adminRoute || !this.adminNonce) && window.GravAdmin?.config) {
                    this.adminRoute = this.adminRoute || window.GravAdmin.config.current_url?.replace(/\/pages.*$/, '');
                    this.adminNonce = this.adminNonce || window.GravAdmin.config.admin_nonce;
                    this.pageRoute = this.pageRoute || window.GravAdmin.config.route;
                }
            } else {

            }
        }

        // Fallback AJAX method for dynamic path resolution (when needed)
        async resolvePathViaAjax(paths, type = 'both') {
            if (!this.adminRoute || !this.adminNonce) {

                return { images: {}, links: {} };
            }

            try {
                const data = {};
                if (type === 'both' || type === 'images') {
                    data.img = Array.isArray(paths.images) ? paths.images : [];
                }
                if (type === 'both' || type === 'links') {
                    data.a = Array.isArray(paths.links) ? paths.links : [];
                }

                const body = new FormData();
                body.append('route', btoa(`/${this.pageRoute}`));
                body.append('data', JSON.stringify(data));

                const response = await fetch(`${window.location.origin}${this.adminRoute}/action:convertUrls/admin-nonce:${this.adminNonce}`, {
                    method: 'POST',
                    body: body
                });

                if (response.ok) {
                    const result = await response.json();
                    return result.data || { images: {}, links: {} };
                }
            } catch (error) {

            }

            return { images: {}, links: {} };
        }

        /**
         * Clean up empty paragraphs with ProseMirror trailing breaks around custom blocks
         * This prevents extra spacing around shortcode and raw blocks in the editor
         */
        cleanupTrailingBreakParagraphs(content) {
            if (!content || typeof content !== 'string') {
                return content;
            }

            // More comprehensive patterns to match custom blocks
            const blockSelectors = [
                'data-shortcode-block',
                'data-raw-block', 
                'data-preserved-block',
                'data-summary-delimiter',
                'class="shortcode-block"',
                'class="raw-block"'
            ];

            // Create a pattern that matches any of our custom blocks
            const blockPattern = blockSelectors.map(selector => {
                if (selector.startsWith('class=')) {
                    return `[^>]*${selector.replace('class="', 'class="[^"]*').replace('"', '[^"]*"')}`;
                }
                return `[^>]*${selector}`;
            }).join('|');

            // Remove empty trailing break paragraphs before custom blocks
            content = content.replace(
                new RegExp(`<p>(?:\\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\\s*)*<\\/p>\\s*(?=<div(?:${blockPattern}))`, 'g'),
                ''
            );

            // Remove empty trailing break paragraphs after custom blocks
            content = content.replace(
                new RegExp(`(?<=<\\/div>)\\s*<p>(?:\\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\\s*)*<\\/p>`, 'g'),
                ''
            );

            // Also clean up multiple consecutive empty paragraphs with trailing breaks
            content = content.replace(
                /<p>(?:\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\s*)*<\/p>(?:\s*<p>(?:\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\s*)*<\/p>)+/g,
                ''
            );

            // Clean up standalone empty paragraphs with only trailing breaks
            content = content.replace(
                /<p>\s*<br[^>]*class="ProseMirror-trailingBreak"[^>]*>\s*<\/p>/g,
                ''
            );

            return content;
        }

        /**
         * Remove unnecessary paragraph wrappers that are auto-generated by marked.parse()
         * This prevents extra padding around shortcode blocks in the editor
         */
        removeUnnecessaryParagraphs(content) {
            if (!content || typeof content !== 'string') {
                return content;
            }

            // Trim whitespace first
            content = content.trim();
            
            // If content is empty, return as-is
            if (!content) {
                return content;
            }

            // Check if the content is wrapped in a single paragraph with no meaningful block elements
            const singleParagraphMatch = content.match(/^<p>(.*?)<\/p>$/s);
            if (singleParagraphMatch) {
                const innerContent = singleParagraphMatch[1].trim();
                
                // Don't remove paragraph if it contains block-level elements that should be wrapped
                const hasBlockElements = /<(?:div|section|article|aside|header|footer|nav|main|figure|blockquote|pre|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|h[1-6])\b/i.test(innerContent);
                
                // Don't remove paragraph if content has multiple paragraphs (indicated by </p><p> pattern)
                const hasMultipleParagraphs = content.includes('</p>') && content.lastIndexOf('</p>') !== content.indexOf('</p>');
                
                // Remove the wrapper paragraph if:
                // 1. No block elements inside
                // 2. Not multiple paragraphs
                // 3. Inner content is not empty
                if (!hasBlockElements && !hasMultipleParagraphs && innerContent) {
                    return innerContent;
                }
            }

            // If it's multiple paragraphs but only contains simple content, we might still want to unwrap
            // Check if ALL content is in paragraph tags with no other block elements
            const allParagraphsMatch = content.match(/^(<p>.*?<\/p>)+$/s);
            if (allParagraphsMatch) {
                // Check if removing all paragraph wrappers would leave us with simple inline content
                const withoutParagraphs = content.replace(/<\/?p>/g, '');
                const hasBlockElements = /<(?:div|section|article|aside|header|footer|nav|main|figure|blockquote|pre|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|h[1-6])\b/i.test(withoutParagraphs);
                
                // Only unwrap if no block elements remain and we have actual content
                if (!hasBlockElements && withoutParagraphs.trim()) {
                    // Replace paragraph tags with line breaks to preserve some structure
                    return content.replace(/<\/p>\s*<p>/g, '\n').replace(/<\/?p>/g, '');
                }
            }

            return content;
        }

        /**
         * Fix empty table cells by adding a paragraph element
         * TipTap's TableCell requires at least one paragraph due to content: 'paragraph+' configuration
         */
        fixEmptyTableCells(html) {
            if (!html || typeof html !== 'string') {
                return html;
            }

            // Create a temporary DOM to manipulate
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Find all table cells (td and th)
            const cells = doc.querySelectorAll('td, th');
            
            cells.forEach(cell => {
                // Check if cell is truly empty or only contains whitespace
                const content = cell.innerHTML.trim();
                if (!content) {
                    // Add an empty paragraph to satisfy TipTap's requirements
                    const p = doc.createElement('p');
                    cell.appendChild(p);
                }
            });
            
            // Return the modified HTML
            return doc.body.innerHTML;
        }

        fixEmptyTableCellsInEditor() {
            if (!this.editor) return;
            
            const { state, dispatch } = this.editor.view;
            const { doc, schema } = state;
            const tr = state.tr;
            
            // Walk through the document to find empty table cells
            doc.descendants((node, pos) => {
                if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                    if (node.content.size === 0) {
                        // Insert a paragraph into the empty cell
                        const paragraph = schema.nodes.paragraph.create();
                        tr.insert(pos + 1, paragraph);
                    }
                }
            });
            
            if (tr.docChanged) {
                dispatch(tr);
            }
        }

        createCodeMirrorCompatibility() {
            // First, ensure Editor object exists
            if (typeof window.Editor === 'undefined') {
                window.Editor = { editors: jQuery ? jQuery() : [] };
            }
            
            // Create a fake CodeMirror instance that Grav's media panel can use
            const fakeCodeMirror = {
                doc: {
                    replaceSelection: (text) => {
                        // Check if this is image markdown
                        const imageSyntaxRegex = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/;
                        if (imageSyntaxRegex.test(text)) {
                            // Parse the markdown
                            const match = text.match(imageSyntaxRegex);
                            if (match) {
                                const [fullMatch, alt, src, title] = match;
                                
                                // Resolve and insert the image
                                this.resolveImageUrl(src).then(resolvedHtml => {
                                    // Extract the resolved src from the HTML
                                    const parser = new DOMParser();
                                    const doc = parser.parseFromString(resolvedHtml, 'text/html');
                                    const imgElement = doc.querySelector('img');
                                    const resolvedSrc = imgElement ? imgElement.getAttribute('src') : src;
                                    
                                    // Update pathMappings
                                    if (!this.pathMappings.images) {
                                        this.pathMappings.images = {};
                                    }
                                    this.pathMappings.images[src] = {
                                        resolved: resolvedSrc,
                                        original: src,
                                        data_src: src,
                                        html: resolvedHtml
                                    };
                                    
                                    // Insert the image
                                    this.editor.commands.setImage({
                                        src: resolvedSrc,
                                        alt: alt || '',
                                        'data-src': src,
                                        title: title || ''
                                    });
                                    
                                    // Update textarea
                                    this.updateTextarea();
                                }).catch(error => {

                                    // Fallback: insert with original src
                                    this.editor.commands.setImage({
                                        src: src,
                                        alt: alt || '',
                                        'data-src': src,
                                        title: title || ''
                                    });
                                    this.updateTextarea();
                                });
                                
                                return;
                            }
                        }
                        
                        // For non-image content, insert as text
                        const { from, to } = this.editor.state.selection;
                        
                        // Insert the text at cursor position
                        this.editor.chain()
                            .focus()
                            .deleteRange({ from, to })
                            .insertContent(text)
                            .run();
                        
                        // Update the textarea to reflect the change
                        this.updateTextarea();
                        
                        // Trigger the textarea change event manually since we updated via TipTap
                        // Need to ensure the textarea value is updated first
                        setTimeout(() => {
                            const event = new Event('input', { bubbles: true });
                            this.textarea.dispatchEvent(event);
                        }, 0);
                    },
                    getValue: () => this.textarea.value,
                    setValue: (value) => {
                        this.textarea.value = value;
                        const event = new Event('input', { bubbles: true });
                        this.textarea.dispatchEvent(event);
                    }
                },
                getValue: () => this.textarea.value,
                setValue: (value) => {
                    this.textarea.value = value;
                    const event = new Event('input', { bubbles: true });
                    this.textarea.dispatchEvent(event);
                },
                getCursor: () => {
                    const { from } = this.editor.state.selection;
                    return from;
                },
                setCursor: (pos) => {
                    this.editor.commands.setTextSelection(pos);
                },
                focus: () => {
                    this.editor.commands.focus();
                }
            };
            
            // Store the fake CodeMirror instance on the textarea's jQuery data
            if (typeof jQuery !== 'undefined' && jQuery(this.textarea).length) {
                const $textarea = jQuery(this.textarea);
                $textarea.data('codemirror', fakeCodeMirror);
                
                // Add this textarea to the Editor.editors collection if it has the right name
                if ($textarea.attr('name') === 'data[content]' && window.Editor && window.Editor.editors) {
                    // Check if already in collection
                    let found = false;
                    window.Editor.editors.each(function() {
                        if (this === $textarea[0]) {
                            found = true;
                        }
                    });
                    
                    if (!found) {
                        // Add to the collection
                        window.Editor.editors = window.Editor.editors.add($textarea);
                    }
                }
                
                // Override media panel insert button behavior
                jQuery(document).off('click.media-insert').on('click.media-insert', '[data-dz-insert]', (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    // Get the filename
                    const $preview = jQuery(e.currentTarget).closest('.dz-preview');
                    const filename = $preview.find('.dz-filename').text();
                    
                    if (filename) {
                        // Convert to markdown
                        const uri = encodeURI(filename);
                        const title = uri.split('.').slice(0, -1).join('.');
                        const isImage = uri.match(/\.(jpe?g|png|gif|svg|webp|avif|mp4|webm|ogv|mov)$/i);
                        const markdown = isImage ? `![${title}](${uri} "${title}")` : `[${decodeURI(uri)}](${uri})`;
                        
                        // Call our replaceSelection method
                        if (fakeCodeMirror.doc.replaceSelection) {
                            fakeCodeMirror.doc.replaceSelection(markdown);
                        }
                    }
                    
                    return false;
                });
            }
            
        }

    }

    // Initialize global plugin system
    window.EditorPro = window.EditorPro || {};
    
    window.EditorPro.pluginSystem = new EditorProPluginSystem();
    window.EditorPro.registerPlugin = function(plugin) {
        window.EditorPro.pluginSystem.register(plugin);
    };
    
    // Shortcode registration methods
    window.EditorPro.registerShortcode = function(config) {
        return window.EditorPro.pluginSystem.registerShortcode(config);
    };
    
    window.EditorPro.getShortcodeRegistry = function() {
        return window.EditorPro.pluginSystem.getShortcodeRegistry();
    };

    // Initialize Editor Pro on all matching textareas
    function initializeEditorPro() {
        const textareas = document.querySelectorAll('textarea[data-grav-field="editor-pro"]');
        
        textareas.forEach((textarea, index) => {
            if (!textarea.dataset.editorProInitialized) {
                try {
                    new EditorPro(textarea);
                    textarea.dataset.editorProInitialized = 'true';
                } catch (error) {
                    // Silently handle initialization errors
                }
            }
        });
    }

    // Main initialization function - called when TipTap is ready
    function initializeEditorProSystem() {

        try {
            // Now create both the ShortcodeNode and PreservedBlock nodes since TipTap is available
            ShortcodeNode = createShortcodeNode();
            PreservedBlock = createPreservedBlockNode();
            ShortcodeBlock = createShortcodeBlockNode();
            PreservedInline = createInlinePreservedNode();
            SummaryDelimiterNode = createSummaryDelimiterNode();
            RawBlock = window.TiptapRawBlock?.RawBlock;
            LinkExtension = createLinkExtension();
        } catch (error) {

            PreservedBlock = null;
            SummaryDelimiterNode = null;
            RawBlock = null;
            LinkExtension = null;
        }
        
        // Initialize Editor Pro on textareas
        initializeEditorPro();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            waitForTipTap(initializeEditorProSystem);
        });
    } else {
        waitForTipTap(initializeEditorProSystem);
    }

    // Mutation observer disabled for now
    function setupMutationObserver() {
        // Mutation observer functionality is currently disabled
    }

})();
