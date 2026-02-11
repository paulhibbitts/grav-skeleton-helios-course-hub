// ExtraTypography Extension for TipTap
// Adds custom text replacements beyond what's included in TipTap's Typography extension

import { Extension } from '@tiptap/core'
import { textInputRule } from '@tiptap/core'

export const ExtraTypography = Extension.create({
  name: 'extraTypography',

  addOptions() {
    return {
      transforms: [],
      enabled: true
    }
  },

  addInputRules() {
    // Check if extension is enabled
    if (!this.options.enabled) {
      return []
    }
    
    const transforms = this.options.transforms
    
    if (!transforms || transforms.length === 0) {
      return []
    }

    // Only use transforms that are enabled in the config
    return transforms
      .filter(transform => transform.enabled !== false)
      .map(transform => {
        // Escape special regex characters in the pattern
        const escapedPattern = transform.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        
        // Special handling for :/ to prevent it from matching in URLs like https://
        if (transform.pattern === ':/') {
          // For :/ specifically, make sure it's not preceded by letters (like in https:/)
          const regex = new RegExp(`(?<!\\w)${escapedPattern}$`)
          
          return textInputRule({
            find: regex,
            replace: transform.replacement
          })
        } else {
          // For all other patterns, use the original simple replacement
          const regex = new RegExp(`${escapedPattern}$`)
          
          return textInputRule({
            find: regex,
            replace: transform.replacement
          })
        }
      })
  }
})

export default ExtraTypography