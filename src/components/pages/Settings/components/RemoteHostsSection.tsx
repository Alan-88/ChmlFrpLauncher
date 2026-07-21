import { LoaderCircle, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import type { RemoteHost } from "@/services/remoteHostService";
import { useRemoteHosts } from "../hooks/useRemoteHosts";
import { RemoteHostDialog } from "./RemoteHostDialog";

export function RemoteHostsSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<RemoteHost | null>(null);
  const {
    hosts,
    loading,
    testingId,
    deletingId,
    saveHost,
    testHost,
    deleteHost,
  } = useRemoteHosts();

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingHost(null);
  };

  const handleDelete = (host: RemoteHost) => {
    if (!window.confirm(`确定删除运行主机“${host.name}”吗？`)) return;
    void deleteHost(host);
  };

  const openAddDialog = () => {
    setEditingHost(null);
    setDialogOpen(true);
  };

  const openEditDialog = (host: RemoteHost) => {
    setEditingHost(host);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Server className="w-4 h-4" />
          <span>运行主机</span>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <Plus />
          添加主机
        </Button>
      </div>

      <div className="rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border/60">
          通过本机 SSH 启动远端 frpc。密码、私钥和端口等连接细节由系统 SSH
          配置管理。
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            加载运行主机…
          </div>
        ) : hosts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            还没有运行主机。添加后可先测试 SSH 与 frpc 是否可用。
          </div>
        ) : (
          hosts.map((host, index) => (
            <div key={host.id}>
              {index > 0 && <ItemSeparator />}
              <Item variant="outline" className="border-0">
                <ItemContent>
                  <ItemTitle>{host.name}</ItemTitle>
                  <ItemDescription className="text-xs font-mono">
                    {host.ssh_target} · {host.frpc_path}
                  </ItemDescription>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    工作目录：{host.work_dir}
                  </p>
                </ItemContent>
                <ItemActions className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void testHost(host)}
                    disabled={testingId === host.id || deletingId === host.id}
                  >
                    {testingId === host.id && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    测试
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEditDialog(host)}
                    disabled={deletingId === host.id}
                    aria-label={`编辑 ${host.name}`}
                    title="编辑"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(host)}
                    disabled={testingId === host.id || deletingId === host.id}
                    aria-label={`删除 ${host.name}`}
                    title="删除"
                  >
                    {deletingId === host.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 className="text-destructive" />
                    )}
                  </Button>
                </ItemActions>
              </Item>
            </div>
          ))
        )}
      </div>

      <RemoteHostDialog
        open={dialogOpen}
        host={editingHost}
        onOpenChange={closeDialog}
        onSaved={saveHost}
      />
    </div>
  );
}
