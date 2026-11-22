import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const StampNode: React.FC<AnnotationNodeProps<'stamp'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart, pageRotation = 0, nativeAppearanceUrl,
}) => {
  const isCustom = annotation.data.nativeStampAppearanceKind !== 'generated'
    && (annotation.data?.stampStyle === 'custom' || Boolean(annotation.data?.hasCustomAppearance));
  // Generated stamps remain editable after reopening, so their live preview
  // must reflect current text and styles instead of a cached old appearance.
  const displayedAppearance = annotation.data.nativeStampAppearanceKind === 'generated' ? undefined : nativeAppearanceUrl;
  const stampName = annotation.data?.stampName ?? annotation.data?.name;
  const label = isCustom
    ? (stampName ? `[Stamp: ${String(stampName).replace(/^#/, '')}]` : 'Native Stamp')
    : (annotation.data?.text ?? 'APPROVED');

  const isTransparentBg = annotation.data?.backgroundColor === 'transparent';
  const bg = isTransparentBg
    ? 'transparent'
    : isCustom
      ? (annotation.data?.backgroundColor ?? 'rgba(238, 242, 255, 0.85)')
      : (annotation.data?.backgroundColor ?? '#fef2f2');
  const border = isCustom
    ? (annotation.data?.borderColor ?? '#6366f1')
    : (annotation.data?.borderColor ?? '#ef4444');
  const color = isCustom
    ? (annotation.data?.textColor ?? '#3730a3')
    : (annotation.data?.textColor ?? '#b91c1c');
  const sourcePageRotation = annotation.data.nativeCopySource
    ? (annotation.data.nativeAppearancePageRotation ?? pageRotation) : pageRotation;
  const isLiveGenerated = annotation.data.nativeStampAppearanceKind === 'generated'
    || (annotation.data.nativeStampAppearanceKind !== 'imported' && !isCustom);
  const basis = annotation.data.nativeStampBasisRotation ?? (annotation.data.nativeStampAppearanceKind === 'generated' ? 0 : pageRotation);
  const appearancePageRotation = isLiveGenerated
    ? ((pageRotation - basis) % 360 + 360) % 360 : sourcePageRotation;
  const sideways = ((appearancePageRotation % 180) + 180) % 180 === 90;
  const baseWidth = sideways ? rect.height : rect.width;
  const baseHeight = sideways ? rect.width : rect.height;
  const sourceAngle = annotation.data.nativeAppearanceRotation ?? 0;
  const radians = sourceAngle * Math.PI / 180;
  const appearanceWidth = Math.abs(Math.cos(radians)) * baseWidth + Math.abs(Math.sin(radians)) * baseHeight;
  const appearanceHeight = Math.abs(Math.sin(radians)) * baseWidth + Math.abs(Math.cos(radians)) * baseHeight;

  return (
    <div
      data-annotation-type="stamp"
      data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: rect.x + (rect.width - baseWidth) / 2,
        top: rect.y + (rect.height - baseHeight) / 2,
        width: baseWidth, height: baseHeight,
        opacity: annotation.data?.opacity ?? 1,
        background: displayedAppearance ? 'transparent' : bg,
        border: displayedAppearance ? 'none' : `2px ${isCustom ? 'dashed' : 'solid'} ${border}`,
        borderRadius: 4,
        color: color,
        fontSize: Math.max(9, (annotation.data?.fontSize ?? 13) * scale),
        fontWeight: 'bold',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: isSelected ? 'move' : 'pointer', pointerEvents: 'all',
        touchAction: 'none',
        transform: `rotate(${appearancePageRotation + (annotation.data?.rotation ?? 0)}deg)`,
        padding: displayedAppearance ? 0 : '2px 4px',
        textAlign: 'center',
        userSelect: 'none',
      }}
      title={isCustom ? `Native Stamp: ${stampName ?? 'Custom appearance preserved on save'}` : label}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      {displayedAppearance
        ? <img data-native-stamp-appearance src={displayedAppearance} alt="" draggable={false} style={{ position: 'absolute', left: '50%', top: '50%', width: appearanceWidth, height: appearanceHeight, transform: `translate(-50%, -50%) rotate(${-sourceAngle}deg)`, pointerEvents: 'none' }} />
        : <span className="truncate max-w-full">{label}</span>}
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
