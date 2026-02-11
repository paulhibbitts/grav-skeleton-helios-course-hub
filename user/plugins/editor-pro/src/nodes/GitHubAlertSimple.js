// Simplified GitHubAlert Node without external dependencies
import { Node } from '@tiptap/core'

export const GitHubAlertSimple = Node.create({
  name: 'githubAlert',
  
  group: 'block',
  
  content: 'block+',
  
  defining: true,
  
  isolating: true,
  
  priority: 1001,
  
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
    ]
  },
  
  renderHTML({ HTMLAttributes, node }) {
    const alertType = node.attrs.type || 'note'
    
    // Helper functions
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
    
    const getAlertEmoji = (type) => {
      const emojis = {
        note: '📝',
        tip: '💡',
        important: '❗',
        warning: '⚠️',
        caution: '🚨',
      }
      return emojis[type] || '📝'
    }
    
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-github-alert': 'true',
        'data-alert-type': alertType,
        class: `markdown-alert markdown-alert-${alertType}`,
      },
      [
        'div',
        { class: 'markdown-alert-title' },
        [
          'span',
          { class: 'markdown-alert-icon' },
          getAlertEmoji(alertType),
        ],
        ' ',
        getAlertTitle(alertType),
      ],
      [
        'div',
        { class: 'markdown-alert-content' },
        0, // Content goes here
      ],
    ]
  },
  
  addCommands() {
    return {
      setGitHubAlert: (attributes) => ({ commands }) => {
        return commands.wrapIn(this.name, attributes)
      },
      
      toggleGitHubAlert: (attributes) => ({ commands }) => {
        return commands.toggleWrap(this.name, attributes)
      },
    }
  },
})

export default GitHubAlertSimple