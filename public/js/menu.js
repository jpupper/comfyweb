// ============================================================
// comfyweb - Navbar propia (marea FSC, sin dependencias del sitio fullscreencode)
//   createNavbar(pagina)  -> HTML del navbar
//   initNavbar()          -> engancha login/logout/estado de sesion
// ============================================================
'use strict';

function createNavbar(currentPage) {
  currentPage = currentPage || 'index';
  return `
  <nav class="navbar" id="navbar">
    <div class="container">
      <div class="nav-content">
        <div class="logo">
          <a href="${CONFIG.BASE || '.'}/" title="JP Tasks">
            <img src="img/imagotiposinfondo.png" alt="JP Tasks">
          </a>
        </div>
        <div class="nav-right">
          <ul class="nav-menu" id="navMenu">
            <li><a href="tareas.html" class="nav-link ${currentPage === 'tareas' ? 'active' : ''}">Tablero</a></li>
            <li><a href="${CONFIG.FSCAUTH_URL}/profile.html" class="nav-link">Mis creaciones</a></li>
          </ul>
          <div class="nav-actions">
            <div class="auth-container" id="authContainer">
              <button class="btn-login" id="btnLogin">Ingresar</button>
              <div class="user-info" id="userInfo" style="display:none;">
                <span class="welcome-text">JP Tasks</span>
                <div class="user-dropdown">
                  <button class="user-menu-btn" id="userMenuBtn">
                    <span id="userName"></span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L2 4h8z"/></svg>
                  </button>
                  <div class="user-dropdown-menu" id="userDropdownMenu">
                    <a href="${CONFIG.FSCAUTH_URL}/profile.html">Mi perfil FSC</a>
                    <a href="#" id="btnLogout">Cerrar sesi&oacute;n</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </nav>`;
}

function initNavbar() {
  function refresh() {
    if (typeof isLoggedIn === 'undefined') { setTimeout(refresh, 100); return; }

    const logged = isLoggedIn();
    const loginBtn = document.getElementById('btnLogin');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');

    if (loginBtn) loginBtn.style.display = logged ? 'none' : 'inline-flex';
    if (userInfo) userInfo.style.display = logged ? 'inline-flex' : 'none';
    if (userName) userName.textContent = '@' + (getUserUsername() || 'usuario');

    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) btnLogin.onclick = () => showLogin();

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.onclick = (e) => { e.preventDefault(); logout(); };

    const menuBtn = document.getElementById('userMenuBtn');
    const dropMenu = document.getElementById('userDropdownMenu');
    if (menuBtn && dropMenu) {
      menuBtn.onclick = (e) => { e.stopPropagation(); dropMenu.classList.toggle('show'); };
      document.addEventListener('click', () => dropMenu.classList.remove('show'));
    }
  }
  refresh();
  window.addEventListener('authStateChanged', refresh);
}
