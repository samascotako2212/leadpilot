import { useState } from "react";
import { Notification, useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface NotificationDropdownProps {
  userId: number;
}

export function NotificationDropdown({ userId }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    isLoading,
    markRead,
    markAllRead,
    isMarkingRead,
    isMarkingAllRead,
  } = useNotifications(userId);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        className="relative"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <i className="fas fa-bell text-blue-600 text-xl" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500"></span>
        )}
      </button>
      {open && (
        <Card className="absolute right-0 mt-2 w-80 z-50 shadow-xl border border-border bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="font-semibold">Notifications</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={isMarkingAllRead || unreadCount === 0}
              onClick={() => markAllRead()}
            >
              Mark all as read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y">
            {isLoading ? (
              <div className="p-4 text-center text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${!n.read ? "bg-blue-50" : ""}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <span className={`mt-1 w-2 h-2 rounded-full ${n.read ? "bg-gray-300" : "bg-blue-500"}`}></span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {n.message}
                    </div>
                    <div className="text-xs text-gray-500 flex gap-2 mt-1">
                      <span>{n.type}</span>
                      <span className="capitalize">{n.priority}</span>
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {!n.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isMarkingRead}
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
