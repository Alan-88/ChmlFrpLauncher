import { clearStoredUser } from "./api";
import { customTunnelService } from "./customTunnelService";
import { frpcManager } from "./frpcManager";
import { remoteRunnerService } from "./remoteRunnerService";

export async function stopAllRunningTunnels(): Promise<void> {
  try {
    await remoteRunnerService.stopAll();
  } catch (error) {
    console.error("停止远程隧道失败，将等待租约到期:", error);
  }

  try {
    const runningApiIds = await frpcManager.getRunningTunnels();
    await Promise.all(
      runningApiIds.map((id) =>
        frpcManager.stopTunnel(id).catch((error) => {
          console.error(`停止隧道失败 (api ${id}):`, error);
        }),
      ),
    );
  } catch (error) {
    console.error("获取运行中的隧道失败:", error);
  }

  try {
    const customTunnels = await customTunnelService.getCustomTunnels();
    await Promise.all(
      customTunnels.map(async (t) => {
        try {
          const running = await customTunnelService.isCustomTunnelRunning(t.id);
          if (running) {
            await customTunnelService.stopCustomTunnel(t.id);
          }
        } catch (error) {
          console.error(`停止自定义隧道失败 (${t.id}):`, error);
        }
      }),
    );
  } catch (error) {
    console.error("获取自定义隧道失败:", error);
  }
}

export async function performLogout(): Promise<void> {
  await stopAllRunningTunnels();
  clearStoredUser();
}
