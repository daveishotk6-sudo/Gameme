import Photon from "./photon-sdk.js";
import { DAY_MS, DAY_START } from "../game/daycycle";

const PUN_APP_ID = "d24bf2c0-bee9-42ea-91de-7c431ba4ccb0";
const CHAT_APP_ID = "5c1f76e3-6b4e-4166-84c1-79d8ee8a6485";
const REGION = "us";

const EV_POS = 1;
const EV_BLOCK = 2;

export type RemotePos = { x: number; y: number; z: number; yaw: number; name: string };
export type ChatStatus = "connecting" | "live" | "error";

type Handlers = {
  onStatus: (text: string) => void;
  onCount: (count: number) => void;
  onPos: (actor: number, pos: RemotePos) => void;
  onLeave: (actor: number) => void;
  onBlock: (x: number, y: number, z: number, id: number) => void;
  onChat: (from: string, text: string) => void;
  /** Chat connection state, with a human-readable reason when it is "error". */
  onChatStatus: (status: ChatStatus, detail?: string) => void;
};

export type PhotonLink = {
  block: (x: number, y: number, z: number, id: number) => void;
  say: (text: string) => void;
  move: (pos: RemotePos) => void;
  /** Shared time of day (0..1) from the room's server clock, or null until it is synced. */
  time: () => number | null;
  close: () => void;
};

/** Retry helper: 1s, 2s, 4s ... capped at 15s. Does nothing once closed. */
function makeRetry(connect: () => boolean, isClosed: () => boolean) {
  let tries = 0;
  let timer = 0;
  const retry = {
    schedule() {
      if (isClosed() || timer) return;
      const wait = Math.min(15000, 1000 * 2 ** tries++);
      timer = window.setTimeout(() => {
        timer = 0;
        if (isClosed()) return;
        if (!connect()) retry.schedule();
      }, wait);
    },
    reset() {
      tries = 0;
    },
    cancel() {
      window.clearTimeout(timer);
      timer = 0;
    },
  };
  return retry;
}

export function connectPhoton(room: string, name: string, h: Handlers): PhotonLink {
  const safe = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "world";
  const channel = "gameme-" + safe;
  const debug = /[?&]debug\b/.test(window.location.search);
  let closed = false;
  const isClosed = () => closed;
  // The "-xxxxx" suffix keeps userIds unique per connection; the UI strips it for display.
  const newUserId = () => name.slice(0, 12) + "-" + (Math.random().toString(36) + "00000").slice(2, 7);

  // ------------------------------------------------------------ rooms (movement, blocks, clock)
  const LBC = Photon.LoadBalancing.LoadBalancingClient;
  const others = Photon.LoadBalancing.Constants.ReceiverGroup.Others;
  const cache = Photon.LoadBalancing.Constants.EventCaching.AddToRoomCache;
  const client = new LBC(Photon.ConnectionProtocol.Wss, PUN_APP_ID, "1.0");
  if (debug) client.setLogLevel(Photon.LogLevel.INFO);

  const connectRoom = (): boolean => {
    client.setUserId(newUserId());
    return !!client.connectToRegionMaster(REGION);
  };
  const roomRetry = makeRetry(connectRoom, isClosed);
  let clockSeen = false;

  client.onStateChange = (state: number) => {
    const label = LBC.StateToName(state);
    if (state !== LBC.State.Joined) clockSeen = false;
    if (state === LBC.State.JoinedLobby) {
      client.myActor().setName(name.slice(0, 16));
      client.joinRoom(safe, { createIfNotExists: true }, { maxPlayers: 16 });
    }
    if (state === LBC.State.Joined) {
      roomRetry.reset();
      h.onCount(client.myRoomActorCount());
      client.syncServerTime(); // refresh the shared clock now that we're in the room
    }
    if (state === LBC.State.Error || state === LBC.State.Disconnected) {
      h.onStatus(closed ? label : "Reconnecting");
      roomRetry.schedule();
    } else if (state !== LBC.State.Joined) h.onStatus("Connecting");
    else h.onStatus("");
  };
  client.onError = (_code: number, msg: string) => h.onStatus(msg || "Photon error");
  client.onActorJoin = () => h.onCount(client.myRoomActorCount());
  client.onActorLeave = (actor: { actorNr: number }) => {
    h.onLeave(actor.actorNr);
    h.onCount(client.myRoomActorCount());
  };
  client.onEvent = (code: number, data: RemotePos & { id?: number }, actorNr: number) => {
    if (!data || actorNr === client.myActor().actorNr) return;
    if (code === EV_POS) h.onPos(actorNr, data);
    else if (code === EV_BLOCK && data.id != null) h.onBlock(data.x, data.y, data.z, data.id);
  };

  // ------------------------------------------------------------ chat
  const CS = Photon.Chat.ChatClient.ChatState;
  const chat = new Photon.Chat.ChatClient(Photon.ConnectionProtocol.Wss, CHAT_APP_ID, "1.0");
  if (debug) chat.setLogLevel(Photon.LogLevel.INFO);

  let chatLive = false;
  let subscribeTries = 0;
  let subscribedOnce = false;
  let subscribeTimer = 0;
  const outbox: string[] = []; // messages typed before the channel was ready

  const connectChat = (): boolean => {
    chat.setUserId(newUserId());
    return !!chat.connectToRegionFrontEnd(REGION);
  };
  const chatRetry = makeRetry(connectChat, isClosed);

  const subscribe = () => {
    if (closed || !chat.isConnectedToFrontEnd()) return;
    // Pull a little history the first time so late joiners see what was just said.
    chat.subscribe([channel], subscribedOnce ? undefined : 8);
  };
  const flush = () => {
    while (chatLive && outbox.length) chat.publishMessage(channel, outbox.shift()!);
  };

  chat.onStateChange = (state: number) => {
    if (state === CS.ConnectedToFrontEnd) {
      chatRetry.reset();
      subscribeTries = 0;
      h.onChatStatus("connecting");
      subscribe();
    } else if (state === CS.Error || state === CS.Disconnected) {
      chatLive = false;
      window.clearTimeout(subscribeTimer);
      if (!closed) {
        h.onChatStatus("error", "disconnected, retrying");
        chatRetry.schedule();
      }
    } else {
      h.onChatStatus("connecting");
    }
  };
  chat.onSubscribeResult = (results: Record<string, boolean>) => {
    if (results[channel]) {
      chatLive = true;
      subscribedOnce = true;
      h.onChatStatus("live");
      flush();
    } else if (++subscribeTries < 4) {
      subscribeTimer = window.setTimeout(subscribe, 1500 * subscribeTries);
    } else {
      h.onChatStatus("error", "could not join the chat channel");
    }
  };
  chat.onChatMessages = (_channel: string, messages: { getSender: () => string; getContent: () => string }[]) => {
    for (const message of messages) h.onChat(message.getSender(), String(message.getContent()));
  };
  // Photon's own error text (bad app id, CCU limit, etc.) is the most useful clue, so pass it through.
  chat.onError = (code: number, msg: string) => h.onChatStatus("error", msg || `error ${code}`);

  // ------------------------------------------------------------ go
  roomRetry.reset();
  connectRoom();
  connectChat();
  const resync = window.setInterval(() => client.syncServerTime(), 60000);

  return {
    block(x, y, z, id) {
      client.raiseEvent(EV_BLOCK, { x, y, z, id }, { receivers: others, cache });
    },
    say(text) {
      const t = text.trim().slice(0, 140);
      if (!t) return;
      if (chatLive && chat.publishMessage(channel, t)) return;
      outbox.push(t); // sent as soon as the channel is ready
      if (outbox.length > 5) outbox.shift();
    },
    move(pos) {
      client.raiseEvent(EV_POS, pos, { receivers: others });
    },
    time() {
      if (client.state() !== LBC.State.Joined) return null;
      if (!clockSeen) {
        if (!client.gamePeer?.serverTimeBaseLock) return null; // first ping hasn't answered yet
        clockSeen = true;
      }
      // Photon's server clock is the same for everyone in a room.
      const ms = client.getServerTimeMs() >>> 0;
      return ((ms % DAY_MS) / DAY_MS + DAY_START) % 1;
    },
    close() {
      closed = true;
      roomRetry.cancel();
      chatRetry.cancel();
      window.clearTimeout(subscribeTimer);
      window.clearInterval(resync);
      try {
        client.disconnect();
      } catch {
        /* already closed */
      }
      try {
        chat.disconnect();
      } catch {
        /* already closed */
      }
    },
  };
}
