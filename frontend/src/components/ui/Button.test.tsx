import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from './Button';

describe('Button component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies primary variant by default', () => {
    render(<Button>Test</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-blue-600');
  });

  it('applies destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-red-500');
  });

  it('applies sizes with responsive touch targets on mobile and desktop', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByRole('button');
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('md:h-8');
    expect(button.className).toContain('min-w-[44px]');
    expect(button.className).toContain('md:min-w-0');

    rerender(<Button size="md">Medium</Button>);
    button = screen.getByRole('button');
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('md:h-9');

    rerender(<Button size="lg">Large</Button>);
    button = screen.getByRole('button');
    expect(button.className).toContain('h-12');
    expect(button.className).toContain('md:h-10');

    rerender(<Button size="icon">Icon</Button>);
    button = screen.getByRole('button');
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('w-11');
    expect(button.className).toContain('md:h-9');
    expect(button.className).toContain('md:w-9');
  });
});
