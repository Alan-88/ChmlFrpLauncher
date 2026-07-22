import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { RemoteHost } from "@/services/remoteHostService";
import type { RemoteRun, RunnerTarget } from "@/services/remoteRunnerService";
import type { TunnelProgress, UnifiedTunnel } from "../types";
import { useTunnelCardActions } from "../hooks/useTunnelCardActions";
import { TunnelCardContextMenu } from "./TunnelCardContextMenu";
import { TunnelRunnerSelector } from "./TunnelRunnerSelector";
import { getTunnelLinkInfo } from "./tunnelCardUtils";

interface TunnelCardProps {
  tunnel: UnifiedTunnel;
  isRunning: boolean;
  isToggling: boolean;
  progress: TunnelProgress | undefined;
  onToggle: (tunnel: UnifiedTunnel, enabled: boolean) => void;
  onRefresh: () => void;
  onEdit?: (tunnel: UnifiedTunnel) => void;
  runner: RunnerTarget;
  runnerHosts: RemoteHost[];
  remoteRun?: RemoteRun;
  onRunnerChange: (runner: RunnerTarget) => void;
}

export function TunnelCard({
  tunnel,
  isRunning,
  isToggling,
  progress,
  onToggle,
  onRefresh,
  onEdit,
  runner,
  runnerHosts,
  remoteRun,
  onRunnerChange,
}: TunnelCardProps) {
  const progressValue = progress?.progress ?? 0;
  const isError = progress?.isError ?? false;
  const isSuccess = progress?.isSuccess ?? false;

  const isCustom = tunnel.type === "custom";
  const isApi = tunnel.type === "api";
  const isNodeOffline = isApi && tunnel.data.nodestate !== "online";

  const linkInfo = getTunnelLinkInfo(tunnel);
  const {
    autoStartEnabled,
    mousePosition,
    closeMenu,
    handleContextMenu,
    handleCopyLink,
    handleDelete,
    handleToggleAutoStart,
  } = useTunnelCardActions({ tunnel, isNodeOffline, onRefresh });

  return (
    <div
      onContextMenu={handleContextMenu}
      className="group rounded-lg overflow-hidden transition-all bg-card"
    >
      <div className="w-full bg-muted/20">
        <Progress
          value={progressValue}
          className={`h-0.5 transition-colors ${
            isError
              ? "bg-destructive/20 [&>div]:bg-destructive"
              : isSuccess
                ? "bg-green-500/20 [&>div]:bg-green-500"
                : "opacity-0"
          } ${progressValue > 0 && progressValue < 100 ? "opacity-100" : ""}`}
        />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-foreground truncate text-sm">
                {tunnel.data.name}
              </h3>
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isApi && tunnel.data.nodestate !== "online"
                    ? "bg-red-500"
                    : isRunning
                      ? "bg-foreground"
                      : "bg-muted-foreground/30"
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground bg-muted/10 uppercase tracking-wider">
                {isCustom
                  ? tunnel.data.tunnel_type || "自定义"
                  : tunnel.data.type}
              </span>
              <span className="text-xs text-muted-foreground truncate flex items-center gap-1 opacity-80">
                {isApi ? tunnel.data.node : tunnel.data.server_addr || "-"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRunning}
                      disabled={isToggling || isNodeOffline}
                      onChange={(e) => onToggle(tunnel, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-9 h-5 rounded-full peer transition-colors duration-300 ${
                        isRunning
                          ? "bg-foreground"
                          : "bg-muted dark:bg-foreground/12"
                      } ${isToggling || isNodeOffline ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    ></div>
                    <div
                      className={`absolute left-[2px] top-[3px] w-3.5 h-3.5 bg-background rounded-full shadow-sm transition-transform duration-300 ${
                        isRunning ? "translate-x-[18px]" : ""
                      } ${isToggling || isNodeOffline ? "scale-90" : ""}`}
                    ></div>
                  </label>
                </TooltipTrigger>
                {isNodeOffline ? (
                  <TooltipContent side="top" className="text-xs">
                    此节点已离线
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {isApi ? (
            <>
              <div className="flex items-center justify-between text-xs group/item">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TunnelRunnerSelector
                    runner={runner}
                    hosts={runnerHosts}
                    run={remoteRun}
                    disabled={isRunning || isToggling}
                    onChange={onRunnerChange}
                  />
                </div>
                <span className="font-mono text-foreground/80 selection:bg-foreground/10">
                  {tunnel.data.localip}:{tunnel.data.nport}
                </span>
              </div>
              <div
                className="flex items-center justify-between text-xs cursor-pointer group/link hover:bg-muted/30 -mx-2 px-2 py-1 rounded transition-colors"
                onClick={(event) => void handleCopyLink(event, linkInfo.copy)}
              >
                <div className="flex items-center gap-2 text-muted-foreground group-hover/link:text-foreground transition-colors">
                  <span>链接</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-foreground/80 truncate max-w-[160px]">
                    {tunnel.data.type.toUpperCase() === "HTTP" ||
                    tunnel.data.type.toUpperCase() === "HTTPS"
                      ? tunnel.data.dorp
                      : `${tunnel.data.ip}:${tunnel.data.dorp}`}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TunnelRunnerSelector
                    runner={runner}
                    hosts={runnerHosts}
                    run={remoteRun}
                    disabled={isRunning || isToggling}
                    onChange={onRunnerChange}
                  />
                </div>
                <span className="font-mono text-foreground/80">
                  {tunnel.data.local_ip || "127.0.0.1"}:
                  {tunnel.data.local_port || "-"}
                </span>
              </div>
              <div
                className="flex items-center justify-between text-xs cursor-pointer group/link hover:bg-muted/30 -mx-2 px-2 py-1 rounded transition-colors"
                onClick={(event) => void handleCopyLink(event, linkInfo.copy)}
              >
                <div className="flex items-center gap-2 text-muted-foreground group-hover/link:text-foreground transition-colors">
                  <span>链接</span>
                </div>
                <span className="font-mono text-foreground/80 truncate max-w-[160px]">
                  {linkInfo.display}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <TunnelCardContextMenu
        position={mousePosition}
        tunnel={tunnel}
        isNodeOffline={isNodeOffline}
        autoStartEnabled={autoStartEnabled}
        onClose={closeMenu}
        onToggleAutoStart={handleToggleAutoStart}
        onEdit={onEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
