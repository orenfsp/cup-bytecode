// Подключение к WebSocket-комнате обращения для realtime-обновлений.

function wsBase(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

export interface RealtimeConn {
  close: () => void;
}

// Заявитель: подписка по трек-номеру.
export function connectApplicantWS(track: string, onEvent: () => void): RealtimeConn {
  return connect(`${wsBase()}/api/ws/track?track=${encodeURIComponent(track)}`, onEvent);
}

// Сотрудник: подписка по id обращения (токен в query, т.к. WS не шлёт заголовки).
export function connectStaffWS(ticketId: number, token: string, onEvent: () => void): RealtimeConn {
  return connect(`${wsBase()}/api/ws/ticket/${ticketId}?token=${encodeURIComponent(token)}`, onEvent);
}

function connect(url: string, onEvent: () => void): RealtimeConn {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: any = null;

  const open = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
      ws.onmessage = () => onEvent();
      ws.onclose = () => {
        if (!closed) retry = setTimeout(open, 3000); // авто-реконнект
      };
      ws.onerror = () => ws && ws.close();
    } catch {
      if (!closed) retry = setTimeout(open, 3000);
    }
  };
  open();

  return {
    close: () => {
      closed = true;
      clearTimeout(retry);
      ws && ws.close();
    },
  };
}
