import Photon from "./photon-sdk.js";

const PUN_APP_ID = "d24bf2c0-bee9-42ea-91de-7c431ba4ccb0";
const CHAT_APP_ID = "5c1f76e3-6b4e-4166-84c1-79d8ee8a6485";

const EV_POS = 1;
const EV_BLOCK = 2;

export type RemotePos = { x: number; y: number; z: number; yaw: number; name: string };

type Handlers = {
  onStatus: (text: string) => void;
  onCount: (count: number) => void;
  onPos: (actor: number, pos: RemotePos) => void;
  onLeave: (actor: number) => void;
  onBlock: (x: number, y: number, z: number, id: number) => void;
  onChat: (from: string, text: string) => void;
};

export type PhotonLink = {
  block: (x: number, y: number, z: number, id: number) => void;
  say: (text: string) => void;
  move: (pos: RemotePos) => void;
  close: () => void;
};

export function connectPhoton(room: string, name: string, handlers: Handlers): PhotonLink {
  const safe = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "world";
  const channel = "gameme-" + safe;
  const LBC = Photon.LoadBalancing.LoadBalancingClient;
  const others = Photon.LoadBalancing.Constants.ReceiverGroup.Others;
  const cache = Photon.LoadBalancing.Constants.EventCaching.AddToRoomCache;
  const client = new LBC(Photon.ConnectionProtocol.Wss, PUN_APP_ID, "1.0");
  const chat = new Photon.Chat.ChatClient(Photon.ConnectionProtocol.Wss, CHAT_APP_ID, "1.0");
  const userId = name.slice(0, 12) + "-" + Math.random().toString(36).slice(2, 7);
  client.setUserId(userId);
  chat.setUserId(userId);

  client.onStateChange = (state: number) => {
    const label = LBC.StateToName(state);
    if (state === LBC.State.JoinedLobby) {
      client.myActor().setName(name.slice(0, 16));
      client.joinRoom(safe, { createIfNotExists: true }, { maxPlayers: 16 });
    }
    if (state === LBC.State.Joined) handlers.onCount(client.myRoomActorCount());
    if (state === LBC.State.Error || state === LBC.State.Disconnected) handlers.onStatus(label);
    else if (state !== LBC.State.Joined) handlers.onStatus("Connecting");
    else handlers.onStatus("");
  };
  client.onError = (_code: number, msg: string) => handlers.onStatus(msg || "Photon error");
  client.onActorJoin = () => handlers.onCount(client.myRoomActorCount());
  client.onActorLeave = (actor: { actorNr: number }) => {
    handlers.onLeave(actor.actorNr);
    handlers.onCount(client.myRoomActorCount());
  };
  client.onEvent = (code: number, data: RemotePos & { id?: number }, actorNr: number) => {
    if (!data || actorNr === client.myActor().actorNr) return;
    if (code === EV_POS) handlers.onPos(actorNr, data);
    else if (code === EV_BLOCK && data.id != null) handlers.onBlock(data.x, data.y, data.z, data.id);
  };

  chat.onStateChange = (state: number) => {
    if (state === Photon.Chat.ChatClient.ChatState.ConnectedToFrontEnd) chat.subscribe([channel]);
  };
  chat.onChatMessages = (_channel: string, messages: { getSender: () => string; getContent: () => string }[]) => {
    for (const message of messages) handlers.onChat(message.getSender(), String(message.getContent()));
  };
  chat.onError = (_code: number, msg: string) => handlers.onStatus(msg || "Chat error");

  client.connectToRegionMaster("us");
  chat.connectToRegionFrontEnd("us");

  return {
    block(x, y, z, id) {
      client.raiseEvent(EV_BLOCK, { x, y, z, id }, { receivers: others, cache });
    },
    say(text) {
      chat.publishMessage(channel, text.slice(0, 140));
    },
    move(pos) {
      client.raiseEvent(EV_POS, pos, { receivers: others });
    },
    close() {
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
