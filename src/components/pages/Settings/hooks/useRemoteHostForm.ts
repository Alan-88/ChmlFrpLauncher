import { useEffect, useState } from "react";
import {
  remoteHostService,
  type RemoteHost,
  type RemoteHostInput,
} from "@/services/remoteHostService";
import { toast } from "sonner";

const EMPTY_INPUT: RemoteHostInput = {
  name: "",
  ssh_target: "",
  frpc_path: "",
  work_dir: "",
};

function getInput(host: RemoteHost | null): RemoteHostInput {
  if (!host) return EMPTY_INPUT;

  return {
    id: host.id,
    name: host.name,
    ssh_target: host.ssh_target,
    frpc_path: host.frpc_path,
    work_dir: host.work_dir,
  };
}

export function useRemoteHostForm(
  open: boolean,
  host: RemoteHost | null,
  onSaved: (host: RemoteHost) => void,
  onClose: () => void,
) {
  const [input, setInput] = useState<RemoteHostInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setInput(getInput(host));
  }, [host, open]);

  const updateInput = (field: keyof RemoteHostInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    try {
      setSaving(true);
      const savedHost = await remoteHostService.saveRemoteHost(input);
      onSaved(savedHost);
      toast.success(host ? "运行主机已更新" : "运行主机已添加");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存运行主机失败");
    } finally {
      setSaving(false);
    }
  };

  return { input, saving, updateInput, save };
}
