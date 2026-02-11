# Editor Pro Integration Guide

This guide covers how to integrate your Grav plugin with Editor Pro to provide rich WYSIWYM editing capabilities for your shortcodes and content types.

## Table of Contents

- [Overview](#overview)
- [Shortcode Integration](#shortcode-integration)
- [Basic Shortcode Registration](#basic-shortcode-registration)
- [Advanced Features](#advanced-features)
- [Custom Rendering](#custom-rendering)
- [CSS Templates](#css-templates)
- [JavaScript Integration](#javascript-integration)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Editor Pro provides a modern WYSIWYM (What You See Is What You Mean) content editor built on TipTap/ProseMirror. It allows users to edit content visually while preserving the underlying markup, including shortcodes, HTML, and Twig templates.

### Key Integration Points

1. **Shortcode Registry**: Register shortcodes with Editor Pro for visual editing
2. **Custom Renderers**: Define how shortcodes appear in the editor
3. **CSS Templates**: Apply dynamic styling to shortcodes during editing
4. **Event System**: Hook into Grav's event system for registration

## Shortcode Integration

### Event Handler

To integrate with Editor Pro, listen for the `onShortcodeHandlers` event in your plugin:

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
        
        // Add your shortcodes to the registry
        $shortcodes[] = [
            'name' => 'your_shortcode',
            'title' => 'Your Shortcode',
            'description' => 'Description of what your shortcode does',
            'type' => 'inline', // or 'block'
            'plugin' => 'your-plugin',
            'category' => 'content',
            'group' => 'Your Plugin',
            'attributes' => [
                // Define shortcode parameters
            ],
            'hasContent' => true,
        ];
        
        $event['shortcodes'] = $shortcodes;
    }
}
```

## Basic Shortcode Registration

### Shortcode Configuration Structure

```php
$shortcode = [
    // Required fields
    'name' => 'alert',              // Shortcode name (used as [alert])
    'title' => 'Alert Box',         // Display name in editor UI
    'type' => 'block',              // 'block' or 'inline'
    
    // Optional fields
    'description' => 'Creates a styled alert box with customizable appearance',
    'plugin' => 'your-plugin',      // Your plugin name
    'category' => 'layout',         // Category for organization
    'group' => 'Your Plugin',       // Group name in editor UI
    'icon' => '⚠️',                 // Icon displayed in UI
    'hasContent' => true,           // Whether shortcode has content between tags
    
    // Shortcode parameters
    'attributes' => [
        'type' => [
            'type' => 'select',
            'title' => 'Alert Type',
            'options' => ['info', 'warning', 'error', 'success'],
            'default' => 'info',
            'required' => false
        ],
        'title' => [
            'type' => 'text',
            'title' => 'Alert Title',
            'placeholder' => 'Enter alert title',
            'required' => false
        ]
    ],
    
    // Attributes to show in title bar when collapsed
    'titleBarAttributes' => ['type', 'title'],
];
```

### Attribute Types

Editor Pro supports various input types for shortcode attributes:

```php
'attributes' => [
    // Text input
    'title' => [
        'type' => 'text',
        'title' => 'Title',
        'placeholder' => 'Enter title',
        'required' => true,
        'default' => 'Default value'
    ],
    
    // Select dropdown
    'size' => [
        'type' => 'select',
        'title' => 'Size',
        'options' => ['small', 'medium', 'large'],
        'default' => 'medium'
    ],
    
    // Checkbox
    'rounded' => [
        'type' => 'checkbox',
        'title' => 'Rounded Corners',
        'default' => false
    ],
    
    // Color picker
    'color' => [
        'type' => 'color',
        'title' => 'Background Color',
        'default' => '#ffffff'
    ],
    
    // Textarea
    'description' => [
        'type' => 'textarea',
        'title' => 'Description',
        'rows' => 3
    ]
]
```

## Advanced Features

### Parent-Child Relationships

Define shortcodes that can contain specific children:

```php
// Parent shortcode (tabs container)
[
    'name' => 'tabs',
    'title' => 'Tabs Container',
    'type' => 'block',
    'hasContent' => true,
    'allowedChildren' => ['tab'],           // Only allow 'tab' children
    'restrictContent' => true,              // Only allow specified children
    'attributes' => [
        'style' => [
            'type' => 'select',
            'title' => 'Tab Style',
            'options' => ['default', 'pills', 'underline']
        ]
    ]
],

// Child shortcode (individual tab)
[
    'name' => 'tab',
    'title' => 'Tab',
    'type' => 'block',
    'parentOnly' => true,                   // Can only exist inside parent
    'hasContent' => true,
    'attributes' => [
        'title' => [
            'type' => 'text',
            'title' => 'Tab Title',
            'required' => true
        ],
        'active' => [
            'type' => 'checkbox',
            'title' => 'Active by Default'
        ]
    ]
]
```

## Custom Rendering

Editor Pro allows you to define custom rendering logic for how shortcodes appear in the editor. This is particularly useful for shortcodes that need special visual representation.

### Basic Custom Renderer

```php
[
    'name' => 'fontawesome',
    'title' => 'Font Awesome Icon',
    'type' => 'inline',
    'attributes' => [
        'icon' => [
            'type' => 'text',
            'title' => 'Icon Name',
            'required' => true
        ],
        'size' => [
            'type' => 'select',
            'title' => 'Size',
            'options' => ['', 'lg', 'xl', '2x', '3x']
        ]
    ],
    'customRenderer' => 'function(blockData, config) {
        // Extract icon name from attributes
        let iconName = "";
        if (blockData.attributes && blockData.attributes.icon) {
            iconName = blockData.attributes.icon;
        }
        
        if (iconName) {
            const iconClass = iconName.startsWith("fa-") ? iconName : "fa-" + iconName;
            let sizeClass = "";
            
            if (blockData.attributes && blockData.attributes.size) {
                sizeClass = " fa-" + blockData.attributes.size;
            }
            
            return "<i class=\"fa " + iconClass + sizeClass + "\" style=\"margin: 0 4px;\"></i>";
        }
        
        return blockData.content || blockData.tagName;
    }'
]
```

### Custom Renderer Parameters

Your custom renderer function receives two parameters:

- **`blockData`**: Object containing shortcode data
  - `tagName`: Shortcode name
  - `attributes`: Object with shortcode attributes
  - `content`: Content between shortcode tags
  - `params`: Raw parameter string
  - `original`: Original shortcode text

- **`config`**: Shortcode configuration object

### Advanced Custom Renderer Example

```php
'customRenderer' => 'function(blockData, config) {
    // Gallery shortcode renderer
    if (!blockData.attributes || !blockData.attributes.images) {
        return "<div class=\"gallery-placeholder\">Gallery (no images specified)</div>";
    }
    
    const images = blockData.attributes.images.split(",");
    const columns = blockData.attributes.columns || 3;
    
    let html = "<div class=\"gallery-preview\" style=\"display: grid; grid-template-columns: repeat(" + columns + ", 1fr); gap: 4px;\">";
    
    images.slice(0, 6).forEach(function(image) {
        html += "<div style=\"background: #f0f0f0; padding: 20px; text-align: center; font-size: 12px;\">";
        html += image.trim();
        html += "</div>";
    });
    
    if (images.length > 6) {
        html += "<div style=\"background: #e0e0e0; padding: 20px; text-align: center; font-size: 12px;\">+" + (images.length - 6) + " more</div>";
    }
    
    html += "</div>";
    return html;
}'
```

## CSS Templates

CSS templates allow you to apply dynamic styling to shortcodes in the editor based on their attributes.

### Basic CSS Template

```php
[
    'name' => 'highlight',
    'title' => 'Highlight Text',
    'type' => 'inline',
    'attributes' => [
        'color' => [
            'type' => 'color',
            'title' => 'Background Color',
            'default' => '#ffff00'
        ]
    ],
    'cssTemplate' => 'background-color: {{color}}; padding: 2px 4px; border-radius: 3px;'
]
```

### Advanced CSS Template

```php
[
    'name' => 'button',
    'title' => 'Button',
    'type' => 'inline',
    'attributes' => [
        'style' => [
            'type' => 'select',
            'title' => 'Button Style',
            'options' => ['primary', 'secondary', 'success', 'danger'],
            'default' => 'primary'
        ],
        'size' => [
            'type' => 'select',
            'title' => 'Size',
            'options' => ['sm', 'md', 'lg'],
            'default' => 'md'
        ]
    ],
    'cssTemplate' => 'display: inline-block; padding: {{size === "sm" ? "4px 8px" : size === "lg" ? "12px 24px" : "8px 16px"}}; background-color: {{style === "primary" ? "#007bff" : style === "success" ? "#28a745" : style === "danger" ? "#dc3545" : "#6c757d"}}; color: white; border-radius: 4px; text-decoration: none; font-weight: 500;'
]
```

## JavaScript Integration

For advanced integration, you can also register shortcode renderers directly in JavaScript:

```javascript
// Register after Editor Pro is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (window.EditorPro && window.EditorPro.pluginSystem) {
        // Register a shortcode configuration
        window.EditorPro.pluginSystem.registerShortcode({
            name: 'js_shortcode',
            title: 'JavaScript Shortcode',
            type: 'inline',
            attributes: {
                text: {
                    type: 'text',
                    title: 'Text',
                    required: true
                }
            }
        });
        
        // Register a custom renderer
        window.EditorPro.pluginSystem.registerShortcodeRenderer('js_shortcode', function(blockData, config) {
            return '<span class="js-shortcode">' + (blockData.attributes.text || 'No text') + '</span>';
        });
    }
});
```

## Complete Examples

### Example 1: Alert Shortcode (from shortcode-core)

```php
[
    'name' => 'mark',
    'title' => 'Highlight Text',
    'description' => 'Highlight text with customizable color',
    'type' => 'inline',
    'plugin' => 'shortcode-core',
    'category' => 'formatting',
    'group' => 'Core Shortcodes',
    'icon' => '🖍',
    'attributes' => [
        'color' => [
            'type' => 'color',
            'title' => 'Highlight Color',
            'default' => '#ffff00'
        ]
    ],
    'titleBarAttributes' => [],
    'hasContent' => true,
    'cssTemplate' => 'background-color: {{color}}; padding: 1px 2px; border-radius: 2px;'
]
```

### Example 2: FontAwesome Icon (from shortcode-core)

```php
[
    'name' => 'fontawesome',
    'title' => 'Font Awesome Icon',
    'description' => 'Insert Font Awesome icon',
    'type' => 'inline',
    'plugin' => 'shortcode-core',
    'category' => 'media',
    'group' => 'Core Shortcodes',
    'icon' => '★',
    'attributes' => [
        'icon' => [
            'type' => 'text',
            'title' => 'Icon Name',
            'default' => 'heart',
            'required' => true,
            'placeholder' => 'e.g., heart, star, user'
        ],
        'size' => [
            'type' => 'select',
            'title' => 'Size',
            'options' => ['', 'xs', 'sm', 'lg', 'xl', '2x', '3x'],
            'default' => ''
        ]
    ],
    'titleBarAttributes' => ['icon'],
    'hasContent' => false,
    'customRenderer' => 'function(blockData, config) {
        let iconName = "";
        
        if (blockData.attributes && blockData.attributes.icon) {
            iconName = blockData.attributes.icon;
        } else if (blockData.params) {
            const iconMatch = blockData.params.match(/icon\\s*=\\s*["\']([^"\']+)["\']|icon\\s*=\\s*([^\\s\\]]+)/);
            iconName = iconMatch ? (iconMatch[1] || iconMatch[2]) : "";
        }
        
        if (!iconName && blockData.content && !blockData.content.includes(" ")) {
            iconName = blockData.content;
        }
        
        if (iconName) {
            const iconClass = iconName.startsWith("fa-") ? iconName : "fa-" + iconName;
            let sizeClass = "";
            
            if (blockData.attributes && blockData.attributes.size) {
                sizeClass = " fa-" + blockData.attributes.size;
            }
            
            return "<i class=\"fa " + iconClass + sizeClass + "\" style=\"margin: 0 4px;\"></i>";
        }
        
        return blockData.content || blockData.tagName;
    }'
]
```

### Example 3: Complex Media Shortcode

```php
public function onShortcodeHandlers($event)
{
    $shortcodes = $event['shortcodes'] ?? [];
    
    $shortcodes[] = [
        'name' => 'video',
        'title' => 'Video Player',
        'description' => 'Embed video with custom controls',
        'type' => 'block',
        'plugin' => 'video-plugin',
        'category' => 'media',
        'group' => 'Video Plugin',
        'icon' => '🎥',
        'attributes' => [
            'src' => [
                'type' => 'text',
                'title' => 'Video URL',
                'required' => true,
                'placeholder' => 'https://example.com/video.mp4'
            ],
            'poster' => [
                'type' => 'text',
                'title' => 'Poster Image',
                'placeholder' => 'https://example.com/poster.jpg'
            ],
            'width' => [
                'type' => 'text',
                'title' => 'Width',
                'default' => '100%'
            ],
            'controls' => [
                'type' => 'checkbox',
                'title' => 'Show Controls',
                'default' => true
            ],
            'autoplay' => [
                'type' => 'checkbox',
                'title' => 'Autoplay',
                'default' => false
            ]
        ],
        'titleBarAttributes' => ['src'],
        'hasContent' => false,
        'customRenderer' => 'function(blockData, config) {
            const src = blockData.attributes && blockData.attributes.src;
            const poster = blockData.attributes && blockData.attributes.poster;
            const width = blockData.attributes && blockData.attributes.width || "100%";
            
            if (!src) {
                return "<div style=\"background: #f0f0f0; padding: 40px; text-align: center; border: 2px dashed #ccc;\">📹 Video Player<br><small>No video source specified</small></div>";
            }
            
            let html = "<div style=\"background: #000; position: relative; width: " + width + "; max-width: 100%;\">";
            
            if (poster) {
                html += "<img src=\"" + poster + "\" style=\"width: 100%; height: auto; display: block;\" />";
                html += "<div style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; color: white; opacity: 0.8;\">▶️</div>";
            } else {
                html += "<div style=\"aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; color: white; font-size: 48px;\">▶️</div>";
            }
            
            html += "<div style=\"position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;\">";
            html += src.split("/").pop();
            html += "</div></div>";
            
            return html;
        }'
    ];
    
    $event['shortcodes'] = $shortcodes;
}
```

## Best Practices

### 1. Naming Conventions

- Use descriptive shortcode names: `video-player` instead of `vp`
- Follow kebab-case for multi-word names: `social-share`
- Prefix with plugin name if needed: `myplugin-gallery`

### 2. Attribute Design

- Always provide sensible defaults
- Use required sparingly - only for truly essential attributes
- Group related attributes logically
- Provide clear titles and placeholders

### 3. Custom Renderers

- Keep renderers lightweight and fast
- Handle missing data gracefully
- Use semantic HTML in renderers
- Avoid complex DOM manipulation

### 4. CSS Templates

- Use relative units where possible
- Keep styles scoped to avoid conflicts
- Test with different content lengths
- Consider dark/light mode compatibility

### 5. Error Handling

```php
'customRenderer' => 'function(blockData, config) {
    try {
        // Your rendering logic here
        if (!blockData.attributes || !blockData.attributes.required_field) {
            return "<div class=\"shortcode-error\">Missing required field</div>";
        }
        
        // Normal rendering
        return "<div>Your content</div>";
        
    } catch (error) {
        console.error("Renderer error:", error);
        return "<div class=\"shortcode-error\">Rendering error</div>";
    }
}'
```

## Troubleshooting

### Common Issues

**1. Shortcode not appearing in editor**
- Check that your plugin is active
- Verify the `onShortcodeHandlers` event is firing
- Ensure all required fields are present in shortcode definition

**2. Custom renderer not working**
- Check browser console for JavaScript errors
- Verify the renderer function syntax is valid
- Make sure to escape quotes properly in PHP strings

**3. CSS template not applying**
- Check that attribute names match exactly
- Verify the CSS syntax is valid
- Look for JavaScript console errors

**4. Attributes not saving**
- Ensure attribute names don't conflict with reserved words
- Check that form validation is passing
- Verify attribute types are supported

### Debug Tips

1. **Enable debug logging**:
```php
error_log('ShortcodeCore: Added ' . count($shortcodes) . ' shortcodes');
```

2. **Check browser console** for JavaScript errors when custom renderers fail

3. **Validate shortcode registration**:
```php
public function onShortcodeHandlers($event)
{
    $shortcodes = $event['shortcodes'] ?? [];
    
    // Your shortcode registration
    $myShortcode = [/* ... */];
    
    // Validate before adding
    if (empty($myShortcode['name']) || empty($myShortcode['title'])) {
        error_log('Invalid shortcode configuration');
        return;
    }
    
    $shortcodes[] = $myShortcode;
    $event['shortcodes'] = $shortcodes;
}
```

4. **Test with minimal configuration first**, then add complexity

### Getting Help

- Check the Editor Pro documentation
- Review the shortcode-core plugin source code for reference examples
- Post issues on the Grav community forum
- Submit bug reports to the Editor Pro GitHub repository

## Conclusion

Editor Pro's shortcode integration system provides powerful capabilities for creating rich, interactive content editing experiences. By following this guide and the examples provided, you can create sophisticated shortcodes that work seamlessly within the WYSIWYM editor environment.

Remember to test your shortcodes thoroughly across different browsers and content scenarios, and always provide fallbacks for error conditions to ensure a smooth user experience.