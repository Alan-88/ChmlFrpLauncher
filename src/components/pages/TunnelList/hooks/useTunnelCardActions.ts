import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteTunnel } from "@/services/api";
import { customTunnelService } from "@/services/customTunnelService";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";
import type { UnifiedTunnel } from "../types";

interface UseTunnelCardActionsProps {
  tunnel: UnifiedTunnel;
  isNodeOffline: boolean;
  onRefresh: () => void;
}

export function useTunnelCardActions({
  tunnel,
  isNodeOffline,
  onRefresh,
}: UseTunnelCardActionsProps) {
  const isApi = tunnel.type === "api";
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [mousePosition, setMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const loadAutoStartSetting = async () => {
      try {
        const enabled = await autoStartTunnelsService.isTunnelEnabled(
          isApi ? "api" : "custom",
          tunnel.data.id,
        );
        setAutoStartEnabled(enabled);
      } catch (error) {
        console.error("加载隧道自动启动设置失败:", error);
      }
    };

    void loadAutoStartSetting();
  }, [isApi, tunnel]);

  const closeMenu = useCallback(() => setMousePosition(null), []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const menuWidth = 160;
    const menuHeight = 140;
    setMousePosition({
      x:
        event.clientX + menuWidth > window.innerWidth
          ? event.clientX - menuWidth
          : event.clientX,
      y:
        event.clientY + menuHeight > window.innerHeight
          ? event.clientY - menuHeight
          : event.clientY,
    });
  }, []);

  const handleCopyLink = async (event: React.MouseEvent, link: string) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(link || "未知");
      toast.success("链接已复制");
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDelete = async () => {
    try {
      if (isApi) {
        await deleteTunnel(tunnel.data.id);
      } else {
        await customTunnelService.deleteCustomTunnel(tunnel.data.id);
      }
      toast.success("删除成功");
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除隧道失败";
      toast.error(message);
      console.error("删除隧道失败:", error);
    }
  };

  const handleToggleAutoStart = async () => {
    if (isNodeOffline) {
      toast.error("此节点已离线，无法设置自动启动");
      return;
    }

    try {
      const enabled = !autoStartEnabled;
      await autoStartTunnelsService.setTunnelEnabled(
        isApi ? "api" : "custom",
        tunnel.data.id,
        enabled,
      );
      setAutoStartEnabled(enabled);
      toast.success(
        enabled
          ? "已启用：启动软件时自动启动此隧道"
          : "已禁用：此隧道不会自动启动",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "设置失败";
      toast.error(message);
      console.error("设置隧道自动启动失败:", error);
    }
  };

  return {
    autoStartEnabled,
    mousePosition,
    closeMenu,
    handleContextMenu,
    handleCopyLink,
    handleDelete,
    handleToggleAutoStart,
  };
}
