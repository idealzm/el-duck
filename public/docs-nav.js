const backLink = document.querySelector('[data-doc-back]');

if (backLink) {
  backLink.addEventListener('click', (event) => {
    event.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/';
  });
}
