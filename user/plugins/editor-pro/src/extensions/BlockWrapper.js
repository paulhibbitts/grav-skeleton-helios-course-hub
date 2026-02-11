// BlockWrapper Extension - Prevents unwanted paragraph wrapping around custom blocks
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const BlockWrapper = Extension.create({
  name: 'blockWrapper',
  
  priority: 1002, // Higher than any other extension
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockWrapper'),
        
        // Transform transactions to prevent paragraph wrapping
        appendTransaction(transactions, oldState, newState) {
          let modified = false
          const tr = newState.tr
          
          // Check for custom blocks that shouldn't be wrapped
          newState.doc.descendants((node, pos) => {
            // If we find a paragraph that contains only a custom block, unwrap it
            if (node.type.name === 'paragraph' && node.childCount === 1) {
              const child = node.child(0)
              const customBlocks = ['shortcodeBlock', 'githubAlert', 'rawBlock', 'preservedBlock']
              
              if (child && child.type.name && customBlocks.includes(child.type.name)) {
                // Replace the paragraph with just the block
                tr.replaceRangeWith(pos, pos + node.nodeSize, child)
                modified = true
                return false // Stop traversing this branch
              }
            }
            
            // Check if custom blocks are direct children of the document
            if (node.type.name === 'doc') {
              let offset = 0
              node.forEach((child, childOffset) => {
                const customBlocks = ['shortcodeBlock', 'githubAlert', 'rawBlock', 'preservedBlock']
                
                // If a custom block is wrapped in a paragraph at the doc level, unwrap it
                if (child.type.name === 'paragraph' && child.childCount === 1) {
                  const grandchild = child.child(0)
                  if (grandchild && customBlocks.includes(grandchild.type.name)) {
                    tr.replaceRangeWith(
                      pos + offset + 1,
                      pos + offset + 1 + child.nodeSize,
                      grandchild
                    )
                    modified = true
                  }
                }
                offset += child.nodeSize
              })
            }
          })
          
          return modified ? tr : null
        },
        
        // Filter transactions to prevent wrapping during input
        filterTransaction(transaction, state) {
          let prevented = false
          
          transaction.steps.forEach(step => {
            // Check if this step would wrap a custom block in a paragraph
            const stepJSON = step.toJSON()
            if (stepJSON.stepType === 'replace' && stepJSON.slice) {
              // Analyze what's being inserted
              const { content } = stepJSON.slice
              if (content && content.content) {
                content.content.forEach(node => {
                  if (node.type === 'paragraph' && node.content && node.content.length === 1) {
                    const child = node.content[0]
                    const customBlocks = ['shortcodeBlock', 'githubAlert', 'rawBlock', 'preservedBlock']
                    if (child && child.type && customBlocks.includes(child.type)) {
                      prevented = true
                    }
                  }
                })
              }
            }
          })
          
          return !prevented
        }
      })
    ]
  }
})

export default BlockWrapper