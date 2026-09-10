import { clearToken, getToken, setToken } from "./api";
import type { Staff } from "./types";

const STAFF_KEY = "otklik_staff";

export function saveSession(token: string, staff: Staff) {
  setToken(token);
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

export function getStaff(): Staff | null {
  const raw = localStorage.getItem(STAFF_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Staff;
  } catch {
    return null;
  }
}

export function isAuthed(): boolean {
  return !!getToken();
}

export function logout() {
  clearToken();
  localStorage.removeItem(STAFF_KEY);
}

export function homeForRole(role?: string): string {
  switch (role) {
    case "operator":
      return "/operator";
    case "expert":
      return "/expert";
    case "admin":
      return "/admin";
    default:
      return "/";
  }
}
