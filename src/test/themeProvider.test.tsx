import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/ThemeProvider';
import { useTheme } from '@/hooks/useTheme';

let systemThemeChange: ((event: MediaQueryListEvent) => void) | undefined;
let systemMatches = false;

function ThemeProbe() {
  const { theme, setTheme } = useTheme();

  return <button onClick={() => setTheme('light')}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    systemThemeChange = undefined;
    systemMatches = false;

    vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: systemMatches,
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            systemThemeChange = listener;
          },
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    vi.restoreAllMocks();
  });

  it('applies and persists a saved theme without rendering a script', () => {
    localStorage.setItem('park-it-easy-theme', 'dark');

    const { container } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(container.querySelector('script')).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(localStorage.getItem('park-it-easy-theme')).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('follows system theme changes when system mode is selected', () => {
    systemMatches = true;

    const { container } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByRole('button')).toHaveTextContent('system');
    expect(document.documentElement).toHaveClass('dark');
    expect(container.querySelector('script')).toBeNull();

    act(() => systemThemeChange?.({ matches: false } as MediaQueryListEvent));

    expect(document.documentElement).not.toHaveClass('dark');
  });
});
