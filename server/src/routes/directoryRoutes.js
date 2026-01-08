const express = require('express');
const router = express.Router();
const directoryController = require('../controllers/directoryController');

router.get('/structure', directoryController.getStructure);
router.get('/faculties', directoryController.getFaculties);
router.get('/programs', directoryController.getPrograms);
router.get('/courses', directoryController.getCourses);
router.get('/groups', directoryController.getGroups);

module.exports = router;











