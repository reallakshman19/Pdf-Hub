import type { AnnotationType, AnnotationNodeProps } from './types';

/**
 * Registry for annotation renderer components.
 * Owner: Agent A creates shell; Agent B populates via register-all.ts.
 *
 * Design: throws on unregistered type so missing registrations
 * surface immediately at runtime, not as silent empty renders.
 */
export class AnnotationRendererRegistry {
  private readonly map = new Map<
    AnnotationType,
    React.FC<AnnotationNodeProps<AnnotationType>>
  >();

  register<T extends AnnotationType>(
    type: T,
    component: React.FC<AnnotationNodeProps<T>>,
  ): void {
    if (this.map.has(type)) {
      // console.warn(`[AnnotationRegistry] Re-registering type "${type}" — check register-all.ts`);
    }
    this.map.set(type, component as React.FC<AnnotationNodeProps<AnnotationType>>);
  }

  /**
   * Throws a descriptive error if the type is not registered.
   * Never returns undefined — the caller must never silently ignore a missing type.
   */
  get(type: AnnotationType): React.FC<AnnotationNodeProps<AnnotationType>> {
    const component = this.map.get(type);
    if (!component) {
      throw new Error(
        `[AnnotationRegistry] No renderer registered for type "${type}". ` +
        `Did you forget to call register-all.ts from main.tsx?`,
      );
    }
    return component;
  }

  has(type: AnnotationType): boolean {
    return this.map.has(type);
  }

  getRegisteredTypes(): AnnotationType[] {
    return Array.from(this.map.keys());
  }
}

// Singleton — imported by PageSurface and register-all.ts
export const annotationRegistry = new AnnotationRendererRegistry();