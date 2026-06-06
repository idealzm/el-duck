(function() {
  var token = new URLSearchParams(window.location.search).get('token') || '';
  var userEmail = '';

  var loadingState = document.getElementById('loadingState');
  var errorState = document.getElementById('errorState');
  var resetFormState = document.getElementById('resetFormState');
  var successState = document.getElementById('successState');

  document.querySelectorAll('.password-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var targetId = btn.getAttribute('data-target');
      var input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '';
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p1.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24');
        var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l1.setAttribute('x1', '1'); l1.setAttribute('y1', '1');
        l1.setAttribute('x2', '23'); l1.setAttribute('y2', '23');
        svg.appendChild(p1); svg.appendChild(l1);
        btn.appendChild(svg);
      } else {
        input.type = 'password';
        btn.textContent = '';
        var svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg2.setAttribute('width', '18');
        svg2.setAttribute('height', '18');
        svg2.setAttribute('viewBox', '0 0 24 24');
        svg2.setAttribute('fill', 'none');
        svg2.setAttribute('stroke', 'currentColor');
        svg2.setAttribute('stroke-width', '2');
        var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p2.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
        var c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.setAttribute('cx', '12'); c1.setAttribute('cy', '12'); c1.setAttribute('r', '3');
        svg2.appendChild(p2); svg2.appendChild(c1);
        btn.appendChild(svg2);
      }
    });
  });

  function showState(state) {
    [loadingState, errorState, resetFormState, successState].forEach(function(el) { el.classList.add('hidden'); });
    state.classList.remove('hidden');
  }

  function validateToken() {
    if (!token) {
      document.getElementById('errorMessage').textContent = 'Ссылка недействительна. Запросите новую ссылку для сброса пароля.';
      showState(errorState);
      return;
    }

    fetch('/api/auth/validate-reset-token?token=' + encodeURIComponent(token))
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.valid) {
          userEmail = data.email || '';
          document.getElementById('emailDisplay').textContent = userEmail;
          showState(resetFormState);
          document.getElementById('newPassword').focus();
        } else {
          document.getElementById('errorMessage').textContent = data.error || 'Ссылка устарела или недействительна. Запросите новую.';
          showState(errorState);
        }
      })
      .catch(function() {
        document.getElementById('errorMessage').textContent = 'Ошибка проверки ссылки. Попробуйте позже.';
        showState(errorState);
      });
  }

  document.getElementById('resetForm').addEventListener('submit', function(e) {
    e.preventDefault();

    var password = document.getElementById('newPassword').value;
    var confirm = document.getElementById('confirmPassword').value;
    var formError = document.getElementById('formError');
    var submitBtn = document.getElementById('submitBtn');
    var submitText = document.getElementById('submitText');
    var submitLoader = document.getElementById('submitLoader');

    formError.classList.add('hidden');

    if (!password || password.length < 6) {
      formError.textContent = 'Пароль должен быть не менее 6 символов';
      formError.classList.remove('hidden');
      return;
    }
    if (password !== confirm) {
      formError.textContent = 'Пароли не совпадают';
      formError.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitText.classList.add('hidden');
    submitLoader.classList.remove('hidden');

    fetch('/api/auth/reset-password-with-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token: token, password: password })
    })
    .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
    .then(function(result) {
      if (!result.ok) {
        formError.textContent = result.data.error || 'Ошибка сброса пароля';
        formError.classList.remove('hidden');
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        submitLoader.classList.add('hidden');
        return;
      }

      showState(successState);
      setTimeout(function() { window.location.href = '/'; }, 2000);
    })
    .catch(function() {
      formError.textContent = 'Ошибка соединения. Попробуйте позже.';
      formError.classList.remove('hidden');
      submitBtn.disabled = false;
      submitText.classList.remove('hidden');
      submitLoader.classList.add('hidden');
    });
  });

  validateToken();
})();