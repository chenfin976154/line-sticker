
export type GridSize = '3x3' | '4x4';

export interface ImageMetadata {
  width: number;
  height: number;
  name: string;
  size: number;
}

export interface ProcessingState {
  isRemovingBackground: boolean;
  progress: number;
  isSlicing: boolean;
  isZipping: boolean;
}
