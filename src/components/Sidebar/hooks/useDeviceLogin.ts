import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  createDeviceAuthorization,
  exchangeDeviceCodeForToken,
  loginWithAccessToken,
  saveStoredUser,
  type DeviceAuthorizationResponse,
  type StoredUser,
} from "@/services/api";

export function useDeviceLogin(
  onUserChange: (user: StoredUser | null) => void,
) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");
  const [authSession, setAuthSession] =
    useState<DeviceAuthorizationResponse | null>(null);
  const [authMessage, setAuthMessage] = useState("将在浏览器中打开授权页面");
  const pollingTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setPolling(false);
  };

  const resetLoginFlow = () => {
    stopPolling();
    setLoading(false);
    setError("");
    setAuthSession(null);
    setAuthMessage("将在浏览器中打开授权页面");
  };

  const closeLoginDialog = () => {
    setLoginOpen(false);
    resetLoginFlow();
  };

  const finishLogin = async (
    accessToken: string,
    options?: {
      refreshToken?: string;
      expiresIn?: number;
      tokenType?: string;
    },
  ) => {
    const authedUser = await loginWithAccessToken(accessToken, {
      refresh_token: options?.refreshToken,
      expires_in: options?.expiresIn,
      token_type: options?.tokenType,
    });

    saveStoredUser(authedUser, rememberMe ? "persistent" : "session");
    onUserChange(authedUser);
    stopPolling();
    closeLoginDialog();
  };

  const scheduleTokenPolling = (
    deviceCode: string,
    intervalSeconds: number,
  ) => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }

    pollingTimerRef.current = window.setTimeout(() => {
      void pollToken(deviceCode, intervalSeconds);
    }, intervalSeconds * 1000);
  };

  const pollToken = async (deviceCode: string, intervalSeconds: number) => {
    setPolling(true);
    try {
      const tokenResponse = await exchangeDeviceCodeForToken(deviceCode);

      if (tokenResponse.access_token) {
        await finishLogin(tokenResponse.access_token, {
          refreshToken: tokenResponse.refresh_token,
          expiresIn: tokenResponse.expires_in,
          tokenType: tokenResponse.token_type,
        });
        return;
      }

      if (tokenResponse.error === "authorization_pending") {
        setAuthMessage("请在浏览器中确认授权");
        scheduleTokenPolling(deviceCode, intervalSeconds);
        return;
      }

      if (tokenResponse.error === "slow_down") {
        const nextInterval = intervalSeconds + 5;
        setAuthMessage("连接受限，正在自动重试...");
        scheduleTokenPolling(deviceCode, nextInterval);
        return;
      }

      if (tokenResponse.error === "expired_token") {
        stopPolling();
        setError("这次设备授权已过期，请重新开始登录。");
        return;
      }

      if (tokenResponse.error === "access_denied") {
        stopPolling();
        setError("你已取消本次授权，请重新开始登录。");
        return;
      }

      throw new Error(
        tokenResponse.error_description ||
          tokenResponse.error ||
          "获取访问令牌失败",
      );
    } catch (error) {
      stopPolling();
      setError(error instanceof Error ? error.message : "登录失败");
    }
  };

  const openVerificationPage = async (
    session: DeviceAuthorizationResponse | null,
  ) => {
    if (!session) {
      setError("请先开始设备授权。");
      return;
    }

    const target =
      session.verification_uri_complete || session.verification_uri;
    if (!target) {
      setError("账户中心未返回可用的验证地址。");
      return;
    }

    if (session.user_code) {
      navigator.clipboard?.writeText(session.user_code).catch(() => undefined);
    }

    try {
      await openUrl(target);
      setAuthMessage("请在浏览器中完成授权");
    } catch {
      setAuthMessage("请手动打开验证页面完成授权");
    }
  };

  const startDeviceLogin = async () => {
    stopPolling();
    setLoading(true);
    setError("");
    setAuthMessage("正在获取授权信息...");

    try {
      const session = await createDeviceAuthorization();
      setAuthSession(session);
      await openVerificationPage(session);
      const intervalSeconds = Math.max(Number(session.interval || 5), 1);
      void pollToken(session.device_code, intervalSeconds);
    } catch (error) {
      stopPolling();
      setAuthSession(null);
      setError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginOpenChange = (open: boolean) => {
    setLoginOpen(open);
    if (!open) resetLoginFlow();
  };

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    };
  }, []);

  return {
    loginOpen,
    rememberMe,
    setRememberMe,
    loading,
    polling,
    error,
    authSession,
    authMessage,
    closeLoginDialog,
    handleLoginOpenChange,
    openVerificationPage,
    startDeviceLogin,
    stopPolling,
  };
}
