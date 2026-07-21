import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  fetchUserInfo,
  getStoredUser,
  isAuthenticationError,
  saveStoredUser,
  type StoredUser,
  type UserInfo,
} from "@/services/api";
import { performLogout } from "@/services/logout";

function mergeUserInfo(user: StoredUser, userInfo: UserInfo): StoredUser {
  return {
    ...user,
    username: userInfo.username,
    usergroup: userInfo.usergroup,
    userimg: userInfo.userimg,
    usertoken: userInfo.usertoken,
    tunnelCount: userInfo.tunnelCount,
    tunnel: userInfo.tunnel,
  };
}

export function useUserSession() {
  const [user, setUserState] = useState<StoredUser | null>(() =>
    getStoredUser(),
  );
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const setUser = useCallback((nextUser: StoredUser | null) => {
    setUserState(nextUser);
    if (!nextUser) setUserInfo(null);
  }, []);
  const accessToken = user?.accessToken;

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const loadUserInfo = async () => {
      try {
        const userInfo = await fetchUserInfo();
        const currentUser = getStoredUser();
        if (!currentUser) throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
        const updatedUser = mergeUserInfo(currentUser, userInfo);
        saveStoredUser(updatedUser);

        if (cancelled) return;
        setUser(updatedUser);
        setUserInfo(userInfo);
      } catch (error) {
        if (cancelled) return;

        setUserInfo(null);
        if (isAuthenticationError(error)) {
          setUser(null);
          toast.error(AUTH_SESSION_EXPIRED_MESSAGE);
          void performLogout();
          return;
        }

        console.error("获取用户信息失败", error);
      }
    };

    void loadUserInfo();
    return () => {
      cancelled = true;
    };
  }, [accessToken, setUser]);

  return { user, userInfo, setUser };
}
