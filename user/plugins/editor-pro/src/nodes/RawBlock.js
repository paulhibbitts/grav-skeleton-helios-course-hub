// RawBlock Node - TipTap node with CodeMirror integration for HTML/Twig editing
import { Node } from '@tiptap/core'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

export const RawBlock = Node.create({
  name: 'rawBlock',
  
  group: 'block',
  
  content: '',
  
  atom: true,
  
  addAttributes() {
    return {
      content: {
        default: '',
      },
      language: {
        default: 'html', // 'html' or 'twig'
      },
      blockId: {
        default: null,
      }
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-raw-block]',
        getAttrs: (element) => {
          let content = '';
          
          // Try base64 first (new format)
          const base64Content = element.getAttribute('data-content-base64');
          if (base64Content) {
            try {
              content = decodeURIComponent(escape(atob(base64Content)));
            } catch (e) {
              // Base64 decode failed, falling back to data-content
              content = element.getAttribute('data-content') || '';
            }
          } else {
            // Fallback to old format
            content = element.getAttribute('data-content') || '';
          }
          
          return {
            content: content,
            language: element.getAttribute('data-language') || 'html',
            blockId: element.getAttribute('data-block-id') || null
          };
        }
      }
    ]
  },
  
  renderHTML({ HTMLAttributes, node }) {
    // Encode content as base64 to avoid quote issues
    const encodedContent = btoa(unescape(encodeURIComponent(node.attrs.content || '')));
    
    return ['div', {
      'data-raw-block': 'true',
      'data-content-base64': encodedContent,
      'data-language': node.attrs.language,
      'data-block-id': node.attrs.blockId,
      'class': `raw-block raw-block-${node.attrs.language}`
    }]
  },
  
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      let codeMirrorView = null
      let updating = false

      // Create container
      const container = document.createElement('div')
      container.className = `raw-block-container raw-block-${node.attrs.language}`
      
      // Create header
      const header = document.createElement('div')
      header.className = 'raw-block-header'
      header.innerHTML = `
        <span class="raw-block-title">
          <span class="raw-block-icon">&lt;/&gt;</span>
          Raw Block
        </span>
        <div class="raw-block-controls">
          <button type="button" class="raw-block-delete-btn" title="Delete Raw Block">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `
      
      // Create editor container
      const editorContainer = document.createElement('div')
      editorContainer.className = 'raw-block-editor'
      
      // Set up CodeMirror extensions based on language
      const getLanguageExtension = (lang) => {
        switch (lang) {
          case 'twig':
            // Use JavaScript highlighting for Twig (closest match)
            return javascript()
          case 'html':
          default:
            return html()
        }
      }
      
      // Create CodeMirror editor
      const createCodeMirror = () => {
        const extensions = [
          getLanguageExtension(node.attrs.language),
          oneDark,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (updating) return
            
            if (update.docChanged) {
              const newContent = update.state.doc.toString()
              
              // Update the TipTap node
              if (typeof getPos === 'function') {
                const pos = getPos()
                if (pos !== undefined) {
                  updating = true
                  const tr = editor.state.tr
                  tr.setNodeMarkup(pos, null, {
                    ...node.attrs,
                    content: newContent
                  })
                  editor.view.dispatch(tr)
                  updating = false
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
              minHeight: '53px'
            },
            '.cm-focused': {
              outline: 'none'
            },
            '.cm-editor': {
              borderRadius: '0 0 8px 8px'
            }
          }),
          // Ensure CodeMirror handles keyboard events properly
          EditorView.domEventHandlers({
            keydown: (event, view) => {
              // Stop propagation to prevent TipTap interference
              event.stopPropagation()
              
              // Handle Tab key
              if (event.key === 'Tab') {
                event.preventDefault()
                view.dispatch(view.state.replaceSelection('  ')) // Insert 2 spaces
                return true
              }
              
              // Let CodeMirror handle all other keys naturally
              // This includes Cmd/Ctrl+C, Cmd/Ctrl+V, etc.
              return false
            }
          })
        ]
        
        // Content should already be properly decoded from base64 in parseHTML
        let content = node.attrs.content || ''
        
        // If we have access to the editor's content preserver, restore any nested placeholders
        if (window.EditorPro && window.EditorPro.activeEditor && window.EditorPro.activeEditor.preserver) {
          const preserver = window.EditorPro.activeEditor.preserver;
          const preservedBlocks = window.EditorPro.activeEditor.preservedBlocks;
          if (preservedBlocks) {
            content = preserver.restoreContent(content, preservedBlocks);
          }
        }
        
        const state = EditorState.create({
          doc: content,
          extensions
        })
        
        const view = new EditorView({
          state,
          parent: editorContainer
        })
        
        // Ensure the editor can receive focus properly
        editorContainer.addEventListener('click', () => {
          view.focus()
        })
        
        return view
      }
      
      // Initialize CodeMirror
      codeMirrorView = createCodeMirror()
      
      // Handle delete button
      header.querySelector('.raw-block-delete-btn').addEventListener('click', () => {
        if (typeof getPos === 'function') {
          const pos = getPos()
          if (pos !== undefined) {
            const tr = editor.state.tr
            tr.delete(pos, pos + node.nodeSize)
            editor.view.dispatch(tr)
          }
        }
      })
      
      // Update CodeMirror when node content changes
      const updateCodeMirror = (newAttrs) => {
        if (updating) return
        
        let newContent = newAttrs.content || ''
        
        // Restore any nested placeholders
        if (window.EditorPro && window.EditorPro.activeEditor && window.EditorPro.activeEditor.preserver) {
          const preserver = window.EditorPro.activeEditor.preserver;
          const preservedBlocks = window.EditorPro.activeEditor.preservedBlocks;
          if (preservedBlocks) {
            newContent = preserver.restoreContent(newContent, preservedBlocks);
          }
        }
        
        if (newContent !== codeMirrorView.state.doc.toString()) {
          updating = true
          const transaction = codeMirrorView.state.update({
            changes: {
              from: 0,
              to: codeMirrorView.state.doc.length,
              insert: newContent
            }
          })
          codeMirrorView.dispatch(transaction)
          updating = false
        }
      }
      
      // Assemble the DOM
      container.appendChild(header)
      container.appendChild(editorContainer)
      
      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false
          
          // Update our reference
          node = updatedNode
          updateCodeMirror(node.attrs)
          
          return true
        },
        destroy: () => {
          if (codeMirrorView) {
            codeMirrorView.destroy()
          }
        },
        stopEvent: (event) => {
          // Let CodeMirror handle all events within the editor container
          const isInCodeMirror = editorContainer.contains(event.target)
          
          if (isInCodeMirror) {
            // Always let CodeMirror handle keyboard events
            if (event.type === 'keydown' || event.type === 'keyup' || event.type === 'keypress') {
              return true
            }
            // Also handle mouse events, focus, etc.
            return true
          }
          
          return false
        },
        ignoreMutation: (mutation) => {
          // Ignore mutations within the CodeMirror editor
          return editorContainer.contains(mutation.target)
        }
      }
    }
  },
  
  addCommands() {
    return {
      setRawBlock: (attributes) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
        })
      },
      
      insertRawBlock: (content = '', language = 'html', blockId = null) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            content,
            language,
            blockId: blockId || `raw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          },
        })
      }
    }
  }
})

export default RawBlock