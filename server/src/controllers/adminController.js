const adminAnalyticsService = require('../services/adminAnalyticsService');
const detailedAnalyticsService = require('../services/detailedAnalyticsService');

/**
 * Получить дашборд качества образования
 * GET /api/admin/analytics/quality-dashboard
 */
exports.getQualityDashboard = async (req, res) => {
  try {
    const { faculty, program, course, group, subject, teacher, period } = req.query;
    
    // 🔍 DEBUG: Логирование входящих параметров
    console.log('\n🔍 [getQualityDashboard] Входящие параметры:');
    console.log('   faculty:', faculty);
    console.log('   program:', program);
    console.log('   course:', course);
    console.log('   group:', group);
    console.log('   subject:', subject);
    console.log('   teacher:', teacher);
    console.log('   period:', period);
    
    const filters = {
      faculty,
      program,  // ✅ ДОБАВЛЕНО
      course,
      group,
      subject,
      teacher,
      period: period || 'month'
    };
    
    console.log('   📋 Filters:', JSON.stringify(filters, null, 2));
    
    const data = await adminAnalyticsService.getDashboardStatistics(filters);
    
    console.log('   ✅ Результат - опросов:', data.summary?.pollsCount || 0);
    console.log('   ✅ Результат - ответов:', data.summary?.totalResponses || 0);
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Error in getQualityDashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки дашборда качества'
    });
  }
};

/**
 * Получить описательную статистику
 * GET /api/admin/analytics/descriptive-statistics
 */
exports.getDescriptiveStatistics = async (req, res) => {
  try {
    const { group, subject, teacher, period } = req.query;
    
    const filters = { group, subject, teacher, period: period || 'semester' };
    const data = await detailedAnalyticsService.getDescriptiveStatistics(filters);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getDescriptiveStatistics:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки описательной статистики'
    });
  }
};

/**
 * Получить текстовый анализ
 * GET /api/admin/analytics/text-analysis
 */
exports.getTextAnalysis = async (req, res) => {
  try {
    const { group, subject, teacher, period } = req.query;
    
    const filters = { group, subject, teacher, period: period || 'semester' };
    const data = await detailedAnalyticsService.getTextAnalysis(filters);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getTextAnalysis:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки текстового анализа'
    });
  }
};

/**
 * Получить сравнительный анализ
 * GET /api/admin/analytics/comparative-analysis
 */
exports.getComparativeAnalysis = async (req, res) => {
  try {
    const { group, subject, teacher, period } = req.query;
    
    const filters = { group, subject, teacher, period: period || 'semester' };
    const data = await detailedAnalyticsService.getComparativeAnalysis(filters);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getComparativeAnalysis:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки сравнительного анализа'
    });
  }
};

/**
 * Получить анализ технических инцидентов
 * GET /api/admin/analytics/technical-incidents
 */
exports.getTechnicalIncidents = async (req, res) => {
  try {
    const { group, subject, teacher, period } = req.query;
    
    const filters = { group, subject, teacher, period: period || 'semester' };
    const data = await detailedAnalyticsService.getTechnicalIncidents(filters);
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error in getTechnicalIncidents:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки анализа инцидентов'
    });
  }
};

/**
 * Получить статистику свободных опросов
 * GET /api/admin/analytics/custom-polls-dashboard
 */
exports.getCustomPollsDashboard = async (req, res) => {
  try {
    const { faculty, program, course, group, subject, teacher, period } = req.query;
    
    const filters = {
      faculty,
      program,  // ✅ ДОБАВЛЕНО
      course,
      group,
      subject,
      teacher,
      period: period || 'month'
    };
    
    const data = await adminAnalyticsService.getCustomPollsStatistics(filters);
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error in getCustomPollsDashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки статистики свободных опросов'
    });
  }
};
