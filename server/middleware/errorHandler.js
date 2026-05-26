const AppError = require('../utils/AppError');

function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'Маршрут не найден' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }

  console.error('Server error:', err);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
