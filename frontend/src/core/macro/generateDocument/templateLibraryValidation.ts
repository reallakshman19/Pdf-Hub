import { GENERATION_TEMPLATES } from './generationRecipes';
import type { GenerationTemplate } from './generationTypes';

export interface TemplateValidationIssue {
  templateId: string;
  severity: 'error' | 'warning';
  message: string;
}

const SUPPORTED_RAW_TEMPLATE_OPS = new Set([
  'add_content_page',
  'add_image_header_page',
]);

const TEMPLATE_TOKEN_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function extractTemplateTokens(value: unknown): Set<string> {
  const tokens = new Set<string>();

  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      for (const match of node.matchAll(TEMPLATE_TOKEN_PATTERN)) {
        tokens.add(match[1]);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  };

  visit(value);
  return tokens;
}

export function validateGenerationTemplates(
  templates: GenerationTemplate[] = GENERATION_TEMPLATES,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const seenTemplateIds = new Set<string>();

  for (const template of templates) {
    const templateId = template.id || '<missing-id>';

    if (!template.id?.trim()) {
      issues.push({
        templateId,
        severity: 'error',
        message: 'Template id is required.',
      });
    } else if (seenTemplateIds.has(template.id)) {
      issues.push({
        templateId,
        severity: 'error',
        message: `Duplicate template id "${template.id}".`,
      });
    } else {
      seenTemplateIds.add(template.id);
    }

    if (!template.name?.trim()) {
      issues.push({
        templateId,
        severity: 'error',
        message: 'Template name is required.',
      });
    }

    if (!template.description?.trim()) {
      issues.push({
        templateId,
        severity: 'error',
        message: 'Template description is required.',
      });
    }

    if (!Array.isArray(template.fields) || template.fields.length === 0) {
      issues.push({
        templateId,
        severity: 'warning',
        message: 'Template has no fields.',
      });
    }

    const seenFieldKeys = new Set<string>();
    for (const field of template.fields ?? []) {
      if (!field.key?.trim()) {
        issues.push({
          templateId,
          severity: 'error',
          message: 'Field key is required.',
        });
        continue;
      }

      if (seenFieldKeys.has(field.key)) {
        issues.push({
          templateId,
          severity: 'error',
          message: `Duplicate field key "${field.key}".`,
        });
      }
      seenFieldKeys.add(field.key);

      if (!field.label?.trim()) {
        issues.push({
          templateId,
          severity: 'warning',
          message: `Field "${field.key}" has no label.`,
        });
      }

      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        issues.push({
          templateId,
          severity: 'error',
          message: `Select field "${field.key}" requires options.`,
        });
      }
    }

    if (!template.recipe || !Array.isArray(template.recipe.steps) || template.recipe.steps.length === 0) {
      issues.push({
        templateId,
        severity: 'error',
        message: 'Template recipe must contain at least one step.',
      });
      continue;
    }

    for (const step of template.recipe.steps) {
      if (!SUPPORTED_RAW_TEMPLATE_OPS.has(step.op)) {
        issues.push({
          templateId,
          severity: 'error',
          message: `Unsupported raw template op "${step.op}".`,
        });
      }
    }

    const tokens = extractTemplateTokens(template.recipe);

    if (tokens.size === 0) {
      issues.push({
        templateId,
        severity: 'warning',
        message: 'Template recipe has no {{variable}} tokens.',
      });
    }

    for (const field of template.fields ?? []) {
      if (field.key && !tokens.has(field.key)) {
        issues.push({
          templateId,
          severity: 'warning',
          message: `Field "${field.key}" is not used by any template token.`,
        });
      }
    }
  }

  return issues;
}

export function validateGenerationTemplateLibrary(): TemplateValidationIssue[] {
  return validateGenerationTemplates(GENERATION_TEMPLATES);
}
