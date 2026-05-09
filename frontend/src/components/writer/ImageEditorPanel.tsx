import React, { useMemo, useState } from 'react';
import type {
  PlacedElement,
  WriterImageModel,
} from '@/core/writer/types';
import {
  createImageModel,
} from '@/core/writer/content-model';
import {
  syncElementContentFromModel,
} from '@/core/writer/content-serialization';
import {
  fileToWriterImageModel,
} from '@/core/writer/imageImport';
import {
  rotateImageBy,
  setImageAlt,
  setImageBorder,
  setImageCrop,
  setImageOpacity,
  setImageRotation,
} from '@/core/writer/imageTransforms';

export interface ImageEditorPanelProps {
  element: PlacedElement;
  onChange: (element: PlacedElement) => void;
  onClose?: () => void;
}

export const ImageEditorPanel: React.FC<ImageEditorPanelProps> = ({
  element,
  onChange,
  onClose,
}) => {
  const initialImage = useMemo(() => {
    if (element.contentModel?.kind === 'image') return element.contentModel;

    return createImageModel({
      src: element.content,
      mimeType: inferMimeType(element.content) ?? 'image/png',
      alt: element.name,
    });
  }, [element]);

  const [image, setImage] = useState<WriterImageModel>(initialImage);
  const [status, setStatus] = useState('');

  const commit = (nextImage: WriterImageModel) => {
    setImage(nextImage);
    onChange(
      syncElementContentFromModel({
        ...element,
        type: 'image',
        contentModel: nextImage,
        style: {
          ...element.style,
          opacity: nextImage.opacity,
          borderColor: nextImage.borderColor,
          borderWidth: nextImage.borderWidth,
        },
      }),
    );
  };

  const replaceImage = async (file: File) => {
    try {
      const nextImage = await fileToWriterImageModel(file);
      commit(nextImage);
      setStatus(`Loaded image: ${file.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      data-writer-allow-native-paste="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 p-3">
        <div>
          <div className="text-sm font-semibold">Image Editor</div>
          <div className="text-xs text-slate-500">
            {image.mimeType} · {image.naturalWidth ?? 0} × {image.naturalHeight ?? 0}
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            className="h-8 px-3 rounded bg-slate-100 dark:bg-slate-800 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4 p-3">
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-medium mb-1">Replace Image</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void replaceImage(file);
              }}
              className="text-xs"
            />
          </label>

          <Field label="Alt Text">
            <input
              value={image.alt ?? ''}
              onChange={(event) => commit(setImageAlt(image, event.target.value))}
              className="h-8 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
            />
          </Field>

          <Field label="Rotation">
            <div className="flex gap-2">
              <button
                type="button"
                className="h-8 px-2 rounded bg-slate-100 dark:bg-slate-800 text-xs"
                onClick={() => commit(rotateImageBy(image, -90))}
              >
                -90°
              </button>
              <input
                type="number"
                value={image.rotation ?? 0}
                onChange={(event) =>
                  commit(setImageRotation(image, Number(event.target.value) || 0))
                }
                className="h-8 w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
              />
              <button
                type="button"
                className="h-8 px-2 rounded bg-slate-100 dark:bg-slate-800 text-xs"
                onClick={() => commit(rotateImageBy(image, 90))}
              >
                +90°
              </button>
            </div>
          </Field>

          <Field label={`Opacity (${Math.round((image.opacity ?? 1) * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={image.opacity ?? 1}
              onChange={(event) => commit(setImageOpacity(image, Number(event.target.value)))}
              className="w-full"
            />
          </Field>

          <Field label="Border">
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={image.borderWidth ?? 0}
                onChange={(event) =>
                  commit(setImageBorder(image, { borderWidth: Number(event.target.value) || 0 }))
                }
                className="h-8 w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs"
              />
              <input
                type="color"
                value={image.borderColor && image.borderColor.startsWith('#') ? image.borderColor : '#111827'}
                onChange={(event) =>
                  commit(setImageBorder(image, { borderColor: event.target.value }))
                }
                className="h-8 w-12 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-1"
              />
            </div>
          </Field>

          <Field label="Crop normalized x/y/w/h">
            <div className="grid grid-cols-4 gap-1">
              {(['x', 'y', 'width', 'height'] as const).map((key) => (
                <input
                  key={key}
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={image.crop?.[key] ?? (key === 'width' || key === 'height' ? 1 : 0)}
                  onChange={(event) => {
                    const current = image.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                    commit(
                      setImageCrop(image, {
                        ...current,
                        [key]: Number(event.target.value),
                      }),
                    );
                  }}
                  className="h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1 text-xs"
                  title={key}
                />
              ))}
            </div>

            <button
              type="button"
              className="mt-2 h-8 px-2 rounded bg-slate-100 dark:bg-slate-800 text-xs"
              onClick={() => commit(setImageCrop(image, undefined))}
            >
              Reset Crop
            </button>
          </Field>

          {status && <div className="text-xs text-slate-500">{status}</div>}
        </div>

        <div className="flex items-center justify-center rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 min-h-[320px] overflow-hidden">
          {image.src ? (
            <img
              src={image.src}
              alt={image.alt ?? ''}
              style={{
                maxWidth: '90%',
                maxHeight: '90%',
                opacity: image.opacity ?? 1,
                transform: `rotate(${image.rotation ?? 0}deg)`,
                border: `${image.borderWidth ?? 0}px solid ${image.borderColor ?? 'transparent'}`,
                objectFit: 'contain',
              }}
            />
          ) : (
            <div className="text-sm text-slate-500">No image loaded.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function Field(props: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1">{props.label}</div>
      {props.children}
    </label>
  );
}

function inferMimeType(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const match = /^data:([^;,]+)[;,]/i.exec(src);
  return match?.[1];
}
