// TipTap Bundle for Editor Pro
import { Editor, Node, Mark, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import BubbleMenu from '@tiptap/extension-bubble-menu'
import DragHandle from '@tiptap/extension-drag-handle'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
// Gapcursor is already included in StarterKit
import { marked } from 'marked'
import RawBlock from './nodes/RawBlock.js'
import ShortcodeBlock from './nodes/ShortcodeBlock.js'
import GitHubAlert from './nodes/GitHubAlert.js'
import MarkdownParser from './extensions/MarkdownParser.js'
import ExtraTypography from './extensions/ExtraTypography.js'
import MarkdownShortcuts from './extensions/MarkdownShortcuts.js'
import CustomCodeBlock from './extensions/CustomCodeBlock.js'
import { RawMarkdownMode } from './RawMarkdownMode.js'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Configure marked for Grav-like markdown
marked.setOptions({
  gfm: true,        // GitHub Flavored Markdown
  breaks: false,    // Don't convert line breaks to <br>
  pedantic: false,  // Don't be overly strict
  sanitize: false,  // Don't sanitize HTML (we want to preserve it)
  smartLists: true, // Smarter list behavior
  smartypants: false // Don't use smart quotes (conflicts with Grav)
});

// Expose globally for Editor Pro
window.TiptapCore = { Editor, Node, Mark, Extension }
window.TiptapStarterKit = { StarterKit }
window.TiptapUnderline = { Underline }
window.TiptapLink = { Link }
window.TiptapImage = { Image }
window.TiptapTable = { Table }
window.TiptapTableRow = { TableRow }
window.TiptapTableCell = { TableCell }
window.TiptapTableHeader = { TableHeader }
window.TiptapBubbleMenu = { BubbleMenu }
window.TiptapDragHandle = { DragHandle }
window.TiptapCharacterCount = { CharacterCount }
window.TiptapTypography = { Typography }
// window.TiptapGapcursor = { Gapcursor } - Already included in StarterKit
window.TiptapRawBlock = { RawBlock }
window.TiptapShortcodeBlock = { ShortcodeBlock }
window.TiptapGitHubAlert = { GitHubAlert }
window.TiptapMarkdownParser = { MarkdownParser }
window.TiptapExtraTypography = { ExtraTypography }
window.TiptapMarkdownShortcuts = { MarkdownShortcuts }
window.TiptapCustomCodeBlock = { CustomCodeBlock }
window.TiptapPM = { Plugin, PluginKey, NodeSelection }
window.TiptapPMView = { Decoration, DecorationSet }
window.marked = marked
window.RawMarkdownMode = RawMarkdownMode
