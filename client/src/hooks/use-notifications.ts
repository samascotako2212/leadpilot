import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  priority: string;
  expires_at?: string | null;
  metadata?: string | null;
  delivery_status: string;
}

export function useNotifications(userId: number) {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery<Notification[]>({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/notifications?limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 30000, // Poll every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/notifications/mark-read/${notificationId}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/notifications/mark-all-read`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  return {
    notifications: notificationsQuery.data || [],
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
    refetch: notificationsQuery.refetch,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
  isMarkingRead: markReadMutation.isPending,
  isMarkingAllRead: markAllReadMutation.isPending,
  };
}
