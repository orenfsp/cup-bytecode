-- Дополнительные возможности: push-подписки, эскалации, блокировка редактирования

-- Push-подписки без привязки к личности: привязаны к обращению (track_hash), не к человеку.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         BIGSERIAL PRIMARY KEY,
    ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, endpoint)
);

-- Эскалации во внешнее реагирование (в т.ч. правоохранительные органы).
CREATE TABLE IF NOT EXISTS escalations (
    id           BIGSERIAL PRIMARY KEY,
    ticket_id    BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    created_by   BIGINT REFERENCES staff(id),
    reason       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')),
    channel_token TEXT,                        -- одноразовый защищённый токен для внешней связи
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);

-- Эксклюзивная блокировка ввода: одновременно отвечает только один специалист.
CREATE TABLE IF NOT EXISTS ticket_edit_lock (
    ticket_id BIGINT PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    staff_id  BIGINT NOT NULL REFERENCES staff(id),
    locked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Флаг обращения, помеченного как требующее внешнего реагирования (для подсветки).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE;
