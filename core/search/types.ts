export interface TextHitGeometry {
  pageIndex: number;
  rects: { x: number; y: number; width: number; height: number }[];
}

export interface ActiveResultModel {
  query: string;
  totalHits: number;
  currentHitIndex: number;
  hits: TextHitGeometry[];
}
