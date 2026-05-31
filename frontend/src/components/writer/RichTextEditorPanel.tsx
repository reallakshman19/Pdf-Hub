import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useWriterStore } from '../../core/writer/store';
import type { PlacedElement } from '../../core/writer/types';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Save,
  Underline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { sanitizeHtml } from '../../core/writer/htmlSanitizer';

interface Props {
  element: PlacedElement;
  scale: number;
  onClose: () => void;
}

export const RichTextEditorPanel: React.FC<Props> = ({ element, scale, onClose }) => {
  const { updateElement } = useWriterStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [fontFamily, setFontFamily] = useState(element.styles.fontFamily ?? 'Arial');
  const [fontSizePx, setFontSizePx] = useState(element.styles.fontSize ?? 14);
  const [lineHeight, setLineHeight] = useState(element.styles.lineHeight ?? 1.4);
  const [textColor, setTextColor] = useState(element.styles.color ?? '#0f172a');

  const fontFamilies = [
    'Arial',
    'Times New Roman',
    'Georgia',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Courier New',
  ];
  const fontSizes = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32];
  const lineHeights = [1.2, 1.4, 1.6, 1.8, 2];

  // Initialize with content, or empty paragraph
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== element.content) {
      // Only update innerHTML if it's strictly different to avoid losing caret position
      editorRef.current.innerHTML = element.content || '<p><br/></p>';
    }
  }, [element.content]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.style.fontFamily = fontFamily;
    editorRef.current.style.fontSize = `${fontSizePx}px`;
    editorRef.current.style.lineHeight = String(lineHeight);
    editorRef.current.style.color = textColor;
  }, [fontFamily, fontSizePx, lineHeight, textColor]);

  useEffect(() => {
    // Focus on mount
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const patchElementStyles = useCallback((patch: Partial<PlacedElement['styles']>) => {
    updateElement(element.id, {
      styles: {
        ...element.styles,
        ...patch,
      },
    });
  }, [element.id, element.styles, updateElement]);

  const saveContent = useCallback(() => {
    if (editorRef.current) {
      updateElement(element.id, { content: editorRef.current.innerHTML });
    }
  }, [element.id, updateElement]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey && e.key === 'Enter') {
      saveContent();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        applyTextAlign('left');
      } else {
        insertHtmlAtCaret('&emsp;&emsp;');
      }
    }
  };

  const withEditorRange = useCallback((handler: (range: Range, selection: Selection) => void) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;

    if (selection.rangeCount === 0) {
      editor.focus();
      const fallbackRange = document.createRange();
      fallbackRange.selectNodeContents(editor);
      fallbackRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(fallbackRange);
    }

    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      editor.focus();
      return;
    }

    handler(range, selection);
    editor.focus();
    window.setTimeout(saveContent, 0);
  }, [saveContent]);

  const wrapSelectionWithTag = (tag: 'strong' | 'em' | 'u') => {
    withEditorRange((range) => {
      if (range.collapsed) return;
      const wrapper = document.createElement(tag);
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
      range.selectNodeContents(wrapper);
    });
  };

  const applyTextColor = (color: string) => {
    withEditorRange((range) => {
      if (range.collapsed) return;
      const span = document.createElement('span');
      span.style.color = color;
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      range.selectNodeContents(span);
    });
  };

  const applyTextAlign = (textAlign: 'left' | 'center' | 'right' | 'justify') => {
    withEditorRange((range) => {
      const editor = editorRef.current;
      if (!editor) return;
      let node: Node | null = range.startContainer;
      while (node && node !== editor) {
        if (node instanceof HTMLElement && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/.test(node.tagName)) {
          node.style.textAlign = textAlign;
          return;
        }
        node = node.parentNode;
      }
      editor.style.textAlign = textAlign;
    });
  };

  const toggleList = (ordered: boolean) => {
    withEditorRange((range) => {
      const editor = editorRef.current;
      if (!editor) return;
      const listTag = ordered ? 'OL' : 'UL';
      const currentList = range.startContainer instanceof Element
        ? range.startContainer.closest('ol,ul')
        : range.startContainer.parentElement?.closest('ol,ul');

      if (currentList) {
        const fragment = document.createDocumentFragment();
        Array.from(currentList.children).forEach((child) => {
          const paragraph = document.createElement('p');
          paragraph.innerHTML = child instanceof HTMLElement ? child.innerHTML : child.textContent ?? '';
          fragment.appendChild(paragraph);
        });
        currentList.replaceWith(fragment);
        return;
      }

      const contents = range.extractContents();
      const wrapper = document.createElement(listTag);
      const li = document.createElement('li');
      li.appendChild(contents);
      wrapper.appendChild(li);
      range.insertNode(wrapper);
      range.selectNodeContents(li);
    });
  };

  const insertHtmlAtCaret = (html: string) => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor) return;

    if (selection.rangeCount === 0) {
      editor.focus();
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
    if (selection.rangeCount === 0) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.setEndAfter(lastNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    editor.focus();
  };

  const insertImageAtCaret = (dataUrl: string) => {
    insertHtmlAtCaret(`<img src="${dataUrl}" alt="" />`);
  };

  const handleFontFamilyChange = (nextFamily: string) => {
    setFontFamily(nextFamily);
    patchElementStyles({ fontFamily: nextFamily });
    window.setTimeout(saveContent, 0);
  };

  const handleFontSizeChange = (nextSize: number) => {
    setFontSizePx(nextSize);
    patchElementStyles({ fontSize: nextSize });
    window.setTimeout(saveContent, 0);
  };

  const handleLineHeightChange = (nextLineHeight: number) => {
    setLineHeight(nextLineHeight);
    patchElementStyles({ lineHeight: nextLineHeight });
    window.setTimeout(saveContent, 0);
  };

  const handleTextColorChange = (nextColor: string) => {
    setTextColor(nextColor);
    applyTextColor(nextColor);
    patchElementStyles({ color: nextColor });
    window.setTimeout(saveContent, 0);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Look for image items in the clipboard
    const items = e.clipboardData.items;
    let handledImage = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        handledImage = true;
        const file = items[i].getAsFile();
        if (!file) continue;

        e.preventDefault(); // Stop default paste

        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          // Create an image element and insert it at the cursor position
          insertImageAtCaret(base64);

          // Wait a tick and then find the newly inserted image to style it
          setTimeout(() => {
            if (!editorRef.current) return;
            const imgs = editorRef.current.getElementsByTagName('img');
            // Assuming the last image is the one just pasted
            if (imgs.length > 0) {
               const img = imgs[imgs.length - 1];
               // Add default styles so it fits within the editor and exports nicely
               img.style.maxWidth = '100%';
               img.style.maxHeight = '300px';
               img.style.objectFit = 'contain';
               saveContent();
            }
          }, 0);
        };
        reader.readAsDataURL(file);
        break; // Only handle the first image
      }
    }

    // If it's not an image, try to grab text/html to sanitize it before pasting.
    if (!handledImage) {
      const htmlContent = e.clipboardData.getData('text/html');
      if (htmlContent) {
        e.preventDefault(); // Stop native unsafe paste
        const sanitized = sanitizeHtml(htmlContent);
        insertHtmlAtCaret(sanitized);
      }
      setTimeout(saveContent, 0); // Save the content after paste completes
    }
  };

  return (
    <div style={{
      position: 'absolute',
      left: element.x * scale,
      top: (element.y + element.height) * scale + 10,
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: 8,
      padding: '8px',
      zIndex: 9999,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: 480,
    }}
    onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
        <Tooltip content="Font family">
          <select
            value={fontFamily}
            onChange={(e) => handleFontFamilyChange(e.target.value)}
            className="h-8 px-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 max-w-[140px]"
          >
            {fontFamilies.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </Tooltip>
        <Tooltip content="Font size">
          <select
            value={fontSizePx}
            onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
            className="h-8 px-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 w-[72px]"
          >
            {fontSizes.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
        </Tooltip>
        <Tooltip content="Line spacing">
          <select
            value={lineHeight}
            onChange={(e) => handleLineHeightChange(parseFloat(e.target.value))}
            className="h-8 px-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 w-[80px]"
          >
            {lineHeights.map((value) => (
              <option key={value} value={value}>{value}x</option>
            ))}
          </select>
        </Tooltip>
        <Tooltip content="Text color">
          <input
            type="color"
            value={textColor}
            onChange={(e) => handleTextColorChange(e.target.value)}
            className="h-8 w-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-0.5 cursor-pointer"
          />
        </Tooltip>
        <Tooltip content="Bold (Ctrl+B)">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => wrapSelectionWithTag('strong')}>
            <Bold className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Italic (Ctrl+I)">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => wrapSelectionWithTag('em')}>
            <Italic className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Underline (Ctrl+U)">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => wrapSelectionWithTag('u')}>
            <Underline className="w-4 h-4" />
          </Button>
        </Tooltip>
        <div style={{ width: 1, height: 16, background: 'var(--color-border-tertiary)', margin: '0 4px' }} />
        <Tooltip content="Bullet List">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleList(false)}>
            <List className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Numbered List">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleList(true)}>
            <ListOrdered className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Align Left">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => applyTextAlign('left')}>
            <AlignLeft className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Align Center">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => applyTextAlign('center')}>
            <AlignCenter className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Align Right">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => applyTextAlign('right')}>
            <AlignRight className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Justify">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => applyTextAlign('justify')}>
            <AlignJustify className="w-4 h-4" />
          </Button>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip content="Save (Ctrl+Enter)">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 dark:text-blue-400" onClick={() => { saveContent(); onClose(); }}>
            <Save className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Discard">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        onBlur={saveContent}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName === 'IMG') {
            setSelectedImage(e.target as HTMLImageElement);
          } else {
            setSelectedImage(null);
          }
        }}
        style={{
          minHeight: 120,
          padding: '4px 8px',
          outline: 'none',
          color: textColor,
          backgroundColor: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 6,
          overflowY: 'auto',
          maxHeight: '400px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />

      {selectedImage && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 justify-center">
          <span className="text-xs text-slate-500 font-medium mr-2">Image Size:</span>
          <Tooltip content="Shrink Image">
             <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  if (!editorRef.current) return;
                  const currentWidth = selectedImage.style.width ? parseInt(selectedImage.style.width) : 100;
                  const newWidth = Math.max(10, currentWidth - 10);

                  // Clone the image node to modify it safely without violating React state immutability
                  const newImg = selectedImage.cloneNode() as HTMLImageElement;
                  newImg.style.width = `${newWidth}%`;
                  newImg.style.maxWidth = 'none';

                  selectedImage.replaceWith(newImg);
                  setSelectedImage(newImg);
                  saveContent();
                }}
              >
                <ZoomOut className="w-3 h-3" />
             </Button>
          </Tooltip>
          <Tooltip content="Enlarge Image">
             <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  if (!editorRef.current) return;
                  const currentWidth = selectedImage.style.width ? parseInt(selectedImage.style.width) : 100;
                  const newWidth = Math.min(100, currentWidth + 10);

                  // Clone the image node to modify it safely without violating React state immutability
                  const newImg = selectedImage.cloneNode() as HTMLImageElement;
                  newImg.style.width = `${newWidth}%`;
                  newImg.style.maxWidth = 'none';

                  selectedImage.replaceWith(newImg);
                  setSelectedImage(newImg);
                  saveContent();
                }}
              >
                <ZoomIn className="w-3 h-3" />
             </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
