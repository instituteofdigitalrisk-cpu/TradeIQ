import AsyncStorage from "@react-native-async-storage/async-storage";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export async function getTourSeen(key: string): Promise<boolean> {
  try {
    if (hasStorage()) return window.localStorage.getItem(key) === "1";
    return (await AsyncStorage.getItem(key)) === "1";
  } catch {
    return false;
  }
}

export async function setTourSeen(key: string): Promise<void> {
  try {
    if (hasStorage()) {
      window.localStorage.setItem(key, "1");
      return;
    }
    await AsyncStorage.setItem(key, "1");
  } catch {
    // best effort only
  }
}
