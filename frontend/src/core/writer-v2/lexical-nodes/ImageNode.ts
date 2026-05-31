import React from 'react';
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
    width: number | 'inherit';
    height: number | 'inherit';
    caption: string;
  },
  SerializedLexicalNode
>;

function ImageNodeComponent({
  src,
  altText,
  width,
  height,
  caption,
}: {
  src: string;
  altText: string;
  width: number | 'inherit';
  height: number | 'inherit';
  caption: string;
}): React.JSX.Element {
  const style: React.CSSProperties = {
    maxWidth: '100%',
    width: width === 'inherit' ? 'auto' : `${width}px`,
    height: height === 'inherit' ? 'auto' : `${height}px`,
    display: 'block',
    margin: '0 auto',
  };

  const img = React.createElement('img', { src, alt: altText, style });
  const children: React.ReactNode[] = [img];

  if (caption) {
    children.push(
      React.createElement(
        'figcaption',
        {
          style: {
            fontSize: '12px',
            color: '#64748b',
            marginTop: '4px',
          },
        },
        caption,
      )
    );
  }

  return React.createElement(
    'figure',
    {
      style: {
        margin: '8px 0',
        textAlign: 'center',
      },
    },
    ...children,
  );
}

/**
 * Custom Lexical node for inline/block images inside rich text.
 * Renders as a contenteditable=false <figure> with optional caption.
 *
 * IMPORTANT: This is for images INSIDE a richTextBox's Lexical editor.
 * Top-level `imageBox` writer elements are separate (handled by writerCommands).
 */
export class ImageNode extends DecoratorNode<React.JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | 'inherit';
  __height: number | 'inherit';
  __caption: string;

  static getType(): string {
    return 'inline-image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__caption,
      node.__key,
    );
  }

  constructor(
    src: string,
    altText: string,
    width: number | 'inherit' = 'inherit',
    height: number | 'inherit' = 'inherit',
    caption: string = '',
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
    this.__caption = caption;
  }

  // ── Serialization ──────────────────────────────────────────────
  static importJSON(json: SerializedImageNode): ImageNode {
    return new ImageNode(
      json.src,
      json.altText,
      json.width,
      json.height,
      json.caption,
    );
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'inline-image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      caption: this.__caption,
    };
  }

  // ── DOM ────────────────────────────────────────────────────────
  createDOM(): HTMLElement {
    const figure = document.createElement('figure');
    figure.style.margin = '8px 0';
    figure.style.textAlign = 'center';
    figure.setAttribute('contenteditable', 'false');
    return figure;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = this.__src;
    img.alt = this.__altText;
    if (this.__width !== 'inherit') img.width = this.__width;
    if (this.__height !== 'inherit') img.height = this.__height;
    figure.appendChild(img);

    if (this.__caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = this.__caption;
      figure.appendChild(figcaption);
    }
    return { element: figure };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (domNode: HTMLElement) => {
          const img = domNode as HTMLImageElement;
          return {
            node: new ImageNode(
              img.src,
              img.alt || '',
              img.width || 'inherit',
              img.height || 'inherit',
            ),
          };
        },
        priority: 0,
      }),
    };
  }

  // ── Decorator (React render) ──────────────────────────────────
  decorate(): React.JSX.Element {
    return React.createElement(ImageNodeComponent, {
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      caption: this.__caption,
    });
  }

  // ── Mutation helpers ──────────────────────────────────────────
  setWidthHeight(width: number | 'inherit', height: number | 'inherit'): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  setCaption(caption: string): void {
    const writable = this.getWritable();
    writable.__caption = caption;
  }

  getSrc(): string {
    return this.__src;
  }
}

/**
 * Helper to create and insert an ImageNode.
 * Call inside editor.update(() => { ... })
 */
export function $createImageNode(
  src: string,
  altText: string,
  width?: number | 'inherit',
  height?: number | 'inherit',
  caption?: string,
): ImageNode {
  return new ImageNode(src, altText, width, height, caption);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
