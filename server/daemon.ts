import { connectDaemon, type DaemonConnection } from "@factory/droid-sdk";

// A single daemon connection is shared across every chat. One `droid daemon`
// process multiplexes all sessions over one WebSocket, instead of spawning a
// subprocess per chat (the exec-mode model this replaced).
let connectionPromise: Promise<DaemonConnection> | null = null;

export function getConnection(): Promise<DaemonConnection> {
  if (!connectionPromise) {
    if (!process.env.FACTORY_API_KEY) {
      return Promise.reject(
        new Error(
          "FACTORY_API_KEY is not set. Add it to a .env file or the environment before starting the server."
        )
      );
    }
    const pending = connectDaemon({
      apiKey: process.env.FACTORY_API_KEY,
    });
    // Don't let a failed connect poison every future chat: drop the cached
    // promise on rejection so the next getConnection() retries.
    pending.catch(() => {
      if (connectionPromise === pending) {
        connectionPromise = null;
      }
    });
    connectionPromise = pending;
  }
  return connectionPromise;
}

export async function closeConnection(): Promise<void> {
  if (!connectionPromise) {
    return;
  }
  const pending = connectionPromise;
  connectionPromise = null;
  const connection = await pending;
  await connection.close();
}
