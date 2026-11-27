import type { CadExtrudedMesh3D } from './types';

export type Pdf3DStreamFormat = 'u3d' | 'prc' | 'unknown';

export interface Pdf3DActivationSettings {
  activationWhen?: string;
  deactivationWhen?: string;
  interactiveState?: string;
  toolbarEnabled: boolean;
  navigationEnabled: boolean;
}

export interface Pdf3DViewPreset {
  name: string;
  cameraToWorld?: number[];
  centerOfOrbit?: number;
  projectionType?: 'perspective' | 'orthographic';
  fovDeg?: number;
  orthoScale?: number;
  backgroundColor?: [number, number, number];
  lightingScheme?: string;
}

export interface U3DBlockSummary {
  blockType: number;
  blockTypeHex: string;
  blockName: string;
  dataSize: number;
  metaDataSize: number;
  offset: number;
}

export interface U3DNodeSummary {
  name: string;
  parentName?: string;
  transform?: number[];
  resourceName?: string;
}

export interface U3DParseResult {
  isValidU3D: boolean;
  majorVersion: number;
  minorVersion: number;
  profileIdentifier: number;
  declarationSize: number;
  fileSize: number;
  characterEncoding: number;
  blocks: U3DBlockSummary[];
  nodes: U3DNodeSummary[];
  meshes: CadExtrudedMesh3D[];
  warnings: string[];
}

export interface PrcSectionSummary {
  name: string;
  compressed: boolean;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
}

export interface PrcInspectionResult {
  isValidPrc: boolean;
  minimalVersion: number;
  authoringVersion: number;
  fileStructureCount: number;
  headerSizeBytes: number;
  uuidsCount: number;
  sections: PrcSectionSummary[];
  extractedMeshes: CadExtrudedMesh3D[];
  warnings: string[];
}

export interface Pdf3DAnnotationRecord {
  id: string;
  pageNumber: number;
  name: string;
  rect: [number, number, number, number];
  format: Pdf3DStreamFormat;
  streamSubtype: string | null;
  streamByteLength: number;
  defaultView: Pdf3DViewPreset | null;
  views: Pdf3DViewPreset[];
  activation: Pdf3DActivationSettings;
  u3dDetails?: U3DParseResult;
  prcDetails?: PrcInspectionResult;
  meshes: CadExtrudedMesh3D[];
  warnings: string[];
}

export interface Pdf3DExtractResult {
  pageCount: number;
  annotationCount: number;
  annotations: Pdf3DAnnotationRecord[];
  warnings: string[];
}

export interface Pdf3DEmbedOptions {
  pageIndex?: number;
  annotationName?: string;
  rect?: [number, number, number, number];
  compressStream?: boolean;
  backgroundColor?: [number, number, number];
  viewName?: string;
  includeAppearancePreview?: boolean;
}
