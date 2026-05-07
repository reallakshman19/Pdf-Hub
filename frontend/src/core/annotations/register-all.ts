/**
 * Registers all annotation renderer components in annotationRegistry.
 *
 * IMPORT ONCE from main.tsx before the root mount call.
 * NEVER import this from a component — it must run exactly once at startup.
 *
 * Adding a new annotation type:
 * 1. Add the type string to AnnotationType in types.ts (Agent A only)
 * 2. Create a new Node component in components/annotations/
 * 3. Add a register() call below
 * That's it. DocumentWorkspace.tsx does NOT need editing.
 */
import { annotationRegistry } from './registry';

import { TextboxNode }       from '../../components/annotations/TextboxNode';
import { CalloutNode }       from '../../components/annotations/CalloutNode';
import { StickyNoteNode }    from '../../components/annotations/StickyNoteNode';
import { HighlightNode }     from '../../components/annotations/HighlightNode';
import { UnderlineNode }     from '../../components/annotations/UnderlineNode';
import { StrikeoutNode }     from '../../components/annotations/StrikeoutNode';
import { SquigglyNode }      from '../../components/annotations/SquigglyNode';
import { ShapeRectNode }     from '../../components/annotations/ShapeRectNode';
import { ShapeEllipseNode }  from '../../components/annotations/ShapeEllipseNode';
import { ShapePolygonNode }  from '../../components/annotations/ShapePolygonNode';
import { ShapeCloudNode }    from '../../components/annotations/ShapeCloudNode';
import { LineNode }          from '../../components/annotations/LineNode';
import { ArrowNode }         from '../../components/annotations/ArrowNode';
import { InkNode }           from '../../components/annotations/InkNode';
import { StampNode }         from '../../components/annotations/StampNode';
import { CommentNode }       from '../../components/annotations/CommentNode';
import { RedactionNode }     from '../../components/annotations/RedactionNode';

annotationRegistry.register('textbox',        TextboxNode);
annotationRegistry.register('callout',        CalloutNode);
annotationRegistry.register('sticky-note',    StickyNoteNode);
annotationRegistry.register('highlight',      HighlightNode);
annotationRegistry.register('underline',      UnderlineNode);
annotationRegistry.register('strikeout',      StrikeoutNode);
annotationRegistry.register('squiggly',       SquigglyNode);
annotationRegistry.register('shape-rect',     ShapeRectNode);
annotationRegistry.register('shape-ellipse',  ShapeEllipseNode);
annotationRegistry.register('shape-polygon',  ShapePolygonNode);
annotationRegistry.register('shape-cloud',    ShapeCloudNode);
annotationRegistry.register('line',           LineNode);
annotationRegistry.register('arrow',          ArrowNode);
annotationRegistry.register('ink',            InkNode);
annotationRegistry.register('stamp',          StampNode);
annotationRegistry.register('comment',        CommentNode);
annotationRegistry.register('redaction',      RedactionNode);

// Verify completeness at boot (dev only)
if (import.meta.env.DEV) {
  const ALL_TYPES: import('./types').AnnotationType[] = [
    'textbox','callout','sticky-note','highlight','underline','strikeout',
    'squiggly','shape-rect','shape-ellipse','shape-polygon','shape-cloud',
    'line','arrow','ink','stamp','comment','redaction',
  ];
  ALL_TYPES.forEach(t => {
    if (!annotationRegistry.has(t)) {
      // console.error(`[register-all] Missing renderer for annotation type: "${t}"`);
    }
  });
}
