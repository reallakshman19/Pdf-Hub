import type { MacroStepPath } from '../../../core/macro/builder/recipeBuilderState';

export function getChildParentPath(path: MacroStepPath): Array<number | 'then' | 'else'> {
  if (path.branch === 'root') {
    return [path.index];
  }

  return [
    ...path.parentPath,
    path.branch,
    path.index,
  ];
}
