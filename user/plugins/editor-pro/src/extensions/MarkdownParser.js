// Enhanced Markdown Parser with GitHub Alerts support
export class MarkdownParser {
  constructor(editor) {
    this.editor = editor
  }

  // Parse GitHub alerts from markdown text
  parseGitHubAlerts(text) {
    // Regex to match GitHub alert syntax: > [!TYPE] followed by content
    const alertRegex = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?((?:^>.*\n?)*)/gm
    
    return text.replace(alertRegex, (match, type, content) => {
      // Remove > markers from content lines
      const cleanContent = content
        .split('\n')
        .map(line => line.replace(/^>\s?/, ''))
        .filter(line => line.trim())
        .join('\n')
        .trim()
      
      // Create simple alert block structure that TipTap will render
      return `<div data-github-alert="true" data-alert-type="${type.toLowerCase()}" class="markdown-alert markdown-alert-${type.toLowerCase()}">
<div class="markdown-alert-content">
${cleanContent}
</div>
</div>`
    })
  }

  // Create alert block markup
  createAlertBlock(type, content) {
    const alertTitle = this.getAlertTitle(type)
    const alertIcon = this.getAlertIcon(type)
    
    return `<div data-github-alert="true" data-alert-type="${type}" class="markdown-alert markdown-alert-${type}">
  <div class="markdown-alert-title">
    <span class="markdown-alert-icon">${alertIcon}</span>
    ${alertTitle}
  </div>
  <div class="markdown-alert-content">
    ${content}
  </div>
</div>`
  }

  // Convert alert blocks back to markdown
  alertsToMarkdown(html) {
    // Find alert blocks and convert them back to markdown syntax
    const alertRegex = /<div[^>]*data-github-alert="true"[^>]*data-alert-type="([^"]*)"[^>]*>.*?<div[^>]*class="markdown-alert-content"[^>]*>(.*?)<\/div>.*?<\/div>/gs
    
    return html.replace(alertRegex, (match, type, content) => {
      // Clean up the content and add > markers
      const cleanContent = content
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim()
        .split('\n')
        .map(line => line.trim() ? `> ${line}` : '>')
        .join('\n')
      
      return `> [!${type.toUpperCase()}]\n${cleanContent}`
    })
  }

  // Helper methods for alert configuration
  getAlertTitle(type) {
    const titles = {
      note: 'Note',
      tip: 'Tip',
      important: 'Important',
      warning: 'Warning',
      caution: 'Caution',
    }
    return titles[type] || 'Note'
  }

  getAlertIcon(type) {
    const icons = {
      note: '📝',
      tip: '💡',
      important: '❗',
      warning: '⚠️',
      caution: '🚨',
    }
    return icons[type] || '📝'
  }

  // Process GitHub alerts in already-converted HTML
  processAlertHTML(html) {
    // Find blockquotes that contain GitHub alert syntax
    // Handle both cases: [!TYPE] with content on same line, and [!TYPE] on separate line
    const alertRegex = /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*?)<\/p>(.*?)<\/blockquote>/gs
    const alertRegexSeparate = /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]<\/p>(.*?)<\/blockquote>/gs
    
    // First handle the case where [!TYPE] has content on the same line
    let processed = html.replace(alertRegex, (match, type, firstLine, restContent) => {
      // Combine first line and rest of content, but preserve paragraph structure
      let content = ''
      if (firstLine.trim()) {
        content = `<p>${firstLine.trim()}</p>`
      }
      if (restContent.trim()) {
        // Keep the existing paragraph structure instead of stripping it
        content += restContent.trim()
      }
      
      // Create alert block structure that TipTap will render
      return `<div data-github-alert="true" data-alert-type="${type.toLowerCase()}" class="markdown-alert markdown-alert-${type.toLowerCase()}">
<div class="markdown-alert-content">
${content}
</div>
</div>`
    })
    
    // Then handle the case where [!TYPE] is on a separate line
    processed = processed.replace(alertRegexSeparate, (match, type, restContent) => {
      let content = ''
      if (restContent.trim()) {
        // Keep the existing paragraph structure instead of stripping it
        content = restContent.trim()
      }
      
      // Create alert block structure that TipTap will render
      return `<div data-github-alert="true" data-alert-type="${type.toLowerCase()}" class="markdown-alert markdown-alert-${type.toLowerCase()}">
<div class="markdown-alert-content">
${content}
</div>
</div>`
    })
    
    return processed
  }

  // Main processing method to handle markdown with GitHub alerts
  processMarkdown(markdown) {
    // First parse GitHub alerts
    let processed = this.parseGitHubAlerts(markdown)
    
    // Then process with marked for other markdown features
    if (window.marked) {
      processed = window.marked.parse(processed)
    }
    
    return processed
  }

  // Convert HTML back to markdown including alerts
  htmlToMarkdown(html) {
    // First convert alert blocks back to markdown
    let markdown = this.alertsToMarkdown(html)
    
    // TODO: Add other HTML to markdown conversions as needed
    // For now, return the processed markdown
    return markdown
  }
}

export default MarkdownParser