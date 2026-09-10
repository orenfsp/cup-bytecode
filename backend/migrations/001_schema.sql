-- Схема БД «Отклик»

CREATE TABLE IF NOT EXISTS staff (
    id               BIGSERIAL PRIMARY KEY,
    login            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    role             TEXT NOT NULL CHECK (role IN ('operator','expert','admin')),
    specialist_group TEXT,
    voice_label      TEXT,                        -- как заявитель видит ответы: «Психолог», «Юрист»
    active_limit     INT  NOT NULL DEFAULT 10,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
    id           BIGSERIAL PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    is_free_text BOOLEAN NOT NULL DEFAULT FALSE,  -- пункт «не знаю, как назвать»
    sort_order   INT NOT NULL DEFAULT 0,
    active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Правило маршрутизации: категория -> группа специалистов + лимит нагрузки
CREATE TABLE IF NOT EXISTS routing_rules (
    id               BIGSERIAL PRIMARY KEY,
    category_id      BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    specialist_group TEXT NOT NULL,
    load_limit       INT NOT NULL DEFAULT 10,
    UNIQUE (category_id)
);

CREATE TABLE IF NOT EXISTS crisis_keywords (
    id      BIGSERIAL PRIMARY KEY,
    keyword TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    id                    BIGSERIAL PRIMARY KEY,
    track_hash            TEXT UNIQUE NOT NULL,   -- SHA-256(трек-номер + pepper); открытый номер не хранится
    applicant_type        TEXT NOT NULL CHECK (applicant_type IN ('student','parent','teacher')),
    category_id           BIGINT REFERENCES categories(id),
    suggested_category_id BIGINT REFERENCES categories(id),
    free_text             TEXT NOT NULL,
    clarifying_answers    JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'new',
    priority              TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('urgent','standard','low')),
    is_crisis             BOOLEAN NOT NULL DEFAULT FALSE,
    operator_id           BIGINT REFERENCES staff(id),
    assigned_expert_id    BIGINT REFERENCES staff(id),
    contact_info          TEXT,                   -- способ связи, оставленный заявителем (кризис). Отдельно от текста.
    reject_reason         TEXT,
    return_count          INT NOT NULL DEFAULT 0,
    rating                INT,
    rating_comment        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at           TIMESTAMPTZ,            -- принято оператором (распределено)
    first_response_at     TIMESTAMPTZ,            -- первый ответ эксперта
    closed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_expert ON tickets(assigned_expert_id);

CREATE TABLE IF NOT EXISTS attachments (
    id           BIGSERIAL PRIMARY KEY,
    ticket_id    BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    stored_name  TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Чат заявителя со специалистом (единый голос сервиса)
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_kind     TEXT NOT NULL CHECK (author_kind IN ('applicant','specialist')),
    author_staff_id BIGINT REFERENCES staff(id),
    voice_label     TEXT,                         -- «Специалист» / «Психолог» и т.п.
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Внутренние заметки (заявителю не видны)
CREATE TABLE IF NOT EXISTS internal_notes (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_staff_id BIGINT REFERENCES staff(id),
    author_name     TEXT,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Участники обращения (ответственный + соисполнители)
CREATE TABLE IF NOT EXISTS ticket_participants (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    staff_id      BIGINT NOT NULL REFERENCES staff(id),
    role_in_ticket TEXT NOT NULL DEFAULT 'collaborator' CHECK (role_in_ticket IN ('responsible','collaborator')),
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, staff_id)
);

-- Запросы на передачу обращения
CREATE TABLE IF NOT EXISTS transfers (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    requested_by  BIGINT REFERENCES staff(id),
    reason        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    from_expert_id BIGINT REFERENCES staff(id),
    to_expert_id  BIGINT REFERENCES staff(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ
);

-- Журнал действий (в т.ч. вмешательства администратора)
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
    actor_staff_id  BIGINT REFERENCES staff(id),
    actor_kind      TEXT NOT NULL,
    action          TEXT NOT NULL,
    details         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Жалобы на специалиста (видит только оператор)
CREATE TABLE IF NOT EXISTS complaints (
    id         BIGSERIAL PRIMARY KEY,
    ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    handled    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Активность специалистов в карточке (кто «сейчас здесь»)
CREATE TABLE IF NOT EXISTS ticket_presence (
    ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    staff_id   BIGINT NOT NULL REFERENCES staff(id),
    seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, staff_id)
);
