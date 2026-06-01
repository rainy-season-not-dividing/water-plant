import { describe, it, expect, beforeEach } from 'vitest';
import { useSystemStore } from '../useSystemStore';

describe('useSystemStore', () => {
  beforeEach(() => {
    useSystemStore.setState({
      eventLog: [],
      notifications: [],
      currentFps: 60,
      lodLevel: 'full',
      systemTime: '',
    });
  });

  describe('pushEvent', () => {
    it('adds an event to the log', () => {
      useSystemStore.getState().pushEvent({ time: '10:00', text: '浊度异常', type: 'warning' });
      const log = useSystemStore.getState().eventLog;
      expect(log).toHaveLength(1);
      expect(log[0].text).toBe('浊度异常');
      expect(log[0].type).toBe('warning');
    });

    it('prepends new events (newest first)', () => {
      useSystemStore.getState().pushEvent({ time: '10:00', text: 'first', type: 'info' });
      useSystemStore.getState().pushEvent({ time: '10:01', text: 'second', type: 'info' });
      const log = useSystemStore.getState().eventLog;
      expect(log[0].text).toBe('second');
      expect(log[1].text).toBe('first');
    });

    it('caps at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        useSystemStore.getState().pushEvent({ time: '10:00', text: `event ${i}`, type: 'info' });
      }
      expect(useSystemStore.getState().eventLog).toHaveLength(20);
    });
  });

  describe('pushNotification', () => {
    it('adds a notification', () => {
      useSystemStore.getState().pushNotification({
        agentId: 'dosing',
        title: '加药异常',
        description: '浊度超标',
        level: 'error',
        time: '10:00:00',
        autoDismissMs: 5000,
      });
      const notifs = useSystemStore.getState().notifications;
      expect(notifs).toHaveLength(1);
      expect(notifs[0].title).toBe('加药异常');
    });

    it('merges concurrent error notifications', () => {
      useSystemStore.getState().pushNotification({
        agentId: 'dosing',
        title: '加药异常',
        description: 'desc1',
        level: 'error',
        time: '10:00:00',
        autoDismissMs: 5000,
      });
      useSystemStore.getState().pushNotification({
        agentId: 'uf',
        title: '超滤异常',
        description: 'desc2',
        level: 'error',
        time: '10:00:01',
        autoDismissMs: 5000,
      });
      const notifs = useSystemStore.getState().notifications;
      expect(notifs).toHaveLength(1);
      expect(notifs[0].incidentCount).toBe(2);
      expect(notifs[0].agentId).toBe('supervisor');
    });
  });

  describe('dismissNotification', () => {
    it('removes a notification by id', () => {
      useSystemStore.getState().pushNotification({
        agentId: 'ro',
        title: 'test',
        description: 'desc',
        level: 'info',
        time: '10:00:00',
        autoDismissMs: 5000,
      });
      const id = useSystemStore.getState().notifications[0].id;
      useSystemStore.getState().dismissNotification(id);
      expect(useSystemStore.getState().notifications).toHaveLength(0);
    });
  });

  describe('clearEvents / clearNotifications', () => {
    it('clearEvents empties the log', () => {
      useSystemStore.getState().pushEvent({ time: '10:00', text: 'x', type: 'info' });
      useSystemStore.getState().clearEvents();
      expect(useSystemStore.getState().eventLog).toHaveLength(0);
    });

    it('clearNotifications empties notifications', () => {
      useSystemStore.getState().pushNotification({
        agentId: 'pump',
        title: 'x',
        description: 'y',
        level: 'warning',
        time: '10:00:00',
        autoDismissMs: 5000,
      });
      useSystemStore.getState().clearNotifications();
      expect(useSystemStore.getState().notifications).toHaveLength(0);
    });
  });

  describe('updateSystemTime', () => {
    it('updates the system time', () => {
      useSystemStore.getState().updateSystemTime('2024-01-01 12:00:00');
      expect(useSystemStore.getState().systemTime).toBe('2024-01-01 12:00:00');
    });
  });

  describe('updateFps', () => {
    it('sets LOD based on FPS thresholds', () => {
      useSystemStore.getState().updateFps(60);
      expect(useSystemStore.getState().lodLevel).toBe('full');

      useSystemStore.getState().updateFps(25);
      expect(useSystemStore.getState().lodLevel).toBe('lod1');

      useSystemStore.getState().updateFps(18);
      expect(useSystemStore.getState().lodLevel).toBe('lod2');

      useSystemStore.getState().updateFps(10);
      expect(useSystemStore.getState().lodLevel).toBe('lod3');
    });
  });
});
