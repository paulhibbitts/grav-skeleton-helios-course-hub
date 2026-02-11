// GitHubAlert Node - TipTap node for GitHub-style markdown alerts
import { Node } from '@tiptap/core'

export const GitHubAlert = Node.create({
  name: 'githubAlert',
  
  group: 'block',
  
  content: 'block*',
  
  defining: true,
  
  isolating: true, // Prevent merging with adjacent blocks
  
  priority: 1001, // Higher priority than paragraph to prevent wrapping
  
  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: element => element.getAttribute('data-alert-type'),
        renderHTML: attributes => ({
          'data-alert-type': attributes.type,
        }),
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-github-alert]',
        getAttrs: (element) => ({
          type: element.getAttribute('data-alert-type') || 'note',
        }),
      },
      // Parse from markdown-style blockquotes
      {
        tag: 'blockquote',
        getAttrs: (element) => {
          const firstChild = element.firstElementChild
          if (firstChild && firstChild.tagName === 'P') {
            const text = firstChild.textContent || ''
            const alertMatch = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/)
            if (alertMatch) {
              return {
                type: alertMatch[1].toLowerCase(),
              }
            }
          }
          return false
        },
      },
    ]
  },
  
  renderHTML({ HTMLAttributes, node }) {
    const alertType = node.attrs.type || 'note'
    
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-github-alert': 'true',
        'data-alert-type': alertType,
        class: `markdown-alert markdown-alert-${alertType}`,
      },
      ['div', { class: 'markdown-alert-content' }, 0], // Wrap content in markdown-alert-content div
    ]
  },
  
  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const alertType = node.attrs.type || 'note'
      
      // Helper functions for alert configuration
      const getAlertTitle = (type) => {
        const titles = {
          note: 'Note',
          tip: 'Tip',
          important: 'Important',
          warning: 'Warning',
          caution: 'Caution',
        }
        return titles[type] || 'Note'
      }
      
      const getAlertIconHTML = (type) => {
        // Embed exact SVG content from working plugin files
        const svgContent = {
          note: '<svg class="octicon octicon-info" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" style="fill: currentColor;"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
          tip: '<svg class="octicon octicon-light-bulb" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" style="fill: currentColor;"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
          important: '<svg class="octicon octicon-report" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" style="fill: currentColor;"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
          warning: '<svg class="octicon octicon-alert" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" style="fill: currentColor;"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
          caution: '<svg class="octicon octicon-stop" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" style="fill: currentColor;"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>'
        }
        
        return svgContent[type] || svgContent.note
      }
      
      // Create container
      const container = document.createElement('div')
      container.className = `markdown-alert markdown-alert-${alertType}`
      container.setAttribute('data-github-alert', 'true')
      container.setAttribute('data-alert-type', alertType)
      
      // Create title section
      const titleDiv = document.createElement('div')
      titleDiv.className = 'markdown-alert-title'
      
      // Create icon span and insert SVG directly using innerHTML
      const iconSpan = document.createElement('span')
      iconSpan.className = 'markdown-alert-icon'
      iconSpan.innerHTML = getAlertIconHTML(alertType)
      
      // Add title text
      const titleText = document.createTextNode(getAlertTitle(alertType))
      
      titleDiv.appendChild(iconSpan)
      titleDiv.appendChild(titleText)
      
      // Add delete button
      const deleteButton = document.createElement('button')
      deleteButton.className = 'markdown-alert-delete'
      deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      deleteButton.title = 'Delete alert'
      deleteButton.contentEditable = false
      deleteButton.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        const pos = getPos()
        if (typeof pos === 'number') {
          const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
          editor.view.dispatch(tr)
        }
      }
      
      titleDiv.appendChild(deleteButton)
      
      // Create content container
      const contentDiv = document.createElement('div')
      contentDiv.className = 'markdown-alert-content'
      
      // Assemble the DOM
      container.appendChild(titleDiv)
      container.appendChild(contentDiv)
      
      return {
        dom: container,
        contentDOM: contentDiv,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false
          
          // Update the alert type if it changed
          if (updatedNode.attrs.type !== node.attrs.type) {
            const newType = updatedNode.attrs.type || 'note'
            container.className = `markdown-alert markdown-alert-${newType}`
            container.setAttribute('data-alert-type', newType)
            iconSpan.innerHTML = getAlertIconHTML(newType)
            titleText.textContent = getAlertTitle(newType)
          }
          
          node = updatedNode
          return true
        }
      }
    }
  },
  
  addCommands() {
    return {
      setGitHubAlert: (attributes) => ({ commands }) => {
        return commands.wrapIn(this.name, attributes)
      },
      
      toggleGitHubAlert: (attributes) => ({ commands }) => {
        return commands.toggleWrap(this.name, attributes)
      },
      
      insertGitHubAlert: (type = 'note', content = '') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { type },
          content: content ? [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: content }],
            },
          ] : [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Alert content here...' }],
            },
          ],
        })
      },
    }
  },
  
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-!': () => this.editor.commands.insertGitHubAlert('note'),
    }
  },
})

export default GitHubAlert