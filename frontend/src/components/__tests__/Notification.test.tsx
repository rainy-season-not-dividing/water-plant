import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Notification } from '../Notification/Notification';
import type { NotificationItem } from '../../types/index';

const mockNotification: NotificationItem = {
  id: 'notif_1',
  agentId: 'dosing',
  title: '加药异常',
  description: '浊度超标',
  level: 'error',
  time: '10:00:00',
  autoDismissMs: 5000,
};

describe('Notification', () => {
  it('renders notification content', () => {
    render(
      <Notification
        notifications={[mockNotification]}
        onDismiss={vi.fn()}
        onOpenAgent={vi.fn()}
      />
    );

    expect(screen.getByText('加药异常')).toBeInTheDocument();
    expect(screen.getByText('浊度超标')).toBeInTheDocument();
    expect(screen.getByText('10:00:00')).toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <Notification
        notifications={[mockNotification]}
        onDismiss={onDismiss}
        onOpenAgent={vi.fn()}
      />
    );

    const dismissBtn = screen.getByLabelText('Dismiss 加药异常');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith('notif_1');
  });

  it('calls onOpenAgent and onDismiss when notification is clicked', () => {
    const onDismiss = vi.fn();
    const onOpenAgent = vi.fn();
    render(
      <Notification
        notifications={[mockNotification]}
        onDismiss={onDismiss}
        onOpenAgent={onOpenAgent}
      />
    );

    fireEvent.click(screen.getByText('加药异常'));
    expect(onOpenAgent).toHaveBeenCalledWith('dosing');
    expect(onDismiss).toHaveBeenCalledWith('notif_1');
  });

  it('renders nothing when notifications array is empty', () => {
    const { container } = render(
      <Notification
        notifications={[]}
        onDismiss={vi.fn()}
        onOpenAgent={vi.fn()}
      />
    );

    expect(container.querySelector('article')).toBeNull();
  });
});
