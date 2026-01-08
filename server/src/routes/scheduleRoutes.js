const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');

// Публичный доступ: только читаем дисциплины по группе
router.get('/subjects', scheduleController.getSubjects);
router.get('/group', scheduleController.getGroupSchedule);

module.exports = router;




