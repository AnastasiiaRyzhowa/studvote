const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { authenticate, authorize } = require('../../middleware/auth');

// Применяем middleware
router.use(authenticate);
router.use(authorize('admin'));

// GET /api/admin/users - получить список пользователей
router.get('/', async (req, res) => {
  try {
    const {
      faculty,
      program,
      course,
      group,
      status,
      role,
      search,
      page = 1,
      limit = 20
    } = req.query;
    
    // Построение фильтра
    const filter = {};
    
    if (faculty && faculty !== 'all') filter.faculty = faculty;
    if (program && program !== 'all') filter.program = program;
    if (course && course !== 'all') filter.course = parseInt(course);
    if (group && group !== 'all') filter.group = group;
    if (role && role !== 'all') filter.role = role;
    
    if (status && status !== 'all') {
      // Старые пользователи могли быть без поля is_active -> считаем их активными
      filter.is_active = status === 'active' ? { $ne: false } : false;
    }
    
    if (search) {
      filter.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Статистика
    const stats = {
      total: await User.countDocuments({}),
      active: await User.countDocuments({ is_active: { $ne: false } }),
      blocked: await User.countDocuments({ is_active: false }),
      students: await User.countDocuments({ role: 'student' }),
      admins: await User.countDocuments({ role: 'admin' })
    };
    
    // Получение пользователей с пагинацией
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const totalCount = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.json({
      success: true,
      users,
      stats,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения пользователей' });
  }
});

// GET /api/admin/users/filter-options - получить опции для фильтров
router.get('/filter-options', async (req, res) => {
  try {
    const faculties = await User.distinct('faculty', { role: 'student', faculty: { $exists: true, $ne: null } });
    const programs = await User.distinct('program', { role: 'student', program: { $exists: true, $ne: null } });
    const groups = await User.distinct('group', { role: 'student', group: { $exists: true, $ne: null } });
    const courses = [1, 2, 3, 4];
    
    res.json({
      success: true,
      faculties: faculties.filter(Boolean),
      programs: programs.filter(Boolean),
      groups: groups.filter(Boolean),
      courses
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения опций фильтров' });
  }
});

// GET /api/admin/users/export/xlsx - экспорт списка пользователей
router.get('/export/xlsx', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    
    const filter = {};
    
    // Применение фильтров из query (частично, остальное можно расширить)
    if (req.query.faculty && req.query.faculty !== 'all') {
      filter.faculty = req.query.faculty;
    }
    if (req.query.role && req.query.role !== 'all') {
      filter.role = req.query.role;
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.is_active = req.query.status === 'active' ? { $ne: false } : false;
    }
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
    
    // Формирование данных для Excel
    const data = users.map((user, idx) => ({
      '№': idx + 1,
      'ФИО': user.full_name,
      'Email': user.email,
      'Роль': user.role === 'admin' ? 'Администратор' : user.role === 'teacher' ? 'Преподаватель' : 'Студент',
      'Факультет': user.faculty || '-',
      'Программа': user.program || '-',
      'Курс': user.course || '-',
      'Группа': user.group || '-',
      'Баллы': user.student_data?.points ?? user.points ?? 0,
      'Статус': user.is_active === false ? 'Заблокирован' : 'Активен',
      'Дата регистрации': user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '-'
    }));
    
    // Создание Excel
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Пользователи');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ success: false, error: 'Ошибка экспорта' });
  }
});

// POST /api/admin/users - создать нового пользователя
router.post('/', async (req, res) => {
  try {
    const { email, name, role, faculty, program, course, group } = req.body;
    
    // Валидация
    if (!email || !name || !role) {
      return res.status(400).json({ success: false, error: 'Недостаточно данных' });
    }
    
    if (!email.endsWith('@edu.fa.ru')) {
      return res.status(400).json({ success: false, error: 'Email должен быть с доменом @edu.fa.ru' });
    }
    
    // Проверка на существование
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Пользователь с таким email уже существует' });
    }
    
    // Создание пользователя
    const user = new User({
      email,
      full_name: name,
      role,
      faculty: role === 'student' ? faculty : undefined,
      program: role === 'student' ? program : undefined,
      course: role === 'student' ? parseInt(course) : undefined,
      group: role === 'student' ? group : undefined,
      is_active: true
    });
    
    await user.save();
    
    res.status(201).json({ 
      success: true,
      message: 'Пользователь создан успешно',
      userId: user._id
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'Ошибка создания пользователя' });
  }
});

// GET /api/admin/users/:id - получить детали пользователя
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения пользователя' });
  }
});

// PUT /api/admin/users/:id - обновить пользователя
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
    
    // Обновление разрешенных полей
    const allowedFields = ['full_name', 'faculty', 'program', 'course', 'group'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });
    
    // Используем validateModifiedOnly для проверки только измененных полей
    await user.save({ validateModifiedOnly: true });
    
    res.json({ 
      success: true,
      message: 'Пользователь обновлен успешно',
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления пользователя' });
  }
});

// PUT /api/admin/users/:id/toggle-status - заблокировать/разблокировать
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
    
    // Проверка: нельзя заблокировать самого себя
    if (user._id.toString() === req.user.userId.toString()) {
      return res.status(400).json({ success: false, error: 'Нельзя заблокировать самого себя' });
    }
    
    // undefined (старые пользователи) считаем активными -> первое переключение блокирует
    user.is_active = user.is_active === false ? true : false;
    // Используем validateModifiedOnly для проверки только измененных полей
    await user.save({ validateModifiedOnly: true });
    
    res.json({ 
      success: true,
      message: `Пользователь ${user.is_active ? 'разблокирован' : 'заблокирован'} успешно`,
      is_active: user.is_active
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ success: false, error: 'Ошибка изменения статуса' });
  }
});

// PUT /api/admin/users/:id/toggle-admin - назначить/снять роль админа
router.put('/:id/toggle-admin', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }
    
    // Проверка: нельзя снять роль у самого себя
    if (user._id.toString() === req.user.userId.toString()) {
      return res.status(400).json({ success: false, error: 'Нельзя изменить роль самому себе' });
    }
    
    // Проверка: должен остаться хотя бы один админ
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: 'Должен остаться хотя бы один администратор' });
      }
    }
    
    user.role = user.role === 'admin' ? 'student' : 'admin';
    // Используем validateModifiedOnly для проверки только измененных полей
    await user.save({ validateModifiedOnly: true });
    
    res.json({ 
      success: true,
      message: `Роль ${user.role === 'admin' ? 'администратора назначена' : 'администратора снята'} успешно`,
      role: user.role
    });
  } catch (error) {
    console.error('Toggle admin role error:', error);
    res.status(500).json({ success: false, error: 'Ошибка изменения роли' });
  }
});

module.exports = router;
