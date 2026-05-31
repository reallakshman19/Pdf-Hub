import { describe, it, expect } from 'vitest';
import { createEditor } from 'lexical';
import { ImageNode, $createImageNode, $isImageNode } from './ImageNode';

describe('ImageNode', () => {
  const editor = createEditor({
    nodes: [ImageNode],
  });

  it('has correct type identifier', () => {
    expect(ImageNode.getType()).toBe('inline-image');
  });

  it('serializes to JSON with all fields', () => {
    editor.update(() => {
      const node = new ImageNode(
        'data:image/png;base64,abc',
        'Test image',
        200,
        150,
        'A caption',
      );
      const json = node.exportJSON();

      expect(json.type).toBe('inline-image');
      expect(json.src).toBe('data:image/png;base64,abc');
      expect(json.altText).toBe('Test image');
      expect(json.width).toBe(200);
      expect(json.height).toBe(150);
      expect(json.caption).toBe('A caption');
    });
  });

  it('round-trips through importJSON', () => {
    editor.update(() => {
      const original = new ImageNode(
        'https://example.com/img.png',
        'Alt text',
        300,
        'inherit',
        'My caption',
      );
      const json = original.exportJSON();
      const restored = ImageNode.importJSON(json);

      expect(restored.getSrc()).toBe('https://example.com/img.png');
      expect(restored.exportJSON()).toEqual(json);
    });
  });

  it('$createImageNode creates valid instance', () => {
    editor.update(() => {
      const node = $createImageNode('src.png', 'alt');
      expect($isImageNode(node)).toBe(true);
      expect(node.getSrc()).toBe('src.png');
    });
  });

  it('$isImageNode returns false for non-image nodes', () => {
    expect($isImageNode(null)).toBe(false);
    expect($isImageNode(undefined)).toBe(false);
  });

  it('defaults width/height to inherit', () => {
    editor.update(() => {
      const node = new ImageNode('src.png', 'alt');
      const json = node.exportJSON();
      expect(json.width).toBe('inherit');
      expect(json.height).toBe('inherit');
    });
  });

  it('setWidthHeight mutates dimensions', () => {
    editor.update(() => {
      const node = new ImageNode('s.png', 'a');
      expect(typeof node.setWidthHeight).toBe('function');
      expect(typeof node.setCaption).toBe('function');
    });
  });
});
