-- Стартовый набор категорий
INSERT INTO categories (slug, title, is_free_text, sort_order) VALUES
    ('bullying',        'Травля и оскорбления',        FALSE, 1),
    ('classmates',      'Конфликт с одноклассниками',  FALSE, 2),
    ('cyberbullying',   'Кибербуллинг',                FALSE, 3),
    ('pressure',        'Давление и угрозы',           FALSE, 4),
    ('teacher',         'Конфликт с учителем',         FALSE, 5),
    ('parents',         'Конфликт с родителями',       FALSE, 6),
    ('legal',           'Вопрос юридического характера', FALSE, 7),
    ('unknown',         'Не знаю, как это назвать',    TRUE,  99)
ON CONFLICT (slug) DO NOTHING;

-- Правила маршрутизации: категория -> группа специалистов + лимит нагрузки
INSERT INTO routing_rules (category_id, specialist_group, load_limit)
SELECT id,
       CASE slug
           WHEN 'bullying'      THEN 'psychologist'
           WHEN 'classmates'    THEN 'conflictologist'
           WHEN 'cyberbullying' THEN 'psychologist'
           WHEN 'pressure'      THEN 'psychologist'
           WHEN 'teacher'       THEN 'conflictologist'
           WHEN 'parents'       THEN 'social_teacher'
           WHEN 'legal'         THEN 'lawyer'
           ELSE 'psychologist'
       END,
       10
FROM categories
ON CONFLICT (category_id) DO NOTHING;

-- Кризисный словарь (достаточно ключевых слов, ML не требуется)
INSERT INTO crisis_keywords (keyword) VALUES
    ('суицид'), ('покончить с собой'), ('покончить'), ('не хочу жить'),
    ('нет смысла жить'), ('убить себя'), ('убью себя'), ('свести счёты'),
    ('свести счеты'), ('повеситься'), ('вскрыть вены'), ('таблетки выпить'),
    ('порезы'), ('режу себя'), ('самоубийств'), ('изнасил'), ('насилие'),
    ('избили'), ('избивают'), ('бьют'), ('бьёт'), ('бьет'), ('угрожают убить'),
    ('угрожает убить'), ('убьют'), ('с ножом'), ('оружие'), ('пистолет'),
    ('домогается'), ('домогательств'), ('не хочу больше жить'), ('хочу умереть'),
    ('лучше бы меня не было'), ('исчезнуть навсегда')
ON CONFLICT DO NOTHING;
