import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const SESSION_KEY = "seif-study-os-mobile-session";
const apiBaseUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "https://seifstudy-ufsrnaxx.manus.space";

export type MobileSignInResult = { success: boolean; email?: string; sessionToken?: string; message?: string };

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function signIn(email: string, password: string) {
  const response = await fetch(`${apiBaseUrl}/api/private-auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client": "seif-study-os-mobile" },
    body: JSON.stringify({ email, password }),
  });
  const result = (await response.json()) as MobileSignInResult;
  if (!response.ok || !result.success || !result.sessionToken) {
    throw new Error(result.message ?? "بيانات الدخول غير صحيحة.");
  }
  await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  return result;
}

export async function signOut() {
  const token = await getSessionToken();
  await fetch(`${apiBaseUrl}/api/private-auth/sign-out`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => undefined);
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
