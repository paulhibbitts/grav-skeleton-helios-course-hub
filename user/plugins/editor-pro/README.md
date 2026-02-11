# Grav Editor Pro Plugin

![Editor Pro](icon.png)

**Editor Pro** is a powerful, modern WYSIWYM (What You See Is What You Mean) content editor for [Grav CMS](http://github.com/getgrav/grav) built on [TipTap](https://tiptap.dev/)/[ProseMirror](https://prosemirror.net/). It provides a rich editing experience while preserving the underlying markup structure, making it perfect for content creators who need visual feedback without sacrificing control over their HTML, Shortcodes, and Twig templates.

## Features

### Core Editing Features
- **Modern Block Architecture**: Built on TipTap/ProseMirror for exceptional performance and reliability
- **WYSIWYM Editing**: Visual editing that preserves your markdown structure
- **Content Preservation**: HTML, Shortcodes, and Twig templates are preserved as visual blocks
- **Nested Block Support**: Complex shortcodes with nested content are properly visualized
- **Vanilla JavaScript**: No framework dependencies for maximum compatibility and performance
- **Extensible Plugin System**: Easy integration with third-party Grav plugins
- **Keyboard Shortcuts**: Full keyboard navigation and shortcuts support
- **Undo/Redo History**: Complete editing history with keyboard shortcuts (Ctrl+Z/Ctrl+Y)

### Content Types
- **Rich Text Formatting**: Bold, italic, underline, strikethrough, subscript, superscript
- **Headings**: Support for H1-H6 with keyboard shortcuts
- **Lists**: Bullet lists, numbered lists, and task lists with nesting
- **Links**: Smart link detection and editing with title attributes
- **Images**: Drag-and-drop image insertion with alt text support
- **Tables**: Full table support with row/column management
- **Code Blocks**: Syntax-highlighted code blocks with language selection
- **Blockquotes**: Nested blockquote support
- **Horizontal Rules**: Visual separators
- **GitHub Alerts**: Native support for GitHub-style alert blocks (note, tip, important, warning, caution)

### Advanced Features
- **Shortcode Integration**: Visual shortcode builder when used with shortcode-core plugin
- **Live Preview**: Real-time preview of shortcode output (configurable)
- **Smart Paste**: Intelligent handling of pasted content
- **Image Path Resolution**: Automatic resolution of relative image paths
- **Link Path Resolution**: Smart handling of internal and external links
- **Custom Node Types**: Support for custom content types through extensions
- **Toolbar Customization**: Configure which tools appear in the toolbar
- **Multi-language Support**: Full internationalization support

## Toolbar Features

- Undo/Redo
- Remove Format
- Headings (H1-H6)
- Bold, Italic, Underline, Strikethrough
- Links and Images  
- Blockquotes
- Bullet and Numbered Lists
- Code Blocks
- Tables
- HTML Blocks
- Shortcode Blocks

## Content Preservation

Editor Pro preserves three types of special content as visual blocks:

### Shortcode Blocks (Green)
- Displays shortcode name and parameters
- Shows nested structure for complex shortcodes
- Live preview capabilities (when integrated with shortcode-core)
- Visual editing through modal dialogs

### HTML Blocks (Blue)
- Preserves any HTML content as blocks
- Prevents accidental editing of complex HTML
- Maintains original formatting

### Twig Blocks (Orange)
- Preserves Twig template code
- Shows variables and logic blocks
- Prevents template corruption

## Plugin Integration

### Shortcode-Core Integration

When shortcode-core plugin is enabled, Editor Pro provides:

- **Shortcode Builder**: Visual interface for inserting shortcodes
- **Parameter Forms**: Dynamic forms for each shortcode type
- **Live Preview**: Real-time preview of shortcode output
- **Keyboard Shortcut**: Ctrl+Shift+S to open shortcode builder

### Extending Editor Pro

Create a plugin integration by listening to the `registerEditorProPlugin` event:

```php
// In your plugin's PHP file
public static function getSubscribedEvents() {
    return [
        'registerEditorProPlugin' => ['registerEditorProPlugin', 0]
    ];
}

public function registerEditorProPlugin($event) {
    $plugins = $event['plugins'];
    $plugins['js'][] = 'plugin://your-plugin/editor-pro/integration.js';
    $event['plugins'] = $plugins;
    return $event;
}
```

```javascript
// In your integration.js file
window.EditorPro.registerPlugin({
    name: 'your-plugin',
    
    init(editorPro) {
        // Add your functionality here
        // Access to: editorPro.editor, editorPro.toolbar, etc.
    }
});
```

## Configuration

Configure Editor Pro through the Grav admin panel under Plugins > Editor Pro:

- **Toolbar Items**: Customize which tools appear
- **Content Preservation**: Enable/disable block types
- **Shortcode Integration**: Configure live preview options

## Installation

### Via GPM (Grav Package Manager)

The simplest way to install this plugin is via the [Grav Package Manager (GPM)](http://learn.getgrav.org/advanced/grav-gpm) through your system's terminal:

```bash
bin/gpm install editor-pro
```

### Via Admin Plugin

If you use the Admin plugin, you can install directly through the admin interface:

1. Navigate to Plugins in the Admin sidebar
2. Click "Add" (Plus icon)
3. Search for "Editor Pro"
4. Click "Install"
5. Click "Activate"

### Manual Installation

To install the plugin manually:

1. Download the zip version of this repository
2. Unzip it under `/user/plugins/editor-pro/`
3. Rename the folder to `editor-pro` if needed

You should now have all the plugin files under:

    /user/plugins/editor-pro/

### Activation

After installation, activate the plugin:

1. Login to the Grav Admin
2. Navigate to **Plugins**
3. Find **Editor Pro** and click the toggle to enable it
4. Click **Save** at the top

### Setting as Default Editor

To use Editor Pro as your content editor:

**For Individual Users:**
1. Go to your user account settings
2. Under "Editor" select "Editor Pro"
3. Save your preferences

**For All Users (Admin):**
1. Navigate to **Plugins > Editor Pro**
2. Enable "Set as default editor for all users"
3. Save configuration

## Usage

### Basic Usage

Editor Pro automatically replaces markdown textareas when:
- User has "editor-pro" selected as their content editor
- Plugin is set as default for all users
- A page blueprint specifically uses the editor-pro field type

### Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|--------------|-----|
| Bold | Ctrl+B | Cmd+B |
| Italic | Ctrl+I | Cmd+I |
| Underline | Ctrl+U | Cmd+U |
| Strikethrough | Ctrl+Shift+X | Cmd+Shift+X |
| Undo | Ctrl+Z | Cmd+Z |
| Redo | Ctrl+Y / Ctrl+Shift+Z | Cmd+Shift+Z |
| Insert Link | Ctrl+K | Cmd+K |
| Heading 1-6 | Ctrl+Alt+1-6 | Cmd+Alt+1-6 |
| Bullet List | Ctrl+Shift+8 | Cmd+Shift+8 |
| Numbered List | Ctrl+Shift+7 | Cmd+Shift+7 |
| Blockquote | Ctrl+Shift+B | Cmd+Shift+B |
| Code Block | Ctrl+Alt+C | Cmd+Alt+C |
| Insert Shortcode | Ctrl+Shift+S | Cmd+Shift+S |

### Working with Special Content

#### Shortcode Blocks
- **Visual Indicator**: Green blocks with shortcode name
- **Editing**: Click the block to open edit dialog
- **Keyboard**: Use arrow keys to navigate around blocks
- **Deletion**: Select and press Delete/Backspace

#### HTML Blocks
- **Visual Indicator**: Blue blocks labeled "HTML"
- **Purpose**: Preserves complex HTML from being modified
- **Editing**: Double-click to edit raw HTML

#### Twig Blocks
- **Visual Indicator**: Orange blocks labeled "Twig"
- **Purpose**: Protects template code from corruption
- **Usage**: Ideal for dynamic content areas

### Blueprint Configuration

To use Editor Pro in specific page types, add to your blueprint:

```yaml
form:
  fields:
    content:
      type: editor-pro
      label: Content
      validate:
        required: true
```

### Page Header Configuration

Enable/disable Editor Pro per page:

```yaml
---
title: My Page
editor:
  enabled: false  # Disables Editor Pro for this page
---
```

## Performance

Editor Pro is optimized for performance:
- **No Framework Dependencies**: Pure vanilla JavaScript
- **Direct Document Model**: No markdown ↔ HTML conversions
- **Lazy Block Rendering**: Blocks rendered only when visible
- **Minimal DOM Updates**: Efficient ProseMirror updates
- **Content Streaming**: Large documents handled efficiently

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 13+
- Edge 80+

## Extending Editor Pro

### Adding Custom Shortcodes

Editor Pro provides comprehensive integration for custom shortcodes. Here's how to add your own:

#### 1. Basic Shortcode Registration

In your plugin's PHP file:

```php
<?php
namespace Grav\Plugin;

use Grav\Common\Plugin;

class YourPlugin extends Plugin
{
    public static function getSubscribedEvents()
    {
        return [
            'onShortcodeHandlers' => ['onShortcodeHandlers', 0],
        ];
    }

    public function onShortcodeHandlers($event)
    {
        $shortcodes = $event['shortcodes'] ?? [];
        
        // Register a simple shortcode
        $shortcodes[] = [
            'name' => 'button',
            'title' => 'Button',
            'description' => 'Creates a styled button',
            'type' => 'inline',
            'plugin' => 'your-plugin',
            'group' => 'UI Elements',
            'icon' => '🔘',
            'attributes' => [
                'text' => [
                    'type' => 'text',
                    'title' => 'Button Text',
                    'placeholder' => 'Click me',
                    'required' => true
                ],
                'url' => [
                    'type' => 'text',
                    'title' => 'Link URL',
                    'placeholder' => 'https://example.com'
                ],
                'style' => [
                    'type' => 'select',
                    'title' => 'Button Style',
                    'options' => ['primary', 'secondary', 'success', 'danger'],
                    'default' => 'primary'
                ]
            ]
        ];
        
        $event['shortcodes'] = $shortcodes;
    }
}
```

#### 2. Attribute Types

Editor Pro supports various attribute types:

- **text**: Single line text input
- **textarea**: Multi-line text input
- **select**: Dropdown selection
- **checkbox**: Boolean toggle
- **color**: Color picker
- **number**: Numeric input
- **date**: Date picker

#### 3. Advanced Shortcode with Nested Content

```php
$shortcodes[] = [
    'name' => 'accordion',
    'title' => 'Accordion',
    'type' => 'block',
    'hasContent' => true,  // Enables nested content
    'plugin' => 'your-plugin',
    'attributes' => [
        'title' => [
            'type' => 'text',
            'title' => 'Accordion Title',
            'required' => true
        ],
        'open' => [
            'type' => 'checkbox',
            'title' => 'Initially Open',
            'default' => false
        ]
    ],
    // Optional: Define child shortcodes
    'child' => [
        'name' => 'accordion-item',
        'title' => 'Accordion Item',
        'attributes' => [
            'title' => [
                'type' => 'text',
                'title' => 'Item Title'
            ]
        ]
    ]
];
```

#### 4. Custom Rendering in Editor

Provide custom CSS for how your shortcode appears in the editor:

```php
$shortcodes[] = [
    'name' => 'alert',
    'title' => 'Alert Box',
    'cssTemplate' => '
        .sc-alert {
            padding: 15px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .sc-alert[data-type="info"] {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }
        .sc-alert[data-type="warning"] {
            background: #fff3cd;
            border: 1px solid #ffeeba;
            color: #856404;
        }
    '
];
```

### JavaScript Plugin Integration

Extend Editor Pro's functionality with JavaScript:

```javascript
// In your plugin's integration.js file
window.EditorPro.registerPlugin({
    name: 'your-plugin',
    
    init(editorPro) {
        // Access editor instance
        const { editor, toolbar } = editorPro;
        
        // Add custom button to toolbar
        toolbar.addButton({
            name: 'customTool',
            icon: '🎨',
            title: 'Custom Tool',
            action: () => {
                // Your custom action
                editor.chain().focus().insertContent('Custom content').run();
            }
        });
        
        // Listen to editor events
        editor.on('update', ({ editor }) => {
            console.log('Content updated:', editor.getHTML());
        });
    }
});
```

## Development

### Building from Source

```bash
# Navigate to plugin directory
cd user/plugins/editor-pro

# Install dependencies
npm install

# Build TipTap bundle (production)
npm run build

# Watch mode for development
npm run watch
```

### File Structure

```
editor-pro/
├── admin/
│   └── assets/
│       ├── editor-pro.js        # Main editor initialization
│       ├── editor-pro.css       # Editor styles
│       └── vendor/
│           └── tiptap-bundle.js # Compiled TipTap bundle
├── src/
│   ├── nodes/                   # Custom TipTap nodes
│   ├── extensions/              # TipTap extensions
│   └── index.js                 # Bundle entry point
├── blueprints.yaml              # Plugin configuration
├── editor-pro.php               # Main plugin class
└── package.json                 # NPM dependencies
```

### Creating Custom Nodes

Example of a custom TipTap node:

```javascript
import { Node } from '@tiptap/core'

export const CustomBlock = Node.create({
    name: 'customBlock',
    
    group: 'block',
    
    content: 'inline*',
    
    parseHTML() {
        return [
            {
                tag: 'div[data-custom-block]',
            },
        ]
    },
    
    renderHTML({ HTMLAttributes }) {
        return ['div', { 'data-custom-block': '', ...HTMLAttributes }, 0]
    },
    
    addCommands() {
        return {
            setCustomBlock: () => ({ commands }) => {
                return commands.setNode(this.name)
            },
        }
    },
})
```

## Troubleshooting

### Common Issues

1. **Editor not appearing**
   - Ensure plugin is enabled in admin
   - Check that "Editor Pro" is selected in user preferences
   - Clear Grav cache: `bin/grav cache`
   - Log out and back in again to clear user profile cache

2. **Shortcodes not showing**
   - Verify shortcode-core plugin is installed and enabled
   - Check that shortcodes are properly registered
   - Enable "Content Preservation > Shortcode Blocks" in plugin settings

3. **JavaScript errors**
   - Check browser console for specific errors
   - Ensure browser meets minimum requirements
   - Try disabling other plugins to check for conflicts

4. **Performance issues**
   - Disable live preview for complex shortcodes
   - Reduce number of active toolbar items
   - Check for large images in content

### Debug Mode

Enable debug output in plugin configuration:

```yaml
plugins:
  editor-pro:
    debug: true
```

## Requirements

- Grav 1.7.0 or higher
- PHP 7.3.6 or higher
- Modern browser (Chrome 80+, Firefox 78+, Safari 13+, Edge 80+)

## Credits

- **TipTap** - The excellent ProseMirror wrapper that powers Editor Pro
- **ProseMirror** - The robust editing framework
- **Grav Team** - For the amazing Grav CMS
- **Trilby Media** - Plugin development and maintenance

---

## Support

- **Documentation**: Full integration guide available in [INTEGRATION.md](INTEGRATION.md)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/getgrav/grav-premium-issues/issues)
- **Discord**: Join the [Grav Discord](https://discord.gg/grav) for community support
- **Forum**: Post questions on the [Grav Forum](https://discourse.getgrav.org/)

---

Developed by [Trilby Media](https://trilby.media) with ❤️ for the Grav community