// Markdown Shortcuts Extension for TipTap
// Adds markdown input rules for links and images

import { Extension, markInputRule, InputRule } from '@tiptap/core'

export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',

  addOptions() {
    return {
      enabled: true
    }
  },

  addInputRules() {
    if (!this.options.enabled) {
      return []
    }

    return [
      // Markdown image: ![alt](url) - MUST come before link rule
      new InputRule({
        // Support optional title: ![alt](src "title"); allow spaces in URL
        find: /!\[([^\]]*)\]\(([^)]+?)\)$/,
        handler: ({ state, range, match }) => {
          // When spaces are allowed, `match[2]` may contain `url` OR `url "title"`
          const [fullMatch, alt, srcOrInner] = match
          let src = srcOrInner
          let title = ''
          const titleMatch = srcOrInner.match(/^(.*?)(?:\s+"([^"]*)")\s*$/)
          if (titleMatch) {
            src = titleMatch[1]
            title = titleMatch[2] || ''
          }
          const { tr } = state
          
          if (fullMatch) {
            // Delete the markdown syntax
            tr.delete(range.from, range.to)
            
            // Insert the image node with data-src for Grav processing
            const attrs = {
              src,
              alt: alt || '',
              'data-src': src
            }
            if (title) attrs.title = title
            const node = state.schema.nodes.image.create(attrs)
            
            tr.insert(range.from, node)
            
            // Add a space after the image for continued typing
            const space = state.schema.text(' ')
            tr.insert(range.from + node.nodeSize, space)
            
            // Trigger Grav image resolution after the transaction is applied
            setTimeout(() => {
              if (window.EditorPro && window.EditorPro.activeEditor) {
                const editor = window.EditorPro.activeEditor
                
                // Find the image we just inserted
                const doc = editor.editor.state.doc
                const pos = range.from
                const nodeAtPos = doc.nodeAt(pos)
                
                if (nodeAtPos && nodeAtPos.type.name === 'image') {
                  // Resolve the image path using Grav's logic
                  // Only resolve the actual src (exclude title)
                  editor.resolveGravImagePath(src).then(resolvedSrc => {
                    if (resolvedSrc && resolvedSrc !== src) {
                      // Update the image with the resolved path
                      const transaction = editor.editor.state.tr.setNodeMarkup(
                        pos, 
                        null, 
                        {
                          ...nodeAtPos.attrs,
                          src: resolvedSrc
                        }
                      )
                      editor.editor.view.dispatch(transaction)
                    }
                  }).catch(err => {
                    // Image path resolution failed
                  })
                }
              }
            }, 0)
          }
          
          return tr
        },
      }),
      
      // Markdown link: [text](url) - but not if preceded by !
      new InputRule({
        // Allow spaces in URL; optional title supported during mark creation is not needed
        find: /(?<!\!)\[([^\]]+)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const [fullMatch, text, url] = match
          const { tr } = state
          
          if (fullMatch) {
            // Delete the markdown syntax
            tr.delete(range.from, range.to)
            
            // Insert the text with link mark
            const linkMark = state.schema.marks.link.create({ href: url })
            const textNode = state.schema.text(text, [linkMark])
            
            tr.insert(range.from, textNode)
          }
          
          return tr
        },
      }),
    ]
  },
})

export default MarkdownShortcuts
