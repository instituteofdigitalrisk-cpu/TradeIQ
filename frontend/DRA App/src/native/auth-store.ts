import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, setToken, clearToken } from "./api";
import type { BackendUser } from "./api";
import { firebaseAuth } from "../firebase";
import type { UserData } from "./types";

const USERS_KEY = "dra.studentProfiles";
const SESSION_KEY = "dra.activeStudentId";
let memoryUsers: UserData[] = [];
let memoryActiveStudentId = "";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

async function readUsers(): Promise<UserData[]> {
  if (!hasStorage()) {
    try {
      const stored = await AsyncStorage.getItem(USERS_KEY);
      memoryUsers = stored ? (JSON.parse(stored) as UserData[]) : [];
      return memoryUsers;
    } catch {
      return memoryUsers;
    }
  }
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) || "[]") as UserData[];
  } catch {
    return memoryUsers;
  }
}

async function writeUsers(users: UserData[]) {
  memoryUsers = users;
  if (!hasStorage()) {
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    return;
  }
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// DD/MM/YYYY → YYYY-MM-DD for the backend date_of_birth field
function parseDobToISO(dob: string): string | undefined {
  if (!dob) return undefined;
  const parts = dob.split("/");
  if (parts.length !== 3) return undefined;
  const [d, m, y] = parts;
  if (!d || !m || !y) return undefined;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function backendUserToUserData(u: BackendUser): UserData {
  return {
    studentId: u.user_id,
    fullName: u.full_name,
    email: u.email,
    university: u.university ?? "",
    yearOfStudy: u.year_of_study != null ? String(u.year_of_study) : "",
    age: "",
    dateOfBirth: "",
    phoneNumber: "",
    password: "",
  };
}

export async function generateStudentId() {
  const users = await readUsers();
  const year = "2026";
  const next =
    users.reduce((max, user) => {
      if (!user.studentId.startsWith(year) || user.studentId.length !== 12) return max;
      const sequence = Number(user.studentId.slice(4));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0) + 1;
  return `${year}${String(next).padStart(8, "0")}`;
}

export async function saveRegisteredUser(user: UserData): Promise<UserData> {
  const { user: backendUser, token } = await auth.register({
    full_name: user.fullName,
    email: user.email,
    password: user.password,
    age: user.age ? parseInt(user.age) : undefined,
    date_of_birth: parseDobToISO(user.dateOfBirth),
    phone_number: user.phoneNumber || undefined,
    university: user.university || undefined,
    year_of_study: user.yearOfStudy ? parseInt(user.yearOfStudy) : undefined,
  });

  setToken(token);
  const cachedUser = backendUserToUserData(backendUser);
  const existing = await readUsers();
  const deduped = existing.filter((u) => u.studentId !== cachedUser.studentId && u.email !== cachedUser.email);
  await writeUsers([...deduped, cachedUser]);
  await setActiveStudentId(cachedUser.studentId);
  return cachedUser;
}

// Note: signature changed — now accepts email instead of studentId to match /auth/login
export async function signInUser(email: string, password: string): Promise<UserData | null> {
  const { user: backendUser, token } = await auth.login(email, password);
  setToken(token);
  const cachedUser = backendUserToUserData(backendUser);
  const existing = await readUsers();
  const deduped = existing.filter((u) => u.studentId !== cachedUser.studentId);
  await writeUsers([...deduped, cachedUser]);
  await setActiveStudentId(cachedUser.studentId);
  return cachedUser;
}

export async function signInWithGoogle(): Promise<{ user: UserData; isNewUser: boolean }> {
  if (typeof window === "undefined") {
    throw new Error("Google sign-in is available in the web app.");
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(firebaseAuth, provider);
  const idToken = await result.user.getIdToken();
  const { user: backendUser, token, is_new_user } = await auth.google(idToken);

  setToken(token);
  const cachedUser = backendUserToUserData(backendUser);
  const existing = await readUsers();
  const deduped = existing.filter((u) => u.studentId !== cachedUser.studentId && u.email !== cachedUser.email);
  await writeUsers([...deduped, cachedUser]);
  await setActiveStudentId(cachedUser.studentId);

  return { user: cachedUser, isNewUser: is_new_user };
}

export async function setActiveStudentId(studentId: string) {
  memoryActiveStudentId = studentId;
  if (!hasStorage()) {
    await AsyncStorage.setItem(SESSION_KEY, studentId);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, studentId);
}

export async function getActiveUser(): Promise<UserData | null> {
  const activeId = hasStorage()
    ? window.localStorage.getItem(SESSION_KEY)
    : (await AsyncStorage.getItem(SESSION_KEY)) || memoryActiveStudentId;
  if (!activeId) return null;
  const users = await readUsers();
  return users.find((user) => user.studentId === activeId) || null;
}

export async function clearActiveUser() {
  clearToken();
  memoryActiveStudentId = "";
  if (!hasStorage()) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
}
