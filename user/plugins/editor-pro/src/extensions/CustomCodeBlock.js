// Custom CodeBlock extension that handles base64-encoded content
// This fixes whitespace preservation issues in nested contexts
import CodeBlock from '@tiptap/extension-code-block'
import { Fragment } from '@tiptap/pm/model'

export const CustomCodeBlock = CodeBlock.extend({
    parseHTML() {
        return [
            {
                tag: 'pre[data-code-content]',
                preserveWhitespace: 'full',
                getAttrs: (element) => {
                    const language = element.getAttribute('data-language') ||
                                    element.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] ||
                                    null;
                    return { language };
                },
                getContent: (element, schema) => {
                    // Decode base64 content
                    const encodedContent = element.getAttribute('data-code-content');
                    if (encodedContent) {
                        try {
                            const decodedContent = decodeURIComponent(escape(atob(encodedContent)));
                            if (decodedContent) {
                                return Fragment.from(schema.text(decodedContent));
                            }
                        } catch (e) {
                            console.error('Failed to decode code content:', e);
                        }
                    }
                    return Fragment.empty;
                }
            },
            {
                // Fallback for regular pre/code without data attribute
                tag: 'pre',
                preserveWhitespace: 'full',
                getAttrs: (element) => {
                    const language = element.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || null;
                    return { language };
                }
            }
        ];
    }
});

export default CustomCodeBlock;
