const User = require('../models/User');

/**
 * Получить рейтинг студентов (Leaderboard)
 * GET /api/users/leaderboard
 */
exports.getLeaderboard = async (req, res) => {
  try {
    const { 
      limit = 50, 
      group, 
      faculty, 
      program, 
      course 
    } = req.query;

    // Построение фильтра
    const filter = {
      role: 'student',
      is_active: true
    };

    if (group) filter.group = group;
    if (faculty) filter.faculty = faculty;
    if (program) filter.program = program;
    if (course) filter.course = parseInt(course);

    // Запрос с сортировкой по баллам
    const users = await User.find(filter)
      .select('full_name group student_data.points student_data.level')
      .sort({ 'student_data.points': -1 })
      .limit(parseInt(limit))
      .lean();

    // Трансформация под формат frontend
    const leaderboard = users.map((user, index) => ({
      _id: user._id,
      full_name: user.full_name,
      student_data: {
        group: user.group,  // Берём из верхнего уровня
        points: user.student_data?.points || 0,
        level: user.student_data?.level || 1
      },
      trend: 0,  // Пока без тренда (требуется snapshot модель)
      position: index + 1
    }));

    // Позиция текущего пользователя
    let currentUser = null;
    if (req.user?.userId) {
      const allUsers = await User.find({ role: 'student', is_active: true })
        .select('_id student_data.points')
        .sort({ 'student_data.points': -1 })
        .lean();

      const userIndex = allUsers.findIndex(u => 
        u._id.toString() === req.user.userId.toString()
      );

      if (userIndex !== -1) {
        currentUser = {
          _id: allUsers[userIndex]._id,
          position: userIndex + 1,
          points: allUsers[userIndex].student_data?.points || 0
        };
      }
    }

    console.log('🏆 Leaderboard запрошен:');
    console.log('   Фильтры:', { group, faculty, program, course });
    console.log('   Найдено студентов:', leaderboard.length);
    console.log('   Топ-3:', leaderboard.slice(0, 3).map(u => `${u.full_name} (${u.student_data.points})`));

    res.json({
      success: true,
      users: leaderboard,
      total: await User.countDocuments(filter),
      currentUser
    });

  } catch (error) {
    console.error('❌ Ошибка getLeaderboard:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка получения рейтинга' 
    });
  }
};
