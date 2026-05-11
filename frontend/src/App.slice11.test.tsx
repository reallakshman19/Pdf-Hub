import { describe, expect, it } from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';

describe('App slice 11 routing', () => {
  it('routes to macro builder page through hash route', () => {
    window.location.hash = '#/macro-builder';

    render(<App />);

    expect(screen.getByRole('main', { name: 'Macro builder page' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Macro recipe builder' })).toBeInTheDocument();
  });
});