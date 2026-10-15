import Docker from "dockerode";
import { config } from "./config";

/** Single shared Docker Engine client. */
export const docker = new Docker(config.docker);

export async function isDockerReachable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

