import { useEffect } from "react";
import { logStore } from "@/services/logStore";
import { remoteRunnerService } from "@/services/remoteRunnerService";

/**
 * 应用初始化逻辑 hook
 * 处理日志监听、进程守护等初始化工作
 */
export function useAppInitialization() {
  useEffect(() => {
    logStore.startListening();

    const initProcessGuard = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const guardEnabled =
          localStorage.getItem("processGuardEnabled") === "true";
        await invoke("set_process_guard_enabled", { enabled: guardEnabled });
      } catch (error) {
        console.error("Failed to initialize process guard:", error);
      }
    };

    initProcessGuard();
  }, []);

  useEffect(() => {
    let disposed = false;
    let syncing = false;

    const syncRemoteRuns = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await remoteRunnerService.syncRuns();
      } catch (error) {
        if (!disposed) {
          console.error("同步远程隧道状态失败:", error);
        }
      } finally {
        syncing = false;
      }
    };

    void syncRemoteRuns();
    const interval = window.setInterval(syncRemoteRuns, 45_000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);
}
