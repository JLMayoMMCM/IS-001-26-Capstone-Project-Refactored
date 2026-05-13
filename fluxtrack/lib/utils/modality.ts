import { createHash } from "crypto";

export type Modality = "f2f" | "blended" | "online";

export function requiresPhoto(m: Modality): boolean {
  return m === "f2f" || m === "blended";
}

export function requiresTeamsLink(m: Modality): boolean {
  return m === "online";
}

const TEAMS_RX = /^https:\/\/teams\.microsoft\.com\//i;

export function isValidTeamsLink(url: string): boolean {
  return TEAMS_RX.test(url.trim());
}

export function hashTeamsLink(url: string): string {
  return createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}
