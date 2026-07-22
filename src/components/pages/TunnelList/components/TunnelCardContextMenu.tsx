import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UnifiedTunnel } from "../types";

interface TunnelCardContextMenuProps {
  position: { x: number; y: number } | null;
  tunnel: UnifiedTunnel;
  isNodeOffline: boolean;
  autoStartEnabled: boolean;
  onClose: () => void;
  onToggleAutoStart: () => void;
  onEdit?: (tunnel: UnifiedTunnel) => void;
  onDelete: () => void;
}

export function TunnelCardContextMenu({
  position,
  tunnel,
  isNodeOffline,
  autoStartEnabled,
  onClose,
  onToggleAutoStart,
  onEdit,
  onDelete,
}: TunnelCardContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, position]);

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: position.x, top: position.y }}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                onClose();
                onToggleAutoStart();
              }}
              disabled={isNodeOffline}
              className={`focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none text-left ${
                isNodeOffline ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {autoStartEnabled ? "✓ " : ""}自动启动
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <p className="text-xs">
              {isNodeOffline
                ? "此节点已离线，无法设置自动启动"
                : autoStartEnabled
                  ? "已启用：启动软件时自动启动此隧道"
                  : "未启用：点击可开启启动软件时自动启动此隧道"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {onEdit && (
        <button
          onClick={() => {
            onClose();
            onEdit(tunnel);
          }}
          className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left"
        >
          编辑隧道
        </button>
      )}
      <ContextMenuSeparator />
      <button
        onClick={() => {
          onClose();
          onDelete();
        }}
        className="focus:bg-destructive/10 focus:text-destructive relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none text-destructive data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left"
      >
        删除隧道
      </button>
    </div>,
    document.body,
  );
}
