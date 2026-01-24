const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');
const GroupReliabilityEvent = require('../models/GroupReliabilityEvent');
const { authenticate } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Middleware проверки роли админа
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Доступ запрещен. Требуются права администратора.' 
    });
  }
  next();
};

// Применяем authenticate и isAdmin ко всем маршрутам
router.use(authenticate);
router.use(isAdmin);

// GET /api/admin/analytics/quality-dashboard - Дашборд качества образования
router.get('/analytics/quality-dashboard', (req, res, next) => {
  console.log('📥 [Route] quality-dashboard запрос получен, query:', req.query);
  next();
}, adminController.getQualityDashboard);

// GET /api/admin/analytics/custom-polls-dashboard - Дашборд свободных опросов
router.get('/analytics/custom-polls-dashboard', adminController.getCustomPollsDashboard);

// GET /api/admin/analytics/descriptive-statistics - Описательная статистика
router.get('/analytics/descriptive-statistics', adminController.getDescriptiveStatistics);

// GET /api/admin/analytics/text-analysis - Текстовый анализ
router.get('/analytics/text-analysis', adminController.getTextAnalysis);

// GET /api/admin/analytics/comparative-analysis - Сравнительный анализ
router.get('/analytics/comparative-analysis', adminController.getComparativeAnalysis);

// GET /api/admin/analytics/technical-incidents - Технические инциденты
router.get('/analytics/technical-incidents', adminController.getTechnicalIncidents);

// GET /api/admin/stats - Общая статистика
router.get('/stats', async (req, res) => {
  try {
    // Подсчет пользователей
    const totalUsers = await User.countDocuments();
    
    // Подсчет по ролям
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const roleStats = {
      student: 0,
      teacher: 0,
      admin: 0
    };
    
    usersByRole.forEach(item => {
      roleStats[item._id] = item.count;
    });
    
    // Подсчет опросов
    const totalPolls = await Poll.countDocuments();
    const activePolls = await Poll.countDocuments({ status: 'active' });
    
    // Подсчет голосов
    const totalVotes = await Vote.countDocuments();
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPolls,
        totalVotes,
        activePolls,
        usersByRole: roleStats
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения статистики' 
    });
  }
});

// POST /api/admin/reliability/:groupId/event - Добавить событие надёжности (админ)
router.post('/reliability/:groupId/event', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { delta, reason = '', evidence_url = null } = req.body;

    const parsedDelta = Number(delta);
    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
      return res.status(400).json({
        success: false,
        message: 'delta должен быть ненулевым числом'
      });
    }

    const event = await GroupReliabilityEvent.create({
      group_id: groupId,
      delta: parsedDelta,
      reason,
      source: 'admin',
      actor_id: req.user.userId,
      evidence_url
    });

    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Ошибка добавления события надёжности:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка добавления события надёжности'
    });
  }
});

// GET /api/admin/users - Все пользователи
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ created_at: -1 })
      .lean();
    
    res.json({
      success: true,
      users
    });
    
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения пользователей' 
    });
  }
});

// GET /api/admin/filters - Списки для фильтров (из имеющихся данных)
router.get('/filters', async (req, res) => {
  try {
    const [
      faculties,
      programs,
      courses,
      groups,
      teachers,
      subjects
    ] = await Promise.all([
      User.distinct('faculty'),
      User.distinct('program'),
      User.distinct('course'),
      User.distinct('group'),
      User.find({ role: 'teacher' })
        .select('_id full_name department ruz_teacher_id')
        .lean(),
      Poll.distinct('subject_name')
    ]);

    res.json({
      success: true,
      filters: {
        faculties: faculties.filter(Boolean).sort(),
        programs: programs.filter(Boolean).sort(),
        courses: courses.filter(Boolean).sort(),
        groups: groups.filter(Boolean).sort(),
        teachers: teachers.map(t => ({
          id: t._id,
          name: t.full_name,
          department: t.department,
          ruz_teacher_id: t.ruz_teacher_id
        })),
        subjects: subjects.filter(Boolean).sort()
      }
    });
  } catch (error) {
    console.error('Ошибка получения фильтров:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения фильтров'
    });
  }
});

// GET /api/admin/analytics/group/:groupId - Агрегация по группе
router.get('/analytics/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { period = 'week' } = req.query;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (period === 'month' ? 30 : 7));

    // Число студентов в группе (для расчёта активности)
    const studentsCount = await User.countDocuments({
      role: 'student',
      $or: [
        { group: groupId },
        { group_id: groupId },
        { group_name: groupId }
      ]
    });

    // Ответы за период по группе
    const responses = await Poll.aggregate([
      { $unwind: '$responses' },
      {
        $match: {
          $and: [
            {
              $or: [
                { 'responses.user_group': groupId },
                { 'responses.user_group_name': groupId }
              ]
            },
            { 'responses.submitted_at': { $gte: startDate } }
          ]
        }
      },
      {
        $project: {
          answers: '$responses.answers',
          submitted_at: '$responses.submitted_at',
          user_id: '$responses.user_id',
          subject_name: '$subject_name',
          lesson_subject: '$lessonContext.subject',
          poll_type: '$type',
          teacher_name: '$teacher_name',
          poll_title: '$title'
        }
      }
    ]);

    const uniqueRespondents = new Set();
    const numericScores = [];
    const disciplineStats = {};
    const comments = [];
    const trendBuckets = new Map();

    const extractNumbers = (answer) => {
      if (typeof answer === 'number') return [answer];
      if (answer && typeof answer === 'object') {
        return Object.values(answer)
          .filter(v => typeof v === 'number')
          .map(v => v);
      }
      return [];
    };

    const maybePushComment = (answer) => {
      if (typeof answer === 'string' && answer.trim().length > 3) {
        comments.push(answer.trim());
      } else if (answer && typeof answer === 'object') {
        Object.values(answer).forEach(v => {
          if (typeof v === 'string' && v.trim().length > 3) {
            comments.push(v.trim());
          }
        });
      }
    };

    const getWeekKey = (date) => {
      const d = new Date(date);
      const onejan = new Date(d.getFullYear(), 0, 1);
      const millis = d - onejan;
      const day = 86400000;
      const week = Math.ceil(((millis / day) + onejan.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${week}`;
    };

    responses.forEach((resp) => {
      if (resp.user_id) uniqueRespondents.add(resp.user_id.toString());

      const nums = extractNumbers(resp.answers);
      nums.forEach(n => numericScores.push(n));

      maybePushComment(resp.answers);

      const disciplineName = resp.subject_name || resp.lesson_subject || 'Без дисциплины';
      if (!disciplineStats[disciplineName]) {
        disciplineStats[disciplineName] = { count: 0, scores: [] };
      }
      disciplineStats[disciplineName].count += 1;
      disciplineStats[disciplineName].scores.push(...nums);

      const weekKey = getWeekKey(resp.submitted_at);
      trendBuckets.set(weekKey, (trendBuckets.get(weekKey) || 0) + 1);
    });

    const activityPercent = studentsCount > 0
      ? Math.round((uniqueRespondents.size / studentsCount) * 100)
      : null;

    const averageScore = numericScores.length > 0
      ? parseFloat((numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1))
      : null;

    const disciplines = Object.entries(disciplineStats).map(([name, data]) => ({
      name,
      responses: data.count,
      averageScore: data.scores.length > 0
        ? parseFloat((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1))
        : null
    })).sort((a, b) => (b.responses || 0) - (a.responses || 0));

    // Тренд по неделям (последние 6 недель)
    const trend = Array.from(trendBuckets.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-6)
      .map(([label, value]) => ({ label, value }));

    // Надёжность группы из событий
    const reliabilityEvents = await GroupReliabilityEvent.find({ group_id: groupId })
      .sort({ created_at: 1 })
      .lean();
    const reliabilityScore = reliabilityEvents.reduce((acc, ev) => acc + (ev.delta || 0), 100);
    const reliabilityHistory = reliabilityEvents.slice(-10).map(ev => ({
      date: ev.created_at,
      delta: ev.delta,
      reason: ev.reason,
      source: ev.source,
      actor_id: ev.actor_id
    }));

    res.json({
      success: true,
      analytics: {
        groupId,
        period,
        studentsCount,
        sampleSize: uniqueRespondents.size,
        activityPercent,
        averageScore,
        disciplines,
        trend,
        reliability: {
          score: reliabilityScore,
          history: reliabilityHistory
        },
        comments: comments.slice(-30) // последние 30 комментов
      }
    });
  } catch (error) {
    console.error('Ошибка получения аналитики по группе:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения аналитики по группе'
    });
  }
});

// DELETE /api/admin/polls/:id - Удалить опрос
router.delete('/polls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const poll = await Poll.findById(id);
    
    if (!poll) {
      return res.status(404).json({ 
        success: false, 
        message: 'Опрос не найден' 
      });
    }
    
    // Удаляем все голоса связанные с опросом
    await Vote.deleteMany({ poll_id: id });
    
    // Удаляем опрос
    await Poll.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Опрос успешно удален'
    });
    
  } catch (error) {
    console.error('Ошибка удаления опроса:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка удаления опроса' 
    });
  }
});

// POST /api/admin/export/excel - Экспорт в Excel
router.post('/export/excel', async (req, res) => {
  try {
    const { filters = {}, type = 'analytics' } = req.body;
    const XLSX = require('xlsx');
    
    let data = [];
    let sheetName = 'Аналитика';
    
    if (type === 'analytics' || type === 'quality') {
      // Получаем данные ИКОП по дисциплинам
      const matchStage = { pollType: 'lesson_review' };
      
      // ✅ ОБНОВЛЕНО: Фильтруем по полям на уровне Poll
      if (filters.faculty && filters.faculty !== 'all') {
        matchStage.faculty = filters.faculty;
      }
      if (filters.program && filters.program !== 'all') {
        matchStage.program = filters.program;
      }
      if (filters.course && filters.course !== 'all') {
        matchStage.course = parseInt(filters.course);
      }
      if (filters.discipline && filters.discipline !== 'all') {
        matchStage.subject_name = filters.discipline;
      }
      if (filters.dateFrom || filters.dateTo) {
        matchStage.created_at = {};
        if (filters.dateFrom) matchStage.created_at.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) matchStage.created_at.$lte = new Date(filters.dateTo);
      }
      
      const polls = await Poll.find(matchStage).lean();
      
      // Группируем по дисциплинам
      const subjectStats = {};
      polls.forEach(poll => {
        const subject = poll.subject_name || poll.lessonContext?.subject || 'Не указано';
        if (!subjectStats[subject]) {
          subjectStats[subject] = { votes: 0, Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q5: 0 };
        }
        
        (poll.responses || []).forEach(response => {
          subjectStats[subject].votes++;
          ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].forEach(q => {
            subjectStats[subject][q] += response.answers?.[q] || 0;
          });
        });
      });
      
      // Формируем данные для Excel
      data = Object.entries(subjectStats).map(([subject, stats]) => {
        if (stats.votes === 0) return null;
        
        const avgQ1 = stats.Q1 / stats.votes;
        const avgQ2 = stats.Q2 / stats.votes;
        const avgQ3 = stats.Q3 / stats.votes;
        const avgQ4 = stats.Q4 / stats.votes;
        const avgQ5 = stats.Q5 / stats.votes;
        const avgAll = (avgQ1 + avgQ2 + avgQ3 + avgQ4 + avgQ5) / 5;
        const ikop = ((avgAll - 1) / 4) * 100;
        
        return {
          'Дисциплина': subject,
          'Кол-во оценок': stats.votes,
          'Q1 (Актуальность)': avgQ1.toFixed(2),
          'Q2 (Понятность)': avgQ2.toFixed(2),
          'Q3 (Практика)': avgQ3.toFixed(2),
          'Q4 (Вовлечённость)': avgQ4.toFixed(2),
          'Q5 (Организация)': avgQ5.toFixed(2),
          'Средняя оценка': avgAll.toFixed(2),
          'ИКОП': ikop.toFixed(1)
        };
      }).filter(Boolean);
      
      sheetName = 'ИКОП по дисциплинам';
    }
    
    if (type === 'users') {
      const users = await User.find({ role: 'student', is_active: true })
        .select('full_name email group faculty program course student_data.points student_data.level votes_count')
        .lean();
      
      data = users.map(u => ({
        'ФИО': u.full_name,
        'Email': u.email,
        'Группа': u.group || 'Не указано',
        'Факультет': u.faculty || 'Не указано',
        'Программа': u.program || 'Не указано',
        'Курс': u.course || 'Не указано',
        'Баллы': u.student_data?.points || 0,
        'Уровень': u.student_data?.level || 1,
        'Голосований': u.votes_count || 0
      }));
      
      sheetName = 'Студенты';
    }
    
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Нет данных для экспорта'
      });
    }
    
    // Создаём Excel файл
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Автоширина колонок
    const maxWidth = 50;
    const columnWidths = Object.keys(data[0] || {}).map(key => {
      const maxLength = Math.max(
        key.length,
        ...data.map(row => String(row[key] || '').length)
      );
      return { wch: Math.min(maxLength + 2, maxWidth) };
    });
    worksheet['!cols'] = columnWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Генерируем buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=export_${Date.now()}.xlsx`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Ошибка экспорта в Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка экспорта в Excel'
    });
  }
});

// POST /api/admin/export/pdf/:type - Экспорт в PDF
router.post('/export/pdf/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'summary' or 'detailed'
    const { filters = {} } = req.body;
    const PDFDocument = require('pdfkit');
    
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report_${type}_${Date.now()}.pdf`);
    
    doc.pipe(res);
    
    // Заголовок
    doc.fontSize(20).text('Отчёт по качеству образования', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Тип: ${type === 'summary' ? 'Сводный' : 'Детальный'}`, { align: 'center' });
    doc.text(`Дата: ${new Date().toLocaleDateString('ru-RU')}`, { align: 'center' });
    doc.moveDown(2);
    
    // Фильтры
    if (filters.faculty || filters.program || filters.discipline) {
      doc.fontSize(14).text('Применённые фильтры:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      if (filters.faculty && filters.faculty !== 'all') {
        doc.text(`• Факультет: ${filters.faculty}`);
      }
      if (filters.program && filters.program !== 'all') {
        doc.text(`• Программа: ${filters.program}`);
      }
      if (filters.discipline && filters.discipline !== 'all') {
        doc.text(`• Дисциплина: ${filters.discipline}`);
      }
      doc.moveDown();
    }
    
    // Получаем данные
    const matchStage = { pollType: 'lesson_review' };
    
    // ✅ ОБНОВЛЕНО: Фильтруем по полям на уровне Poll
    if (filters.faculty && filters.faculty !== 'all') {
      matchStage.faculty = filters.faculty;
    }
    if (filters.program && filters.program !== 'all') {
      matchStage.program = filters.program;
    }
    if (filters.course && filters.course !== 'all') {
      matchStage.course = parseInt(filters.course);
    }
    if (filters.discipline && filters.discipline !== 'all') {
      matchStage.subject_name = filters.discipline;
    }
    
    const polls = await Poll.find(matchStage).lean();
    
    // Подсчёт статистики
    let totalVotes = 0;
    let sumQ1 = 0, sumQ2 = 0, sumQ3 = 0, sumQ4 = 0, sumQ5 = 0;
    
    polls.forEach(poll => {
      (poll.responses || []).forEach(response => {
        totalVotes++;
        sumQ1 += response.answers?.Q1 || 0;
        sumQ2 += response.answers?.Q2 || 0;
        sumQ3 += response.answers?.Q3 || 0;
        sumQ4 += response.answers?.Q4 || 0;
        sumQ5 += response.answers?.Q5 || 0;
      });
    });
    
    let avgIKOP = 0;
    if (totalVotes > 0) {
      const avgAll = (sumQ1 + sumQ2 + sumQ3 + sumQ4 + sumQ5) / totalVotes / 5;
      avgIKOP = ((avgAll - 1) / 4) * 100;
    }
    
    // Общая статистика
    doc.fontSize(14).text('Общая статистика:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`• Всего оценок: ${totalVotes}`);
    doc.text(`• Опросов проведено: ${polls.length}`);
    doc.text(`• Средний ИКОП: ${avgIKOP.toFixed(1)}%`);
    
    if (totalVotes > 0) {
      doc.text(`• Средняя оценка Q1 (Актуальность): ${(sumQ1 / totalVotes).toFixed(2)}`);
      doc.text(`• Средняя оценка Q2 (Понятность): ${(sumQ2 / totalVotes).toFixed(2)}`);
      doc.text(`• Средняя оценка Q3 (Практика): ${(sumQ3 / totalVotes).toFixed(2)}`);
      doc.text(`• Средняя оценка Q4 (Вовлечённость): ${(sumQ4 / totalVotes).toFixed(2)}`);
      doc.text(`• Средняя оценка Q5 (Организация): ${(sumQ5 / totalVotes).toFixed(2)}`);
    }
    doc.moveDown();
    
    if (type === 'detailed') {
      doc.addPage();
      doc.fontSize(14).text('Расшифровка показателя ИКОП:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text('ИКОП (Индекс Качества Образовательного Процесса) - это нормализованный показатель качества,');
      doc.text('рассчитываемый на основе 5 критериев оценки занятий студентами.');
      doc.moveDown();
      
      doc.fontSize(12).text('Интерпретация значений ИКОП:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text('• 80-100%: Отличное качество - студенты высоко оценивают все аспекты обучения');
      doc.text('• 60-79%: Хорошее качество - в целом положительная оценка с потенциалом улучшения');
      doc.text('• 40-59%: Требует внимания - есть проблемы, требующие корректировки');
      doc.text('• 0-39%: Критическое состояние - необходимы срочные меры по улучшению');
      doc.moveDown();
      
      doc.fontSize(12).text('5 критериев оценки:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text('Q1. Актуальность материала');
      doc.text('Q2. Понятность изложения');
      doc.text('Q3. Практическая ценность');
      doc.text('Q4. Вовлечённость студентов');
      doc.text('Q5. Организация занятия');
    }
    
    doc.end();
    
  } catch (error) {
    console.error('Ошибка экспорта в PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка экспорта в PDF'
    });
  }
});

// POST /api/admin/export/custom-polls - Экспорт свободных опросов в Excel
router.post('/export/custom-polls', async (req, res) => {
  try {
    const { filters } = req.body;
    
    // Построение query для поиска свободных опросов
    const query = {
      pollType: { $ne: 'lesson_review' },
      status: { $ne: 'deleted' }
    };
    
    // Применяем фильтры
    if (filters) {
      if (filters.categoryFilter && filters.categoryFilter !== 'all') {
        query.category = filters.categoryFilter;
      }
      if (filters.statusFilter && filters.statusFilter !== 'all') {
        query.status = filters.statusFilter;
      }
      if (filters.creatorFilter && filters.creatorFilter !== 'all') {
        query.creator_role = filters.creatorFilter;
      }
    }
    
    const polls = await Poll.find(query)
      .populate('creator')
      .sort({ created_at: -1 })
      .lean();
    
    // Проверяем наличие xlsx
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (err) {
      console.error('xlsx not installed');
      return res.status(501).json({
        success: false,
        message: 'Библиотека xlsx не установлена. Выполните: npm install xlsx'
      });
    }
    
    // Формируем данные для Excel
    const data = polls.map(poll => {
      const targetCount = poll.max_responses || 50;
      const actualCount = poll.responses ? poll.responses.length : 0;
      const coverage = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
      
      const categoryNames = {
        organizational: 'Организационные',
        academic: 'Учебные',
        extracurricular: 'Внеучебные',
        feedback: 'Обратная связь'
      };
      
      const creatorRole = poll.creator && poll.creator.role ? poll.creator.role :
                         (poll.creator_role || 'student');
      const creatorName = poll.creator && poll.creator.full_name ? poll.creator.full_name :
                         (poll.creator_name || 'Неизвестно');
      
      return {
        'ID': poll._id.toString(),
        'Название': poll.title || 'Без названия',
        'Категория': categoryNames[poll.category] || poll.category || 'Организационные',
        'Теги': (poll.tags || []).join(', '),
        'Создатель': creatorName,
        'Роль создателя': creatorRole === 'admin' ? 'Админ' : 'Студент',
        'Дисциплина': poll.subject_name || poll.lessonContext?.subject || 'Не привязано',
        'Голосов': actualCount,
        'Целевое количество': targetCount,
        'Охват %': coverage,
        'Статус': poll.status === 'active' ? 'Активный' : 'Завершен',
        'Дата создания': poll.created_at ? new Date(poll.created_at).toLocaleDateString('ru-RU') : '-',
        'Дата закрытия': poll.closed_at ? new Date(poll.closed_at).toLocaleDateString('ru-RU') : '-'
      };
    });
    
    // Создаем Excel файл
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Устанавливаем ширину колонок
    ws['!cols'] = [
      { wch: 25 }, // ID
      { wch: 40 }, // Название
      { wch: 20 }, // Категория
      { wch: 30 }, // Теги
      { wch: 25 }, // Создатель
      { wch: 15 }, // Роль
      { wch: 30 }, // Дисциплина
      { wch: 10 }, // Голосов
      { wch: 15 }, // Целевое
      { wch: 10 }, // Охват
      { wch: 12 }, // Статус
      { wch: 15 }, // Дата создания
      { wch: 15 }  // Дата закрытия
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Свободные опросы');
    
    // Добавляем лист со статистикой
    const categoryStats = {
      organizational: 0,
      academic: 0,
      extracurricular: 0,
      feedback: 0
    };
    
    const byStatus = { active: 0, closed: 0 };
    const byCreator = { student: 0, admin: 0 };
    
    polls.forEach(poll => {
      const category = poll.category || 'organizational';
      if (categoryStats[category] !== undefined) {
        categoryStats[category]++;
      }
      
      if (poll.status === 'active') {
        byStatus.active++;
      } else if (poll.status === 'closed') {
        byStatus.closed++;
      }
      
      const creatorRole = poll.creator && poll.creator.role ? poll.creator.role :
                         (poll.creator_role || 'student');
      if (creatorRole === 'student') {
        byCreator.student++;
      } else if (creatorRole === 'admin') {
        byCreator.admin++;
      }
    });
    
    const statsData = [
      { 'Показатель': 'Всего опросов', 'Значение': polls.length },
      { 'Показатель': '', 'Значение': '' },
      { 'Показатель': 'По категориям:', 'Значение': '' },
      { 'Показатель': 'Организационные', 'Значение': categoryStats.organizational },
      { 'Показатель': 'Учебные', 'Значение': categoryStats.academic },
      { 'Показатель': 'Внеучебные', 'Значение': categoryStats.extracurricular },
      { 'Показатель': 'Обратная связь', 'Значение': categoryStats.feedback },
      { 'Показатель': '', 'Значение': '' },
      { 'Показатель': 'По статусу:', 'Значение': '' },
      { 'Показатель': 'Активные', 'Значение': byStatus.active },
      { 'Показатель': 'Завершенные', 'Значение': byStatus.closed },
      { 'Показатель': '', 'Значение': '' },
      { 'Показатель': 'По создателям:', 'Значение': '' },
      { 'Показатель': 'Студенты', 'Значение': byCreator.student },
      { 'Показатель': 'Админы', 'Значение': byCreator.admin }
    ];
    
    const statsWs = XLSX.utils.json_to_sheet(statsData);
    XLSX.utils.book_append_sheet(wb, statsWs, 'Статистика');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=custom_polls.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
    
  } catch (error) {
    console.error('Ошибка экспорта свободных опросов:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка экспорта данных'
    });
  }
});

// ==================== УПРАВЛЕНИЕ ОПРОСАМИ ====================

// GET /api/admin/polls - получить список всех опросов
router.get('/polls', async (req, res) => {
  try {
    const {
      type,
      category,
      status,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20
    } = req.query;
    
    // Построение фильтра
    const filter = { status: { $ne: 'deleted' } };
    
    if (type && type !== 'all') {
      filter.pollType = type;
    }
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (dateFrom || dateTo) {
      filter.created_at = {};
      if (dateFrom) filter.created_at.$gte = new Date(dateFrom);
      if (dateTo) filter.created_at.$lte = new Date(dateTo);
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'lessonContext.topic': { $regex: search, $options: 'i' } },
        { 'lessonContext.subject': { $regex: search, $options: 'i' } },
        { subject_name: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Подсчет статистики
    const stats = {
      total: await Poll.countDocuments({ status: { $ne: 'deleted' } }),
      active: await Poll.countDocuments({ status: 'active' }),
      closed: await Poll.countDocuments({ status: 'closed' }),
      template: await Poll.countDocuments({ pollType: 'lesson_review' }),
      custom: await Poll.countDocuments({ pollType: 'custom' })
    };
    
    // Получение опросов с пагинацией
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const polls = await Poll.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Вычисление ИКОП для шаблонных опросов
    const pollsWithIkop = polls.map(poll => {
      if (poll.pollType === 'lesson_review' && poll.responses && poll.responses.length > 0) {
        const totalIkop = poll.responses.reduce((sum, r) => sum + (r.ikop || 0), 0);
        poll.ikop = Math.round(totalIkop / poll.responses.length);
      }
      return poll;
    });
    
    const totalCount = await Poll.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.json({
      success: true,
      polls: pollsWithIkop,
      stats,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Get polls error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения опросов' });
  }
});

// POST /api/admin/polls - создать новый свободный опрос
router.post('/polls', async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      pollType,
      category,
      tags,
      options,
      start_date,
      end_date,
      is_anonymous,
      show_results,
      allow_comments,
      target_groups,
      target_faculties,
      target_programs,
      target_courses
    } = req.body;
    
    // Валидация обязательных полей
    if (!title || !type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Заполните все обязательные поля (title, type)' 
      });
    }
    
    // Определяем visibility на основе целевой аудитории
    let visibility = 'public';
    if (target_groups && target_groups.length > 0) {
      visibility = 'group';
    } else if (target_faculties && target_faculties.length > 0) {
      visibility = 'faculty';
    } else if (target_programs && target_programs.length > 0) {
      visibility = 'program';
    } else if (target_courses && target_courses.length > 0) {
      visibility = 'course';
    }
    
    // Вычисление target_count на основе целевой аудитории
    let targetCount = 0;
    
    if (visibility === 'public') {
      targetCount = await User.countDocuments({ role: 'student', is_active: true });
    } else if (visibility === 'group' && target_groups.length > 0) {
      targetCount = await User.countDocuments({ 
        role: 'student',
        is_active: true,
        group: { $in: target_groups }
      });
    } else if (visibility === 'faculty' && target_faculties.length > 0) {
      targetCount = await User.countDocuments({ 
        role: 'student',
        is_active: true,
        faculty: { $in: target_faculties }
      });
    } else if (visibility === 'program' && target_programs.length > 0) {
      targetCount = await User.countDocuments({ 
        role: 'student',
        is_active: true,
        program: { $in: target_programs }
      });
    } else if (visibility === 'course' && target_courses.length > 0) {
      targetCount = await User.countDocuments({ 
        role: 'student',
        is_active: true,
        course: { $in: target_courses }
      });
    }
    
    // Создание опроса
    const pollData = {
      creator_id: req.user.userId,
      title: title.trim(),
      description: description ? description.trim() : '',
      type: type || 'single',
      pollType: pollType || 'custom',
      category: category || 'organizational',
      tags: Array.isArray(tags) ? tags : [],
      
      // Варианты ответов
      options: options && Array.isArray(options) 
        ? options.filter(opt => opt.text && opt.text.trim())
        : [],
      
      // Даты
      start_date: start_date ? new Date(start_date) : new Date(),
      end_date: end_date ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
      
      // Настройки
      is_anonymous: is_anonymous !== undefined ? is_anonymous : true,
      show_results: show_results || 'immediate',
      allow_comments: allow_comments !== undefined ? allow_comments : false,
      
      // Целевая аудитория
      visibility,
      target_groups: Array.isArray(target_groups) ? target_groups : [],
      target_faculties: Array.isArray(target_faculties) ? target_faculties : [],
      target_programs: Array.isArray(target_programs) ? target_programs : [],
      target_courses: Array.isArray(target_courses) ? target_courses : [],
      
      // Целевое количество ответов
      max_responses: targetCount
    };
    
    console.log('📊 Создание опроса администратором:', {
      title: pollData.title,
      type: pollData.type,
      visibility: pollData.visibility,
      target_groups: pollData.target_groups,
      target_faculties: pollData.target_faculties,
      target_programs: pollData.target_programs,
      target_courses: pollData.target_courses,
      targetCount
    });
    
    const poll = new Poll(pollData);
    await poll.save();
    
    await poll.populate('creator_id', 'full_name email role');
    
    res.status(201).json({ 
      success: true,
      message: 'Опрос успешно создан',
      poll,
      pollId: poll._id
    });
    
  } catch (error) {
    console.error('❌ Ошибка создания опроса администратором:', error);
    
    // Обработка ошибок валидации Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Ошибка валидации',
        details: errors
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Ошибка создания опроса' 
    });
  }
});

// GET /api/admin/polls/:id/results - получить результаты опроса (ВАЖНО: до /polls/:id)
router.get('/polls/:id/results', async (req, res) => {
  console.log('🔍 GET /polls/:id/results called with id:', req.params.id);
  try {
    const poll = await Poll.findById(req.params.id);
    console.log('📊 Found poll:', poll ? `${poll._id} (${poll.title || poll.topic})` : 'null');
    
    if (!poll) {
      return res.status(404).json({ error: 'Опрос не найден' });
    }
    
    // Вычисление результатов
    const results = await calculatePollResults(poll);
    console.log('✅ Results calculated, responses:', results.totalResponses);
    
    res.json({
      poll,
      results
    });
  } catch (error) {
    console.error('❌ Get poll results error:', error);
    res.status(500).json({ error: 'Ошибка получения результатов' });
  }
});

// POST /api/admin/polls/:id/export - экспорт результатов (ВАЖНО: до /polls/:id)
router.post('/polls/:id/export', async (req, res) => {
  try {
    const { format } = req.body; // 'xlsx' или 'pdf'
    const poll = await Poll.findById(req.params.id);
    
    if (!poll) {
      return res.status(404).json({ error: 'Опрос не найден' });
    }
    
    if (format === 'xlsx') {
      await exportToExcel(poll, res);
    } else if (format === 'pdf') {
      await exportToPDF(poll, res);
    } else {
      return res.status(400).json({ error: 'Неверный формат' });
    }
  } catch (error) {
    console.error('Export poll results error:', error);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

// GET /api/admin/polls/:id - получить детали опроса
router.get('/polls/:id', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id).lean();
    
    if (!poll) {
      return res.status(404).json({ success: false, error: 'Опрос не найден' });
    }
    
    res.json({ success: true, poll });
  } catch (error) {
    console.error('Get poll error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения опроса' });
  }
});

// PUT /api/admin/polls/:id - обновить опрос
router.put('/polls/:id', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    
    if (!poll) {
      return res.status(404).json({ error: 'Опрос не найден' });
    }
    
    // Проверка: можно редактировать только свободные опросы
    if (poll.pollType !== 'custom') {
      return res.status(400).json({ error: 'Можно редактировать только свободные опросы' });
    }
    
    // Проверка: можно редактировать только активные опросы
    if (poll.status !== 'active') {
      return res.status(400).json({ error: 'Можно редактировать только активные опросы' });
    }
    
    // Обновление разрешенных полей
    const allowedFields = [
      'title', 'description', 'category', 'tags',
      'options', 'show_results', 'allow_comments'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        poll[field] = req.body[field];
      }
    });
    
    // updatedAt обновляется автоматически благодаря timestamps: true
    await poll.save();
    
    res.json({ 
      success: true, 
      message: 'Опрос обновлен успешно',
      poll 
    });
  } catch (error) {
    console.error('Update poll error:', error);
    res.status(500).json({ error: 'Ошибка обновления опроса' });
  }
});

// PUT /api/admin/polls/:id/close - закрыть опрос
router.put('/polls/:id/close', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    
    if (!poll) {
      return res.status(404).json({ success: false, error: 'Опрос не найден' });
    }
    
    if (poll.status === 'closed') {
      return res.status(400).json({ success: false, error: 'Опрос уже закрыт' });
    }
    
    poll.status = 'closed';
    poll.closed_at = new Date();
    await poll.save();
    
    res.json({ success: true, message: 'Опрос закрыт успешно' });
  } catch (error) {
    console.error('Close poll error:', error);
    res.status(500).json({ success: false, error: 'Ошибка закрытия опроса' });
  }
});

// DELETE /api/admin/polls/:id - удалить опрос
router.delete('/polls/:id', async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    
    if (!poll) {
      return res.status(404).json({ success: false, error: 'Опрос не найден' });
    }
    
    // Мягкое удаление - просто меняем статус
    poll.status = 'deleted';
    await poll.save();
    
    res.json({ success: true, message: 'Опрос удален успешно' });
  } catch (error) {
    console.error('Delete poll error:', error);
    res.status(500).json({ success: false, error: 'Ошибка удаления опроса' });
  }
});

// GET /api/admin/form-options - получить опции для формы создания
router.get('/form-options', async (req, res) => {
  try {
    // Получаем уникальные значения из базы пользователей
    const [groups, faculties, programs, disciplines] = await Promise.all([
      User.distinct('group', { 
        role: 'student', 
        is_active: true,
        group: { $exists: true, $ne: null, $ne: '' } 
      }),
      User.distinct('faculty', { 
        role: 'student', 
        is_active: true,
        faculty: { $exists: true, $ne: null, $ne: '' } 
      }),
      User.distinct('program', { 
        role: 'student', 
        is_active: true,
        program: { $exists: true, $ne: null, $ne: '' } 
      }),
      Poll.distinct('subject_name', { 
        subject_name: { $exists: true, $ne: null, $ne: '' } 
      })
    ]);
    
    const courses = [1, 2, 3, 4, 5]; // курсы всегда 1-5
    
    console.log('📋 Опции форм администратора:', {
      groups: groups.length,
      faculties: faculties.length,
      programs: programs.length,
      disciplines: disciplines.length
    });
    
    res.json({
      success: true,
      groups: groups.filter(Boolean).sort(),
      faculties: faculties.filter(Boolean).sort(),
      programs: programs.filter(Boolean).sort(),
      disciplines: disciplines.filter(Boolean).sort(),
      courses
    });
  } catch (error) {
    console.error('❌ Ошибка получения опций форм:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка получения данных' 
    });
  }
});

// Вспомогательные функции для расчета результатов
async function calculatePollResults(poll) {
  const totalResponses = poll.responses?.length || 0;
  const target_count = poll.target_count || totalResponses;
  const coverage = target_count > 0 ? Math.round((totalResponses / target_count) * 100) : 0;
  
  // Нормализация responses: добавляем фоллбеки для совместимости старых данных
  const normalizedResponses = (poll.responses || []).map(r => {
    // Фоллбек для student_metadata (если нет, создаём из старых полей)
    if (!r.student_metadata || !r.student_metadata.group) {
      r.student_metadata = {
        group: r.user_group_name || r.user_group || r.student_metadata?.group || 'N/A',
        faculty: r.user_faculty_name || r.user_faculty || r.student_metadata?.faculty || 'N/A',
        program: r.user_program_name || r.user_program || r.student_metadata?.program || 'N/A',
        course: r.user_course || r.student_metadata?.course || null
      };
    }
    
    // Фоллбек для comment (может быть в answers.q6_comment для lesson_review)
    if (!r.comment && poll.pollType === 'lesson_review' && r.answers?.q6_comment) {
      r.comment = r.answers.q6_comment;
    }
    
    return r;
  });
  
  let results = {
    totalResponses,
    coverage,
    commentsCount: normalizedResponses.filter(r => r.comment && r.comment.trim() !== '').length,
    responses: normalizedResponses
  };
  
  if (poll.pollType === 'lesson_review') {
    results = {
      ...results,
      ...calculateLessonReviewResults({ ...poll, responses: normalizedResponses })
    };
  } else if (poll.pollType === 'custom') {
    results = {
      ...results,
      ...calculateCustomPollResults({ ...poll, responses: normalizedResponses })
    };
  }
  
  return results;
}

function calculateLessonReviewResults(poll) {
  const responses = poll.responses || [];
  
  // Средний ИКОП
  const totalIkop = responses.reduce((sum, r) => sum + (r.ikop || 0), 0);
  const avgIkop = responses.length > 0 ? Math.round(totalIkop / responses.length) : 0;
  
  // Распределение по критериям
  const criteriaDistribution = {};
  const avgByCriteria = {};
  const ikopByCriteria = {};
  
  // Поддержка обоих форматов: Q1..Q5 (старый) и q1_relevance..q5_organization (новый)
  const criteriaMap = [
    { key: 'Q1', alternates: ['Q1', 'q1_relevance'] },
    { key: 'Q2', alternates: ['Q2', 'q2_clarity'] },
    { key: 'Q3', alternates: ['Q3', 'q3_practice'] },
    { key: 'Q4', alternates: ['Q4', 'q4_engagement'] },
    { key: 'Q5', alternates: ['Q5', 'q5_organization'] }
  ];
  
  criteriaMap.forEach(({ key, alternates }) => {
    const distribution = [
      { rating: '1⭐', count: 0 },
      { rating: '2⭐', count: 0 },
      { rating: '3⭐', count: 0 },
      { rating: '4⭐', count: 0 },
      { rating: '5⭐', count: 0 }
    ];
    
    let sum = 0;
    let validCount = 0;
    
    responses.forEach(r => {
      if (r.answers) {
        // Пытаемся найти оценку по любому из альтернативных ключей
        let rating = null;
        for (const alt of alternates) {
          if (r.answers[alt] !== undefined && r.answers[alt] !== null) {
            rating = r.answers[alt];
            break;
          }
        }
        
        if (rating && rating >= 1 && rating <= 5) {
          distribution[rating - 1].count++;
          sum += rating;
          validCount++;
        }
      }
    });
    
    criteriaDistribution[key] = distribution;
    avgByCriteria[key] = validCount > 0 ? (sum / validCount).toFixed(2) : '0.00';
    ikopByCriteria[key] = validCount > 0 ? Math.round(((sum / validCount - 1) / 4) * 100) : 0;
  });
  
  return {
    avgIkop,
    criteriaDistribution,
    avgByCriteria,
    ikopByCriteria
  };
}

function calculateCustomPollResults(poll) {
  const responses = poll.responses || [];
  
  if (poll.type === 'single' || poll.type === 'multiple') {
    // Подсчет голосов по вариантам
    const optionCounts = {};
    (poll.options || []).forEach(option => {
      optionCounts[option] = 0;
    });
    
    responses.forEach(r => {
      if (Array.isArray(r.answer)) {
        r.answer.forEach(ans => {
          if (optionCounts[ans] !== undefined) {
            optionCounts[ans]++;
          }
        });
      } else if (r.answer) {
        if (optionCounts[r.answer] !== undefined) {
          optionCounts[r.answer]++;
        }
      }
    });
    
    const optionsDistribution = Object.entries(optionCounts).map(([name, count]) => {
      const percentage = responses.length > 0 ? Math.round((count / responses.length) * 100) : 0;
      return { name, count, percentage };
    });
    
    return { optionsDistribution };
  }
  
  if (poll.type === 'rating') {
    // Распределение рейтинга
    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
      rating: `${rating}⭐`,
      count: responses.filter(r => r.answer === rating).length
    }));
    
    const totalRating = responses.reduce((sum, r) => sum + (parseInt(r.answer) || 0), 0);
    const avgRating = responses.length > 0 ? (totalRating / responses.length).toFixed(1) : 0;
    
    return { ratingDistribution, avgRating };
  }
  
  if (poll.type === 'form') {
    return {};
  }
  
  return {};
}

async function exportToExcel(poll, res) {
  const XLSX = require('xlsx');
  
  // Формирование данных
  const data = (poll.responses || []).map((response, idx) => {
    const row = {
      '№': idx + 1,
      'Дата': new Date(response.submitted_at).toLocaleString('ru-RU'),
      'Группа': response.student_metadata?.group || 'N/A'
    };
    
    if (poll.pollType === 'lesson_review') {
      row['ИКОП'] = response.ikop || 0;
      row['Актуальность'] = response.answers?.Q1 || '-';
      row['Понятность'] = response.answers?.Q2 || '-';
      row['Практика'] = response.answers?.Q3 || '-';
      row['Вовлеченность'] = response.answers?.Q4 || '-';
      row['Организация'] = response.answers?.Q5 || '-';
    } else {
      row['Ответ'] = Array.isArray(response.answer) ? response.answer.join(', ') : response.answer;
    }
    
    row['Комментарий'] = response.comment || '';
    
    return row;
  });
  
  // Создание листа
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ответы');
  
  // Лист со статистикой
  const results = await calculatePollResults(poll);
  const statsData = [
    { 'Показатель': 'Всего ответов', 'Значение': results.totalResponses },
    { 'Показатель': 'Охват', 'Значение': `${results.coverage}%` },
    { 'Показатель': 'Комментариев', 'Значение': results.commentsCount }
  ];
  
  if (poll.pollType === 'lesson_review') {
    statsData.push({ 'Показатель': 'Средний ИКОП', 'Значение': results.avgIkop });
  }
  
  const statsWs = XLSX.utils.json_to_sheet(statsData);
  XLSX.utils.book_append_sheet(wb, statsWs, 'Статистика');
  
  // Отправка файла
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  
  res.setHeader('Content-Disposition', `attachment; filename=poll_results_${poll._id}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
}

async function exportToPDF(poll, res) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument();
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=poll_results_${poll._id}.pdf`);
  
  doc.pipe(res);
  
  // Заголовок
  doc.fontSize(20).text('РЕЗУЛЬТАТЫ ОПРОСА', { align: 'center' });
  doc.moveDown();
  
  // Детали опроса
  doc.fontSize(14).text(poll.pollType === 'lesson_review' 
    ? `${poll.subject_name || 'Предмет'} - ${poll.topic || 'Тема'}`
    : poll.title || 'Опрос'
  );
  doc.moveDown();
  
  // Статистика
  const results = await calculatePollResults(poll);
  doc.fontSize(12);
  doc.text(`Всего ответов: ${results.totalResponses}`);
  doc.text(`Охват: ${results.coverage}%`);
  doc.text(`Комментариев: ${results.commentsCount}`);
  
  if (poll.pollType === 'lesson_review') {
    doc.text(`Средний ИКОП: ${results.avgIkop}/100`);
  }
  
  doc.moveDown();
  
  // Ответы (первые 50 для оптимизации размера PDF)
  doc.fontSize(16).text('ОТВЕТЫ (первые 50)');
  doc.fontSize(10);
  
  const responsesToShow = (poll.responses || []).slice(0, 50);
  responsesToShow.forEach((response, idx) => {
    doc.text(`${idx + 1}. ${new Date(response.submitted_at).toLocaleString('ru-RU')}`);
    
    if (poll.pollType === 'lesson_review') {
      doc.text(`   ИКОП: ${response.ikop || 0}/100`);
      if (response.answers) {
        doc.text(`   Q1-Q5: ${response.answers.Q1}⭐ ${response.answers.Q2}⭐ ${response.answers.Q3}⭐ ${response.answers.Q4}⭐ ${response.answers.Q5}⭐`);
      }
    } else {
      doc.text(`   Ответ: ${Array.isArray(response.answer) ? response.answer.join(', ') : response.answer}`);
    }
    
    if (response.comment) {
      doc.text(`   Комментарий: ${response.comment.substring(0, 100)}${response.comment.length > 100 ? '...' : ''}`);
    }
    
    doc.moveDown(0.5);
  });
  
  if ((poll.responses || []).length > 50) {
    doc.text(`... и еще ${poll.responses.length - 50} ответов. Для полного списка используйте экспорт в Excel.`);
  }
  
  doc.end();
}

module.exports = router;





















