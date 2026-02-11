// ShortcodeBlock Node - TipTap node for Grav shortcodes with nested content support
// Supports both regular block content and code content (with CodeMirror editor)
import { Node } from '@tiptap/core'
import { EditorView, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

// Language extension mapping for CodeMirror
const getLanguageExtension = (lang) => {
    const langLower = (lang || '').toLowerCase();
    const langMap = {
        'javascript': javascript(),
        'js': javascript(),
        'typescript': javascript({ typescript: true }),
        'ts': javascript({ typescript: true }),
        'jsx': javascript({ jsx: true }),
        'tsx': javascript({ typescript: true, jsx: true }),
        'html': html(),
        'htm': html(),
        'xml': html(),
        'svg': html(),
        'markdown': markdown(),
        'md': markdown(),
        // For languages without specific support, use JavaScript as fallback
        // This provides basic syntax highlighting
        'python': javascript(),
        'py': javascript(),
        'php': javascript(),
        'ruby': javascript(),
        'rb': javascript(),
        'go': javascript(),
        'rust': javascript(),
        'rs': javascript(),
        'java': javascript(),
        'c': javascript(),
        'cpp': javascript(),
        'csharp': javascript(),
        'cs': javascript(),
        'swift': javascript(),
        'kotlin': javascript(),
        'kt': javascript(),
        'bash': javascript(),
        'shell': javascript(),
        'sh': javascript(),
        'sql': javascript(),
        'json': javascript(),
        'yaml': javascript(),
        'yml': javascript(),
        'css': javascript(),
        'scss': javascript(),
        'sass': javascript(),
        'less': javascript(),
        'txt': javascript(),
        'text': javascript(),
        'plain': javascript(),
        'diff': javascript(),
        'grav': javascript()
    };

    return langMap[langLower] || javascript();
};

// Helper: Create shortcode header (shared by both views)
function createShortcodeHeader({ shortcodeName, title, attributes, params, config, getPos, editor, node, isCodeType = false }) {
    const header = document.createElement('div');
    header.className = 'shortcode-block-header';

    // Check if this shortcode can have children
    const canHaveChildren = config && config.allowedChildren && config.allowedChildren.length > 0;
    const addChildButton = canHaveChildren ?
        `<button type="button" class="shortcode-add-child-btn" title="Add Child Item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-plus">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 5l0 14" />
                <path d="M5 12l14 0" />
            </svg>
        </button>` : '';

    // Build title with key attributes for code shortcodes
    let titleText = title;
    if (isCodeType) {
        // Use "Codesh: title - lang - lines: x" format for codesh plugin
        const isCodesh = config && config.plugin === 'codesh';
        if (isCodesh) {
            // Extract language from attributes or BBCode-style params (e.g., [codesh=javascript])
            let lang = attributes?.lang;
            if (!lang && params) {
                // BBCode format: params might be "=javascript" or just "javascript"
                const paramStr = params.trim();
                if (paramStr.startsWith('=')) {
                    lang = paramStr.substring(1).trim();
                } else if (paramStr && !paramStr.includes('=')) {
                    lang = paramStr;
                }
            }

            const parts = [];
            const hideLang = attributes?.['hide-lang'] === true || attributes?.['hide-lang'] === 'true';
            if (attributes?.title) parts.push(attributes.title);
            if (lang && !hideLang) parts.push(lang);
            if (attributes?.theme) parts.push(`theme: ${attributes.theme}`);
            if (attributes?.highlight) parts.push(`lines: ${attributes.highlight}`);
            if (attributes?.focus) parts.push(`focus: ${attributes.focus}`);
            if (attributes?.['line-numbers'] === true || attributes?.['line-numbers'] === 'true') parts.push('numbered');
            if (attributes?.diff === true || attributes?.diff === 'true') parts.push('diff');
            if (attributes?.['hide-header'] === true || attributes?.['hide-header'] === 'true') parts.push('no-header');
            if (hideLang) parts.push('no-lang');
            if (attributes?.wrap === 'true') parts.push('wrap');
            if (attributes?.wrap === 'false') parts.push('no-wrap');
            const paramText = parts.length > 0 ? parts.join(' - ') : '';
            titleText = paramText ? `${title}: ${paramText}` : title;
        } else if (attributes) {
            // Default behavior for other code-type shortcodes
            const lang = attributes.lang || attributes.language;
            const displayTitle = attributes.title;
            if (displayTitle) {
                titleText = `${title}: ${displayTitle}`;
            } else if (lang) {
                titleText = `${title} (${lang})`;
            }
        }
    }

    // Create title span
    const titleSpan = document.createElement('span');
    titleSpan.className = 'shortcode-block-title';
    titleSpan.textContent = titleText;
    header.appendChild(titleSpan);

    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'shortcode-block-controls';
    controls.innerHTML = `
        ${addChildButton}
        <button type="button" class="shortcode-edit-btn" title="Edit shortcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="shortcode-delete-btn" title="Delete shortcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
    `;
    header.appendChild(controls);

    // Add event handlers
    controls.querySelector('.shortcode-edit-btn').onclick = () => {
        try {
            if (window.EditorPro && window.EditorPro.editShortcodeBlock) {
                const pos = typeof getPos === 'function' ? getPos() : getPos;
                if (pos !== undefined) {
                    // Get the current node from editor state to ensure we have latest attrs
                    const currentNode = editor.state.doc.nodeAt(pos);
                    if (currentNode) {
                        window.EditorPro.editShortcodeBlock(pos, currentNode, editor);
                    }
                }
            }
        } catch (error) {
            // Error editing shortcode
        }
    };

    controls.querySelector('.shortcode-delete-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const pos = typeof getPos === 'function' ? getPos() : getPos;
        if (pos === undefined) return;

        // Get the current node from editor state
        const currentNode = editor.state.doc.nodeAt(pos);
        if (currentNode) {
            editor.chain()
                .focus()
                .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
                .run();
        }
    };

    // Add child button handler if it exists
    const addChildBtn = controls.querySelector('.shortcode-add-child-btn');
    if (addChildBtn && canHaveChildren) {
        addChildBtn.onclick = () => {
            try {
                if (window.EditorPro && window.EditorPro.addChildShortcodeBlock) {
                    const pos = typeof getPos === 'function' ? getPos() : getPos;
                    if (pos !== undefined) {
                        // Get the current node from editor state
                        const currentNode = editor.state.doc.nodeAt(pos);
                        if (currentNode) {
                            window.EditorPro.addChildShortcodeBlock(pos, currentNode, editor, config.allowedChildren);
                        }
                    } else {
                        alert('Unable to add child shortcode. Please save and reload the page.');
                    }
                }
            } catch (error) {
                alert('An error occurred while adding the child shortcode.');
            }
        };
    }

    return header;
}

// Code shortcode view with CodeMirror editor
function createCodeShortcodeView({ node, HTMLAttributes, getPos, editor, config }) {
    let codeMirrorView = null;
    let updating = false;
    let currentNode = node;

    const { shortcodeName, params, attributes, codeContent } = node.attrs;
    const title = config?.title || shortcodeName.charAt(0).toUpperCase() + shortcodeName.slice(1);

    // Create container
    const dom = document.createElement('div');
    dom.classList.add('shortcode-block-wrapper', `shortcode-${shortcodeName}`, 'shortcode-code-type');

    // Create header
    const header = createShortcodeHeader({
        shortcodeName,
        title,
        attributes,
        params,
        config,
        getPos,
        editor,
        node: currentNode,
        isCodeType: true
    });

    // Create CodeMirror editor container
    const editorContainer = document.createElement('div');
    editorContainer.className = 'shortcode-code-editor';

    // Get language from attributes
    const language = attributes?.lang || attributes?.language || config?.language || 'javascript';

    // Check if line numbers should be shown
    const showLineNumbers = attributes?.['line-numbers'] === true || attributes?.['line-numbers'] === 'true';
    const startLine = parseInt(attributes?.start, 10) || 1;

    // Create CodeMirror editor
    const createCodeMirror = () => {
        const extensions = [
            getLanguageExtension(language),
            oneDark,
            EditorView.lineWrapping,
            // Add line numbers if enabled
            ...(showLineNumbers ? [lineNumbers({
                formatNumber: (n) => String(n + startLine - 1)
            })] : []),
            EditorView.updateListener.of((update) => {
                if (updating) return;

                if (update.docChanged) {
                    const newContent = update.state.doc.toString();

                    // Update the TipTap node
                    if (typeof getPos === 'function') {
                        try {
                            const pos = getPos();
                            if (pos !== undefined) {
                                updating = true;
                                const tr = editor.state.tr;
                                tr.setNodeMarkup(pos, null, {
                                    ...currentNode.attrs,
                                    codeContent: newContent
                                });
                                editor.view.dispatch(tr);
                                updating = false;
                            }
                        } catch (error) {
                            // Node may have been removed, skip update
                        }
                    }
                }
            }),
            EditorView.theme({
                '&': {
                    fontSize: '14px',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
                },
                '.cm-content': {
                    padding: '16px',
                    minHeight: '80px'
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-editor': {
                    borderRadius: '0 0 8px 8px'
                }
            }),
            EditorView.domEventHandlers({
                keydown: (event, view) => {
                    // Stop propagation to prevent TipTap interference
                    event.stopPropagation();

                    // Handle Tab key - but allow Shift+Tab for accessibility navigation
                    if (event.key === 'Tab' && !event.shiftKey) {
                        event.preventDefault();
                        view.dispatch(view.state.replaceSelection('  ')); // Insert 2 spaces
                        return true;
                    }

                    // Let CodeMirror handle all other keys naturally
                    return false;
                }
            })
        ];

        const state = EditorState.create({
            doc: (codeContent || '').trim(),
            extensions
        });

        return new EditorView({
            state,
            parent: editorContainer
        });
    };

    // Initialize CodeMirror
    codeMirrorView = createCodeMirror();

    // Create hidden content DOM for TipTap (required for schema consistency)
    const contentDOM = document.createElement('div');
    contentDOM.className = 'shortcode-inner-content hidden';
    contentDOM.style.display = 'none';

    // Assemble DOM
    dom.appendChild(header);
    dom.appendChild(editorContainer);
    dom.appendChild(contentDOM);

    // Helper to generate title text for codesh
    const generateTitleText = (attrs) => {
        const isCodesh = config && config.plugin === 'codesh';
        if (!isCodesh) return title;

        let lang = attrs?.lang;
        if (!lang && attrs?.params) {
            const paramStr = (attrs.params || '').trim();
            if (paramStr.startsWith('=')) {
                lang = paramStr.substring(1).trim();
            } else if (paramStr && !paramStr.includes('=')) {
                lang = paramStr;
            }
        }

        const parts = [];
        const hideLang = attrs?.['hide-lang'] === true || attrs?.['hide-lang'] === 'true';
        if (attrs?.title) parts.push(attrs.title);
        if (lang && !hideLang) parts.push(lang);
        if (attrs?.theme) parts.push(`theme: ${attrs.theme}`);
        if (attrs?.highlight) parts.push(`lines: ${attrs.highlight}`);
        if (attrs?.focus) parts.push(`focus: ${attrs.focus}`);
        if (attrs?.['line-numbers'] === true || attrs?.['line-numbers'] === 'true') parts.push('numbered');
        if (attrs?.diff === true || attrs?.diff === 'true') parts.push('diff');
        if (attrs?.['hide-header'] === true || attrs?.['hide-header'] === 'true') parts.push('no-header');
        if (hideLang) parts.push('no-lang');
        if (attrs?.wrap === 'true') parts.push('wrap');
        if (attrs?.wrap === 'false') parts.push('no-wrap');
        const paramText = parts.length > 0 ? parts.join(' - ') : '';
        return paramText ? `${title}: ${paramText}` : title;
    };

    return {
        dom,
        contentDOM, // Required for nodes with content spec
        update: (updatedNode) => {
            if (updatedNode.type.name !== 'shortcodeBlock') return false;
            if (updatedNode.attrs.shortcodeName !== currentNode.attrs.shortcodeName) return false;

            // Check if language changed - requires recreation of CodeMirror
            const oldLang = currentNode.attrs.attributes?.lang || currentNode.attrs.attributes?.language || config?.language || 'javascript';
            const newLang = updatedNode.attrs.attributes?.lang || updatedNode.attrs.attributes?.language || config?.language || 'javascript';
            if (oldLang !== newLang) return false;

            // Check if line numbers setting changed - requires recreation of CodeMirror
            const oldLineNumbers = currentNode.attrs.attributes?.['line-numbers'] === true || currentNode.attrs.attributes?.['line-numbers'] === 'true';
            const newLineNumbers = updatedNode.attrs.attributes?.['line-numbers'] === true || updatedNode.attrs.attributes?.['line-numbers'] === 'true';
            const oldStart = parseInt(currentNode.attrs.attributes?.start, 10) || 1;
            const newStart = parseInt(updatedNode.attrs.attributes?.start, 10) || 1;
            if (oldLineNumbers !== newLineNumbers || oldStart !== newStart) return false;

            // Update our reference
            currentNode = updatedNode;

            // Update the header title if attributes changed
            const titleSpan = header.querySelector('.shortcode-block-title');
            if (titleSpan) {
                const newTitleText = generateTitleText(updatedNode.attrs.attributes);
                titleSpan.textContent = newTitleText;
            }

            // Update CodeMirror if content changed externally
            if (updating) return true;

            const newContent = (updatedNode.attrs.codeContent || '').trim();
            if (codeMirrorView && newContent !== codeMirrorView.state.doc.toString()) {
                updating = true;
                const transaction = codeMirrorView.state.update({
                    changes: {
                        from: 0,
                        to: codeMirrorView.state.doc.length,
                        insert: newContent
                    }
                });
                codeMirrorView.dispatch(transaction);
                updating = false;
            }

            return true;
        },
        destroy: () => {
            if (codeMirrorView) {
                codeMirrorView.destroy();
            }
        },
        stopEvent: (event) => {
            // Let CodeMirror handle all events within the editor container
            return editorContainer.contains(event.target);
        },
        ignoreMutation: (mutation) => {
            // Ignore mutations within the CodeMirror editor
            return editorContainer.contains(mutation.target);
        }
    };
}

// Regular block shortcode view
function createBlockShortcodeView({ node, HTMLAttributes, getPos, editor, config }) {
    const { shortcodeName, params, attributes } = node.attrs;

    // Create container
    const dom = document.createElement('div');
    dom.classList.add('shortcode-block-wrapper', `shortcode-${shortcodeName}`);

    const title = config?.title || shortcodeName.charAt(0).toUpperCase() + shortcodeName.slice(1);

    // Check if shortcode has a custom renderer
    let useCustomRenderer = false;
    let customContent = null;
    if (config && config.customRenderer && typeof config.customRenderer === 'function') {
        try {
            // Prepare block data for custom renderer
            const blockData = {
                tagName: shortcodeName,
                attributes: attributes || {},
                params: params || '',
                content: '' // Block shortcodes typically don't have inline content
            };
            customContent = config.customRenderer(blockData, config);
            useCustomRenderer = true;
        } catch (error) {
            // Failed to use custom renderer for shortcode
            useCustomRenderer = false;
        }
    }

    // Build title with attributes (only if not using custom renderer)
    let titleText = title;
    if (!useCustomRenderer && attributes && Object.keys(attributes).length > 0) {
        const attrDisplay = Object.entries(attributes)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        titleText += ` (${attrDisplay})`;
    }

    // Create header
    const header = document.createElement('div');
    header.className = 'shortcode-block-header';

    // Check if this shortcode can have children
    const canHaveChildren = config && config.allowedChildren && config.allowedChildren.length > 0;
    const addChildButton = canHaveChildren ?
        `<button type="button" class="shortcode-add-child-btn" title="Add Child Item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-plus">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 5l0 14" />
                <path d="M5 12l14 0" />
            </svg>
        </button>` : '';

    // Check if this is a nested shortcode (has parentOnly flag)
    const isNested = config && config.parentOnly;

    // Create title span or use custom content
    if (useCustomRenderer && customContent) {
        // Use custom rendered content
        const titleDiv = document.createElement('div');
        titleDiv.className = 'shortcode-block-title shortcode-custom-render';
        titleDiv.innerHTML = customContent;
        header.appendChild(titleDiv);
    } else {
        // Use default title
        const titleSpan = document.createElement('span');
        titleSpan.className = 'shortcode-block-title';
        titleSpan.textContent = titleText;
        header.appendChild(titleSpan);
    }

    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'shortcode-block-controls';
    controls.innerHTML = `
        ${addChildButton}
        <button type="button" class="shortcode-edit-btn" title="Edit shortcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="shortcode-delete-btn" title="Delete shortcode">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
    `;
    header.appendChild(controls);

    // Check if this shortcode should have content
    const hasContent = config?.hasContent !== false; // Default to true if not specified

    // Create content container only if hasContent is true
    let contentDOM = null;
    if (hasContent) {
        contentDOM = document.createElement('div');
        contentDOM.className = 'shortcode-block-content';

        // Check if this is an alignment shortcode that needs special handling
        const alignmentShortcodes = ['center', 'left-align', 'right-align', 'justify'];
        const isAlignmentShortcode = alignmentShortcodes.includes(shortcodeName);

            // Apply custom CSS to content area if available
            if (config && config.cssTemplate && attributes) {
                try {
                    const registry = window.EditorPro?.pluginSystem?.shortcodeRegistry;
                    if (registry) {
                        registry.ensureInitialized();
                        const customCSS = registry.generateCSS(shortcodeName, attributes);
                        if (customCSS) {
                            contentDOM.setAttribute('style', customCSS);
                        }
                    }
                } catch (error) {
                    // Failed to apply custom CSS
                }
            }

            // Add click handling for all shortcode blocks to ensure they're focusable
            contentDOM.style.cursor = 'text';

            // Add click handler to focus the content
            contentDOM.addEventListener('click', (e) => {
                // If clicking on the container itself or placeholder text, focus inside
                if (e.target === contentDOM || e.target.classList?.contains('ProseMirror-placeholder')) {
                    const pos = typeof getPos === 'function' ? getPos() : getPos;
                    if (pos !== undefined) {
                        // Set cursor at the start of the content
                        editor.chain()
                            .focus()
                            .setTextSelection(pos + 1)
                            .run();
                    }
                }
            });

            // Auto-focus when created for alignment shortcodes
            if (isAlignmentShortcode) {
                setTimeout(() => {
                    const pos = typeof getPos === 'function' ? getPos() : getPos;
                    if (pos !== undefined && !contentDOM.hasChildNodes()) {
                        editor.chain()
                            .focus()
                            .setTextSelection(pos + 1)
                            .run();
                    }
                }, 100);
            }
    } // End of hasContent block

    // Add event handlers
    controls.querySelector('.shortcode-edit-btn').onclick = () => {
        try {
            // Edit shortcode parameters
            if (window.EditorPro && window.EditorPro.editShortcodeBlock) {
                const pos = typeof getPos === 'function' ? getPos() : getPos;
                if (pos !== undefined) {
                    window.EditorPro.editShortcodeBlock(pos, node, editor);
                } else {
                    // Unable to get shortcode position for editing
                }
            }
        } catch (error) {
            // Error editing shortcode
        }
    };

    controls.querySelector('.shortcode-delete-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get the position
        const pos = typeof getPos === 'function' ? getPos() : getPos;
        if (pos === undefined) return;

        // Use editor command chain for proper history management
        editor.chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run();
    };

    // Add child button handler if it exists
    const addChildBtn = controls.querySelector('.shortcode-add-child-btn');
    if (addChildBtn && canHaveChildren) {
        addChildBtn.onclick = () => {
            try {
                // Show child shortcode selection dialog
                if (window.EditorPro && window.EditorPro.addChildShortcodeBlock) {
                    const pos = typeof getPos === 'function' ? getPos() : getPos;
                    if (pos !== undefined) {
                        window.EditorPro.addChildShortcodeBlock(pos, node, editor, config.allowedChildren);
                    } else {
                        // Unable to get parent position for adding child
                        alert('Unable to add child shortcode. Please save and reload the page.');
                    }
                }
            } catch (error) {
                // Error adding child shortcode
                alert('An error occurred while adding the child shortcode.');
            }
        };
    }

    dom.appendChild(header);
    if (contentDOM) {
        dom.appendChild(contentDOM);
    }

    // Clean up empty nested shortcode blocks (only if we have content)
    let cleanupObserver = null;
    if (contentDOM) {
        cleanupObserver = new MutationObserver(() => {
            // Check for empty nested shortcode blocks
            const nestedEmptyBlocks = contentDOM.querySelectorAll('.shortcode-block:empty, .shortcode-block-wrapper:empty');
            nestedEmptyBlocks.forEach(block => {
                block.remove();
            });

            // Also check for shortcode blocks with only empty content
            const problematicBlocks = contentDOM.querySelectorAll('.shortcode-block');
            problematicBlocks.forEach(block => {
                const content = block.querySelector('.shortcode-content');
                if (content && !content.textContent.trim() && !content.querySelector('*')) {
                    block.remove();
                }
            });
        });

        cleanupObserver.observe(contentDOM, {
            childList: true,
            subtree: true
        });
    }

    return {
        dom,
        contentDOM,
        destroy() {
            if (cleanupObserver) {
                cleanupObserver.disconnect();
            }
        }
    };
}

export const ShortcodeBlock = Node.create({
    name: 'shortcodeBlock',
    group: 'block',
    content: '(paragraph | heading | blockquote | horizontalRule | orderedList | bulletList | codeBlock | table | shortcodeBlock | preservedBlock | rawBlock | githubAlert)*', // Explicitly allow nested shortcodeBlocks
    atom: false,
    isolating: true, // Prevent merging with adjacent blocks
    priority: 1001, // Higher priority than paragraph to prevent wrapping
    draggable: true, // Make all shortcode blocks draggable
    allowGapCursor: true, // Enable gap cursor for this node
    defining: true, // This node defines the structure of its content
    marks: '', // No marks allowed

    addAttributes() {
        return {
            shortcodeName: { default: null },
            params: { default: '' },
            attributes: { default: {} },
            placeholderId: { default: null },
            // New attributes for code-type shortcodes
            contentType: { default: 'blocks' }, // 'blocks' or 'code'
            codeContent: { default: null } // Raw code string for code-type shortcodes
        };
    },

    parseHTML() {
        return [{
            tag: 'div[data-shortcode-block]',
            getAttrs: (element) => {
                // Try to get params from base64 first, then fallback to regular params
                let params = '';
                const paramsBase64 = element.getAttribute('data-params-base64');
                if (paramsBase64) {
                    try {
                        params = decodeURIComponent(escape(atob(paramsBase64)));
                    } catch (e) {
                        params = element.getAttribute('data-params') || '';
                    }
                } else {
                    params = element.getAttribute('data-params') || '';
                }

                // Parse content type
                const contentType = element.getAttribute('data-content-type') || 'blocks';

                // Parse code content for code-type shortcodes
                let codeContent = null;
                if (contentType === 'code') {
                    const codeBase64 = element.getAttribute('data-code-content');
                    if (codeBase64) {
                        try {
                            codeContent = decodeURIComponent(escape(atob(codeBase64)));
                        } catch (e) {
                            codeContent = '';
                        }
                    }
                }

                const parsedAttrs = JSON.parse(element.getAttribute('data-attributes') || '{}');
                return {
                    shortcodeName: element.getAttribute('data-shortcode-name'),
                    params: params,
                    attributes: parsedAttrs,
                    placeholderId: element.getAttribute('data-placeholder-id'),
                    contentType: contentType,
                    codeContent: codeContent
                };
            }
        }];
    },

    renderHTML({ HTMLAttributes, node }) {
        const { shortcodeName, params, attributes, placeholderId, contentType, codeContent } = node.attrs;

        // Encode params as base64 to avoid escaping issues
        const encodedParams = params ? btoa(unescape(encodeURIComponent(params))) : '';

        const htmlAttrs = {
            'data-shortcode-block': 'true',
            'data-shortcode-name': shortcodeName,
            'data-params': params,
            'data-params-base64': encodedParams,
            'data-attributes': JSON.stringify(attributes),
            'data-placeholder-id': placeholderId,
            'data-content-type': contentType,
            'class': `shortcode-block ${shortcodeName}`
        };

        // For code-type shortcodes, store content as base64
        if (contentType === 'code' && codeContent !== null) {
            htmlAttrs['data-code-content'] = btoa(unescape(encodeURIComponent(codeContent)));
        }

        // Always include content hole (0) for schema consistency
        // The NodeView will handle rendering differently for code-type vs block-type
        return ['div', htmlAttrs, 0];
    },

    addNodeView() {
        return ({ node, HTMLAttributes, getPos, editor }) => {
            const { shortcodeName } = node.attrs;

            // Get shortcode config from registry
            const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(shortcodeName);

            // Determine if this is a code-type shortcode
            const isCodeShortcode = node.attrs.contentType === 'code' || config?.contentType === 'code';

            if (isCodeShortcode) {
                return createCodeShortcodeView({ node, HTMLAttributes, getPos, editor, config });
            } else {
                return createBlockShortcodeView({ node, HTMLAttributes, getPos, editor, config });
            }
        };
    },

    addCommands() {
        return {
            setShortcodeBlock: (attributes) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: attributes,
                })
            },

            insertShortcodeBlock: (shortcodeName, params = '', attributes = {}, content = '', placeholderId = null) => ({ commands, state, tr }) => {
                // Check if this is a code-type shortcode
                const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(shortcodeName);
                const isCodeType = config?.contentType === 'code';

                const nodeAttrs = {
                    shortcodeName,
                    params,
                    attributes,
                    placeholderId: placeholderId || `shortcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    contentType: isCodeType ? 'code' : 'blocks',
                    codeContent: isCodeType ? (content || config?.defaultContent || '') : null
                };

                // For code-type shortcodes, don't create nested content
                if (isCodeType) {
                    return commands.insertContent({
                        type: this.name,
                        attrs: nodeAttrs
                    });
                }

                // Create content - if no content provided, create an empty paragraph
                let nodeContent = [];
                if (content) {
                    nodeContent = [{ type: 'paragraph', content: [{ type: 'text', text: content }] }];
                } else {
                    // Create empty paragraph for new blocks
                    nodeContent = [{ type: 'paragraph' }];
                }

                // Insert the content and ensure proper transaction handling
                return commands.insertContent({
                    type: this.name,
                    attrs: nodeAttrs,
                    content: nodeContent
                });
            },

            insertChildShortcodeBlock: (parentPos, childShortcodeName, attributes = {}) => ({ state, tr, dispatch }) => {
                const parentNode = state.doc.nodeAt(parentPos);
                if (!parentNode || parentNode.type.name !== 'shortcodeBlock') {
                    return false;
                }

                // Check if child is a code-type shortcode
                const config = window.EditorPro?.pluginSystem?.shortcodeRegistry?.get(childShortcodeName);
                const isCodeType = config?.contentType === 'code';

                // Create the child node
                const childAttrs = {
                    shortcodeName: childShortcodeName,
                    params: '',
                    attributes,
                    placeholderId: `shortcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    contentType: isCodeType ? 'code' : 'blocks',
                    codeContent: isCodeType ? (config?.defaultContent || '') : null
                };

                const childNode = isCodeType
                    ? state.schema.nodes.shortcodeBlock.create(childAttrs)
                    : state.schema.nodes.shortcodeBlock.create(childAttrs, state.schema.nodes.paragraph.create());

                // Find insertion position - after the last child shortcode
                let insertPos = parentPos + 1;
                if (parentNode.content.size === 0) {
                    // Parent is empty, insert at the beginning
                    insertPos = parentPos + 1;
                } else {
                    // Find the last child shortcode position
                    let lastChildPos = parentPos + 1;
                    parentNode.content.forEach((child, offset) => {
                        if (child.type.name === 'shortcodeBlock') {
                            lastChildPos = parentPos + 1 + offset + child.nodeSize;
                        }
                    });
                    insertPos = lastChildPos;
                }

                // Insert the child node
                tr.insert(insertPos, childNode);

                if (dispatch) {
                    dispatch(tr);
                }

                return true;
            }
        }
    }
})

export default ShortcodeBlock
