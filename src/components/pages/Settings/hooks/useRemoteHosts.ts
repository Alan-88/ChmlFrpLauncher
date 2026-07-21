import { useCallback, useEffect, useState } from "react";
import {
  remoteHostService,
  type RemoteHost,
} from "@/services/remoteHostService";
import { toast } from "sonner";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useRemoteHosts() {
  const [hosts, setHosts] = useState<RemoteHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHosts = useCallback(async () => {
    try {
      setLoading(true);
      setHosts(await remoteHostService.getRemoteHosts());
    } catch (error) {
      toast.error(getErrorMessage(error, "加载运行主机失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  const saveHost = (savedHost: RemoteHost) => {
    setHosts((current) => {
      const existingIndex = current.findIndex(
        (host) => host.id === savedHost.id,
      );
      if (existingIndex === -1) return [savedHost, ...current];
      return current.map((host) =>
        host.id === savedHost.id ? savedHost : host,
      );
    });
  };

  const testHost = async (host: RemoteHost) => {
    try {
      setTestingId(host.id);
      const result = await remoteHostService.testRemoteHost(host.id);
      const detail = [result.host_name, result.frpc_version]
        .filter(Boolean)
        .join(" · ");
      const message = detail
        ? `${result.message}（${detail}）`
        : result.message;

      if (result.success) {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "检测运行主机失败"));
    } finally {
      setTestingId(null);
    }
  };

  const deleteHost = async (host: RemoteHost) => {
    try {
      setDeletingId(host.id);
      await remoteHostService.deleteRemoteHost(host.id);
      setHosts((current) => current.filter((item) => item.id !== host.id));
      toast.success("运行主机已删除");
    } catch (error) {
      toast.error(getErrorMessage(error, "删除运行主机失败"));
    } finally {
      setDeletingId(null);
    }
  };

  return {
    hosts,
    loading,
    testingId,
    deletingId,
    saveHost,
    testHost,
    deleteHost,
  };
}
