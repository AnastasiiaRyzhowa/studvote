# ✅ Автоматическое повышение уровня - исправлено

## 🎯 Проблема

**До:**
- Баллы начислялись через `$inc: { 'student_data.points': reward }`
- Level НЕ обновлялся автоматически
- Старая логика: каждые 100 баллов = +1 уровень (НЕ работала)

**После:**
- Level обновляется автоматически при начислении баллов
- Новая логика:
  - 0-99 баллов → Уровень 1
  - 100-249 баллов → Уровень 2
  - 250-499 баллов → Уровень 3
  - 500-999 баллов → Уровень 4
  - 1000+ баллов → Уровень 5

---

## 📝 Изменения

### 1. **User.js** - добавлен статический метод

```javascript
userSchema.statics.calculateLevel = function(points) {
  if (points < 100) return 1;
  if (points < 250) return 2;
  if (points < 500) return 3;
  if (points < 1000) return 4;
  return 5;
};
```

### 2. **pollController.js** - обновлены 2 места начисления баллов

**Было:**
```javascript
await User.findByIdAndUpdate(req.user.userId, {
  $inc: { 'student_data.points': reward }
});
```

**Стало:**
```javascript
const updatedUser = await User.findByIdAndUpdate(
  req.user.userId,
  { $inc: { 'student_data.points': reward } },
  { new: true }
);
if (updatedUser) {
  const newLevel = User.calculateLevel(updatedUser.student_data?.points || 0);
  if (updatedUser.student_data?.level !== newLevel) {
    await User.findByIdAndUpdate(req.user.userId, {
      $set: { 'student_data.level': newLevel }
    });
    console.log(`🎖️ Уровень обновлён: ${updatedUser.student_data?.level} → ${newLevel}`);
  }
}
```

### 3. **Vote.js** - обновлён hook для начисления баллов

Аналогичное изменение применено в `voteSchema.post('save')`.

### 4. **User.js addPoints()** - использует новую логику

```javascript
this.student_data.level = this.constructor.calculateLevel(this.student_data.points);
```

---

## 🧪 Тестирование

### 1. Проголосуй за опрос (reward_points = 10)

**Консоль backend должна показать:**
```
✅ Начислено 10 баллов
🎖️ Уровень обновлён: 1 → 1  (если ещё < 100 баллов)
```

### 2. Достигни 100 баллов

```
🎖️ Уровень обновлён: 1 → 2
```

### 3. Проверь в MongoDB

```javascript
db.users.findOne({ email: 'student@test.ru' })
// student_data.points: 110
// student_data.level: 2  ← автоматически обновлено!
```

---

## 📊 Таблица уровней

| Баллы     | Уровень |
|-----------|---------|
| 0-99      | 1       |
| 100-249   | 2       |
| 250-499   | 3       |
| 500-999   | 4       |
| 1000+     | 5       |

---

## 📁 Изменённые файлы

1. ✅ `/server/src/models/User.js` (добавлен `calculateLevel`, обновлён `addPoints`)
2. ✅ `/server/src/controllers/pollController.js` (2 места)
3. ✅ `/server/src/models/Vote.js` (hook)

---

## ✅ Готово

Теперь level обновляется автоматически при каждом начислении баллов! 🎖️
