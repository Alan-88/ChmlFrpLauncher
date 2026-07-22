import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  remoteHostService,
  type RemoteHost,
} from "@/services/remoteHostService";
import {
  remoteRunnerService,
  type RemoteRun,
  type RunnerTarget,
} from "@/services/remoteRunnerService";
import { getTunnelKey, LOCAL_RUNNER } from "@/services/tunnelRunnerService";
import type { UnifiedTunnel } from "../types";

async function loadRunnerState() {
  return Promise.all([
    remoteRunnerService.getPreferences(),
    remoteHostService.getRemoteHosts(),
    remoteRunnerService.getRuns(),
  ]);
}

export function useTunnelRunners(onRemoteRunUpdate: () => void) {
  const [preferences, setPreferences] = useState<Record<string, RunnerTarget>>(
    {},
  );
  const [hosts, setHosts] = useState<RemoteHost[]>([]);
  const [runs, setRuns] = useState<RemoteRun[]>([]);

  const refresh = useCallback(async () => {
    const [nextPreferences, nextHosts, nextRuns] = await loadRunnerState();
    setPreferences(nextPreferences);
    setHosts(nextHosts);
    setRuns(nextRuns);
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitialState = async () => {
      try {
        const [nextPreferences, nextHosts, nextRuns] = await loadRunnerState();
        if (!active) return;
        setPreferences(nextPreferences);
        setHosts(nextHosts);
        setRuns(nextRuns);
      } catch (error) {
        console.error("加载运行主机状态失败:", error);
      }
    };

    void loadInitialState();

    let unlisten: (() => void) | undefined;
    void listen<RemoteRun[]>("remote-run-updated", (event) => {
      setRuns(event.payload);
      onRemoteRunUpdate();
    }).then((stop) => {
      unlisten = stop;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [onRemoteRunUpdate, refresh]);

  const getRunner = useCallback(
    (tunnel: UnifiedTunnel): RunnerTarget =>
      preferences[getTunnelKey(tunnel)] ?? LOCAL_RUNNER,
    [preferences],
  );

  const getRun = useCallback(
    (tunnel: UnifiedTunnel): RemoteRun | undefined =>
      runs.find((run) => run.tunnel_key === getTunnelKey(tunnel)),
    [runs],
  );

  const setRunner = useCallback(
    async (tunnel: UnifiedTunnel, runner: RunnerTarget) => {
      const tunnelKey = getTunnelKey(tunnel);
      await remoteRunnerService.setPreference(tunnelKey, runner);
      setPreferences((current) => ({ ...current, [tunnelKey]: runner }));
    },
    [],
  );

  return { hosts, getRunner, getRun, setRunner, refresh };
}
