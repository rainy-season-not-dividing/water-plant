import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('displays error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('运行时错误')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('recovers when retry button is clicked', () => {
    let shouldThrow = true;
    function ConditionalChild() {
      if (shouldThrow) throw new Error('Recoverable error');
      return <div>已恢复</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('运行时错误')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('重试'));

    rerender(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('已恢复')).toBeInTheDocument();
  });
});
