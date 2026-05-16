import { render, screen } from '@testing-library/react';
import { DebugPage } from './DebugPage';
import { useLoggerStore } from '@/core/logger/store';

test('renders debug page with 4 tabs', () => {
  render(<DebugPage />);
  expect(screen.getByRole('heading', { name: /Debug Console/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /state/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /performance/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /system/i })).toBeInTheDocument();
});

test('renders log entries from store', () => {
  useLoggerStore.setState({
    entries: [
      { id: '1', level: 'info', source: 'system', message: 'App startup', timestamp: new Date().toISOString() },
    ]
  });
  
  render(<DebugPage />);
  expect(screen.getByText('App startup')).toBeInTheDocument();
  expect(screen.getByTestId('log-entry')).toBeInTheDocument();
});
