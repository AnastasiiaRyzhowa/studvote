# MIGRATION_GUIDE.md — совместимость моделей (Student ↔ Admin)

Этот документ описывает, как привести проект к **единому набору полей** для студенческого интерфейса и админ-панели, сохранив **обратную совместимость**.

## Что изменилось (факт по текущему репо)

### `User` (server)
- **Добавлено**:
  - Алиас `name` → `full_name` (virtual)
  - Дубли на верхнем уровне: `points`, `level`, `badges` (параллельно `student_data`)
  - Счётчики: `votes_count`, `polls_created_count`, `comments_count`
  - `last_login`
  - Синхронизация при `save` и при `findOneAndUpdate`/`findByIdAndUpdate` (чтобы `$inc student_data.points` также обновлял `points`)
- **Файл**: `server/src/models/User.js`

### `Poll` (server)
- **Добавлено**:
  - `allow_comments`
  - `target_count` (для охвата/админки)
  - `responses.comment`
  - `responses.student_metadata` (дубль `user_*` полей)
  - Дубли верхнего уровня: `discipline_name`, `group_id`, `group_name`, `date`, `topic`
  - Pre-save синхронизация `lessonContext → дубли` и автозаполнение `student_metadata`
- **Файл**: `server/src/models/Poll.js`

## Шаг 1. Обновление моделей

Убедитесь, что изменения применены в:
- `server/src/models/User.js`
- `server/src/models/Poll.js`

## Шаг 2. Обновление API (важные места)

### 2.1 `GET /api/auth/me`
- Используем `user.toPublicJSON()` и перед отдачей вызываем `user.syncPoints()` (best-effort).
- Файл: `server/src/controllers/authController.js`

### 2.2 `POST /api/polls/votes`
- Начисление баллов идёт через `$inc: {'student_data.points': reward}`.
- Благодаря middleware в `User` это автоматически синхронизирует `points`.
- Также инкрементируется `votes_count` (best-effort).
- Файл: `server/src/controllers/pollController.js`

## Шаг 3. (Опционально) Миграция существующих данных в MongoDB

Если у вас уже есть старые документы, рекомендуется один раз прогнать скрипт:

1) Создайте файл `server/src/scripts/migrateData.js`
2) Запустите:

```bash
cd server
node src/scripts/migrateData.js
```

Что должен делать скрипт (минимум):
- Для студентов:
  - если есть `student_data.points`, но нет `points` → выставить `points = student_data.points`, `level = student_data.level`
  - если нет `votes_count` → заполнить из `polls_participated.length` (если массив есть)
- Для опросов:
  - если есть `lessonContext`, но нет `discipline_name/group_id/group_name/date/topic` → заполнить
  - если у `responses` нет `student_metadata` → заполнить из `user_*` полей

## Шаг 4. Проверка совместимости (чек-лист)

### Студент
- `/dashboard`
  - показываются баллы (берутся из `student_data.points ?? points`)
  - показываются опросы active/completed
  - teacher-only опросы не показываются студенту

### Админ
- `/admin/users`
  - список пользователей открывается
  - баллы отображаются (из `student_data.points` или `points`)
- `/admin/polls/:id`
  - комментарии и `student_metadata.group` отображаются без `undefined`
- `/admin/polls/:id/edit`
  - `allow_comments` сохраняется в Mongo (поле существует в модели Poll)

## Шаг 5. Советы по именам полей (чтобы student/admin совпадали)

Используйте эти безопасные фоллбеки:
- Имя пользователя: `full_name || name`
- Баллы: `student_data.points ?? points ?? 0`
- Группа: `group_name || group`
- В poll responses:
  - комментарий: `comment || answers?.q6_comment || ''`
  - группа: `student_metadata.group || user_group_name || user_group`

