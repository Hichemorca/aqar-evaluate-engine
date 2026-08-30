(() => {
  const splash = document.getElementById('miayaar-splash');
  if (!splash) return;

  const duration = 4800;
  let finished = false;
  let timer;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    document.body.classList.add('miayaar-splash-complete');
    window.setTimeout(() => splash.remove(), 760);
  };

  const skip = splash.querySelector('[data-splash-skip]');
  if (skip) skip.addEventListener('click', finish);

  timer = window.setTimeout(finish, duration);
})();
