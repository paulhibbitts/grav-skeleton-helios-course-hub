// RawMarkdownMode - Lazy-loaded module for raw markdown editing
// This module is only loaded when the user toggles to markdown mode

import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// Firefox DevTools Light theme syntax highlighting
// Based on: https://firefox-source-docs.mozilla.org/devtools-user/devtoolscolors/
const lightHighlightStyle = HighlightStyle.define([
    // Headings - blue like keywords
    { tag: tags.heading1, color: '#0088cc', fontWeight: 'bold', fontSize: '1.4em' },
    { tag: tags.heading2, color: '#0088cc', fontWeight: 'bold', fontSize: '1.3em' },
    { tag: tags.heading3, color: '#0088cc', fontWeight: 'bold', fontSize: '1.2em' },
    { tag: tags.heading4, color: '#0088cc', fontWeight: 'bold', fontSize: '1.1em' },
    { tag: tags.heading5, color: '#0088cc', fontWeight: 'bold' },
    { tag: tags.heading6, color: '#0088cc', fontWeight: 'bold' },
    // Emphasis
    { tag: tags.strong, fontWeight: 'bold', color: '#18191a' },
    { tag: tags.emphasis, fontStyle: 'italic', color: '#18191a' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: '#747573' },
    // Links - purple
    { tag: tags.link, color: '#5b5fff' },
    { tag: tags.url, color: '#5b5fff' },
    // Code - pink/magenta
    { tag: tags.monospace, color: '#b82ee5' },
    // Quotes - gray comments style
    { tag: tags.quote, color: '#747573', fontStyle: 'italic' },
    // Lists - green like functions
    { tag: tags.list, color: '#2cbb0f' },
    // Separators
    { tag: tags.contentSeparator, color: '#747573' },
    // Code block markers - orange
    { tag: tags.processingInstruction, color: '#d97e00' },
    // Comments
    { tag: tags.comment, color: '#747573' },
    // Meta/frontmatter - blue-grey
    { tag: tags.meta, color: '#0072ab' },
])

// One Dark theme syntax highlighting (custom, not using oneDark from codemirror)
// Based on: https://github.com/atom/one-dark-syntax
const darkHighlightStyle = HighlightStyle.define([
    // Headings - blue
    { tag: tags.heading1, color: '#61afef', fontWeight: 'bold', fontSize: '1.4em' },
    { tag: tags.heading2, color: '#61afef', fontWeight: 'bold', fontSize: '1.3em' },
    { tag: tags.heading3, color: '#61afef', fontWeight: 'bold', fontSize: '1.2em' },
    { tag: tags.heading4, color: '#61afef', fontWeight: 'bold', fontSize: '1.1em' },
    { tag: tags.heading5, color: '#61afef', fontWeight: 'bold' },
    { tag: tags.heading6, color: '#61afef', fontWeight: 'bold' },
    // Emphasis - red for bold, italic stays light
    { tag: tags.strong, fontWeight: 'bold', color: '#e06c75' },
    { tag: tags.emphasis, fontStyle: 'italic', color: '#abb2bf' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: '#5c6370' },
    // Links - cyan
    { tag: tags.link, color: '#56b6c2' },
    { tag: tags.url, color: '#56b6c2' },
    // Code - green
    { tag: tags.monospace, color: '#98c379' },
    // Quotes - slightly lighter than body text (#abb2bf)
    { tag: tags.quote, color: '#bcc3cf', fontStyle: 'italic' },
    // Lists - purple
    { tag: tags.list, color: '#c678dd' },
    // Separators
    { tag: tags.contentSeparator, color: '#5c6370' },
    // Code block markers - orange
    { tag: tags.processingInstruction, color: '#d19a66' },
    // Comments - gray
    { tag: tags.comment, color: '#5c6370' },
    // Meta/frontmatter - yellow
    { tag: tags.meta, color: '#e5c07b' },
])

// Dark theme base colors (One Dark background)
const darkTheme = EditorView.theme({
    '&': {
        backgroundColor: '#282c34',
        color: '#abb2bf'
    },
    '.cm-content': {
        caretColor: '#528bff'
    },
    '.cm-cursor': {
        borderLeftColor: '#528bff'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: '#3e4451'
    },
    '.cm-activeLine': {
        backgroundColor: '#2c313a'
    },
    '.cm-gutters': {
        backgroundColor: '#282c34',
        color: '#5c6370',
        border: 'none'
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#2c313a'
    }
}, { dark: true })

export class RawMarkdownMode {
    constructor(editorPro) {
        this.editorPro = editorPro
        this.overlay = null
        this.codeMirrorView = null
        this.currentMarkdown = ''
        this.isDirty = false
    }

    async enter() {
        // Get current markdown from the WYSIWYG editor
        const rawMarkdown = this.editorPro.editorToMarkdown()
        this.currentMarkdown = this.editorPro.preserver.restoreContent(
            rawMarkdown,
            this.editorPro.preservedBlocks
        )

        // Create overlay
        this.overlay = document.createElement('div')
        this.overlay.className = 'raw-markdown-overlay'

        // Check if dark theme is active
        const isDarkTheme = document.documentElement.classList.contains('dark-theme') ||
                           document.body.classList.contains('dark-theme') ||
                           this.editorPro.container?.closest('.editor-pro-wrapper')?.classList.contains('theme-dark')

        if (isDarkTheme) {
            this.overlay.classList.add('theme-dark')
        }

        // Create header
        const header = document.createElement('div')
        header.className = 'raw-markdown-header'
        header.innerHTML = `
            <div class="raw-markdown-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7V4h16v3"/>
                    <path d="M9 20h6"/>
                    <path d="M12 4v16"/>
                </svg>
                <span>Markdown Mode</span>
            </div>
            <div class="raw-markdown-actions">
                <button type="button" class="raw-markdown-btn raw-markdown-btn-cancel">Cancel</button>
                <button type="button" class="raw-markdown-btn raw-markdown-btn-apply">Apply Changes</button>
            </div>
        `

        // Create editor container
        const editorContainer = document.createElement('div')
        editorContainer.className = 'raw-markdown-editor'

        // Create validation error container (hidden by default)
        const validationError = document.createElement('div')
        validationError.className = 'raw-markdown-validation-error'
        validationError.style.display = 'none'

        this.overlay.appendChild(header)
        this.overlay.appendChild(validationError)
        this.overlay.appendChild(editorContainer)
        document.body.appendChild(this.overlay)

        // Initialize CodeMirror
        const extensions = [
            markdown(),
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    this.isDirty = true
                }
            }),
            EditorView.theme({
                '&': {
                    height: '100%',
                    fontSize: '14px',
                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
                },
                '.cm-content': {
                    padding: '20px',
                    caretColor: isDarkTheme ? '#fff' : '#000'
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-scroller': {
                    overflow: 'auto'
                }
            }),
            EditorView.domEventHandlers({
                keydown: (event, view) => {
                    // Handle Escape to cancel
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        this.cancel()
                        return true
                    }
                    // Handle Cmd/Ctrl+S to apply
                    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                        event.preventDefault()
                        this.exit()
                        return true
                    }
                    return false
                }
            })
        ]

        // Add theme-specific syntax highlighting
        if (isDarkTheme) {
            extensions.push(darkTheme)
            extensions.push(syntaxHighlighting(darkHighlightStyle))
        } else {
            extensions.push(syntaxHighlighting(lightHighlightStyle))
        }

        const state = EditorState.create({
            doc: this.currentMarkdown,
            extensions
        })

        this.codeMirrorView = new EditorView({
            state,
            parent: editorContainer
        })

        // Focus the editor
        this.codeMirrorView.focus()

        // Hide the WYSIWYG editor wrapper
        const wrapper = this.editorPro.textarea.closest('.editor-pro-wrapper')
        if (wrapper) {
            wrapper.style.display = 'none'
        }

        // Setup event listeners
        header.querySelector('.raw-markdown-btn-cancel').onclick = () => this.cancel()
        header.querySelector('.raw-markdown-btn-apply').onclick = () => this.exit()

        this.isDirty = false
    }

    validateMarkdown(markdownContent) {
        try {
            // Use existing preservation system to validate
            const { processed, blocks } = this.editorPro.preserver.preserveContent(markdownContent)

            // Try to convert to HTML
            const html = this.editorPro.basicMarkdownToHtml(processed)

            // Basic validation
            if (html === null || html === undefined) {
                return { valid: false, error: 'Failed to parse markdown content' }
            }

            return { valid: true, html, blocks, processed }
        } catch (error) {
            return { valid: false, error: error.message }
        }
    }

    showValidationError(message) {
        const errorDiv = this.overlay.querySelector('.raw-markdown-validation-error')
        if (errorDiv) {
            errorDiv.textContent = `Warning: ${message}`
            errorDiv.style.display = 'block'

            // Auto-hide after 5 seconds
            setTimeout(() => {
                errorDiv.style.display = 'none'
            }, 5000)
        }
    }

    cancel() {
        if (this.isDirty) {
            const confirmed = confirm('You have unsaved changes. Are you sure you want to cancel?')
            if (!confirmed) {
                return false
            }
        }

        this.destroy()

        // Show the WYSIWYG editor wrapper
        const wrapper = this.editorPro.textarea.closest('.editor-pro-wrapper')
        if (wrapper) {
            wrapper.style.display = 'block'
        }

        // Update button state
        this.editorPro.isMarkdownMode = false
        const button = this.editorPro.toolbar?.querySelector('[data-toolbar-item="markdown-toggle"]')
        if (button) {
            button.classList.remove('is-active')
        }

        return true
    }

    async exit() {
        const newMarkdown = this.codeMirrorView.state.doc.toString()

        // Helper to finalize exit and update state
        const finalizeExit = () => {
            this.destroy()

            const wrapper = this.editorPro.textarea.closest('.editor-pro-wrapper')
            if (wrapper) {
                wrapper.style.display = 'block'
            }

            // Update parent state
            this.editorPro.isMarkdownMode = false
            const button = this.editorPro.toolbar?.querySelector('[data-toolbar-item="markdown-toggle"]')
            if (button) {
                button.classList.remove('is-active')
            }
        }

        // Check if content actually changed
        if (newMarkdown === this.currentMarkdown) {
            // No changes, just close
            finalizeExit()
            return true
        }

        // Validate the markdown
        const validation = this.validateMarkdown(newMarkdown)

        if (!validation.valid) {
            this.showValidationError(validation.error)

            // Ask user if they want to apply anyway
            const forceApply = confirm(
                `There may be an issue with the markdown:\n\n${validation.error}\n\nDo you want to apply the changes anyway?`
            )

            if (!forceApply) {
                return false
            }
        }

        // Apply the changes to the WYSIWYG editor
        try {
            // Preprocess markdown to ensure blockquote line breaks are preserved
            // Add trailing spaces to blockquote lines that are followed by another blockquote line
            const preprocessedMarkdown = this.preprocessBlockquotes(newMarkdown)

            // Re-process the markdown through the preservation system
            const { processed, blocks } = this.editorPro.preserver.preserveContent(preprocessedMarkdown)

            // IMPORTANT: Update preserved blocks BEFORE converting to HTML
            // basicMarkdownToHtml references this.preservedBlocks internally
            this.editorPro.preservedBlocks = blocks

            // Convert to HTML (this uses preservedBlocks)
            const html = this.editorPro.basicMarkdownToHtml(processed)

            // Update the TipTap editor
            this.editorPro.editor.commands.setContent(html)

            // Sync with textarea
            this.editorPro.updateTextarea()

            // Cleanup, show WYSIWYG, and update state
            finalizeExit()

            // Focus the editor
            this.editorPro.editor.commands.focus()

            return true
        } catch (error) {
            console.error('Error applying markdown changes:', error)
            this.showValidationError(`Failed to apply changes: ${error.message}. You can try editing the markdown or click Cancel to discard changes.`)
            return false
        }
    }

    preprocessBlockquotes(markdown) {
        // Add trailing spaces to blockquote lines to preserve line breaks
        // This ensures that consecutive > lines are treated as separate lines, not merged
        const lines = markdown.split('\n')
        const result = []

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            const nextLine = lines[i + 1]

            // Check if this is a blockquote line (starts with >)
            if (/^>\s*/.test(line)) {
                // Check if the next line is also a blockquote line
                if (nextLine && /^>\s*/.test(nextLine)) {
                    // Add trailing spaces if not already present
                    if (!line.endsWith('  ')) {
                        line = line + '  '
                    }
                }
            }

            result.push(line)
        }

        return result.join('\n')
    }

    destroy() {
        if (this.codeMirrorView) {
            this.codeMirrorView.destroy()
            this.codeMirrorView = null
        }
        if (this.overlay) {
            this.overlay.remove()
            this.overlay = null
        }
        this.isDirty = false
    }
}

export default RawMarkdownMode
