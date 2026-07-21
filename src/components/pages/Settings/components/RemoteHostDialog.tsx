import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RemoteHost } from "@/services/remoteHostService";
import { useRemoteHostForm } from "../hooks/useRemoteHostForm";

interface RemoteHostDialogProps {
  open: boolean;
  host: RemoteHost | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (host: RemoteHost) => void;
}

export function RemoteHostDialog({
  open,
  host,
  onOpenChange,
  onSaved,
}: RemoteHostDialogProps) {
  const { input, saving, updateInput, save } = useRemoteHostForm(
    open,
    host,
    onSaved,
    () => onOpenChange(false),
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{host ? "编辑运行主机" : "添加运行主机"}</DialogTitle>
          <DialogDescription>
            使用系统 SSH 配置或 SSH agent；启动器不会保存 SSH 密码或私钥。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="remote-host-name">名称</Label>
            <Input
              id="remote-host-name"
              value={input.name}
              onChange={(event) => updateInput("name", event.target.value)}
              placeholder="家用服务器"
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remote-host-ssh-target">SSH Host</Label>
            <Input
              id="remote-host-ssh-target"
              value={input.ssh_target}
              onChange={(event) =>
                updateInput("ssh_target", event.target.value)
              }
              placeholder="frp-server 或 user@example.com"
              disabled={saving}
              required
            />
            <p className="text-xs text-muted-foreground">
              推荐填写 ~/.ssh/config 中的 Host 别名；端口和密钥等配置继续由系统
              SSH 管理。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remote-host-frpc-path">远端 frpc 绝对路径</Label>
            <Input
              id="remote-host-frpc-path"
              value={input.frpc_path}
              onChange={(event) => updateInput("frpc_path", event.target.value)}
              placeholder="/opt/frp/frpc"
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="remote-host-work-dir">远端工作目录</Label>
            <Input
              id="remote-host-work-dir"
              value={input.work_dir}
              onChange={(event) => updateInput("work_dir", event.target.value)}
              placeholder="/var/lib/chmlfrp-launcher"
              disabled={saving}
              required
            />
            <p className="text-xs text-muted-foreground">
              用于保存后续远程运行的配置、PID 和日志；首次启动时会自动创建。
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
