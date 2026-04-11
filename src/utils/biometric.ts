import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const CREDENTIAL_KEY = "parkdaddy.lastSignedInEmail";

export async function biometricAvailableAsync(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function rememberLastEmail(email: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CREDENTIAL_KEY, email);
  } catch {
    // non-fatal
  }
}

export async function getLastEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: "Use password",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
