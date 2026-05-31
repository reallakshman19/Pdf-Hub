export interface RenderedPage {
  width: number;
  height: number;
  scale: number;
}

export interface RenderToken {
  cancel: () => Promise<void>;
  completed: Promise<void>;
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PageMetric {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}
