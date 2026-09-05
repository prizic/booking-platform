export interface LoadedInstanceBrand {
  readonly path: string;
  readonly serialized: string;
}

export function loadInstanceBrand(appDirectory: string): LoadedInstanceBrand;
