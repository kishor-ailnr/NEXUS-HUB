import {
  NotificationItem,
  CreateNotificationDto,
  PrioritizedAlertItem,
  PrioritizedAlertsSummary,
  AlertLifecycleUpdateRequest,
} from '@nexus-ways/shared';
import { apiFetch } from '../lib/api';

export const notificationsService = {
  async getPrioritizedAlerts(
    filter: string = 'active',
  ): Promise<{ alerts: PrioritizedAlertItem[]; summary: PrioritizedAlertsSummary }> {
    return apiFetch<{ alerts: PrioritizedAlertItem[]; summary: PrioritizedAlertsSummary }>(
      `/notifications/prioritized-alerts?filter=${encodeURIComponent(filter)}`,
      { method: 'GET' },
    );
  },

  async updateAlertLifecycle(
    alertId: string,
    body: AlertLifecycleUpdateRequest,
  ): Promise<PrioritizedAlertItem> {
    const res = await apiFetch<{ alert: PrioritizedAlertItem }>(
      `/notifications/prioritized-alerts/${encodeURIComponent(alertId)}/lifecycle`,
      { method: 'PATCH', data: body },
    );
    return res.alert;
  },
  async getNotifications(): Promise<NotificationItem[]> {
    const res = await apiFetch<{ notifications: NotificationItem[] }>('/notifications', {
      method: 'GET',
    });
    return res.notifications || [];
  },

  async getUnreadCount(): Promise<number> {
    const res = await apiFetch<{ count: number }>('/notifications/unread-count', {
      method: 'GET',
    });
    return res.count || 0;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await apiFetch<{ notification: NotificationItem }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
    return res.notification;
  },

  async createNotification(dto: CreateNotificationDto): Promise<NotificationItem> {
    const res = await apiFetch<{ notification: NotificationItem }>('/notifications', {
      method: 'POST',
      data: dto,
    });
    return res.notification;
  },
};
