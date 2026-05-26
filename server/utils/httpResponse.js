function ok(res, payload = {}, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...payload });
}

function fail(res, message, statusCode = 400, extras = {}) {
  return res.status(statusCode).json({ error: message, ...extras });
}

module.exports = {
  ok,
  fail
};
