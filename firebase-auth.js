import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  sendEmailVerification,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  linkWithCredential
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

// ─────────────────────────────────────────────────────
//  🔑  SUBSTITUA os valores abaixo pelas credenciais
//  do seu projeto Firebase real (console.firebase.google.com)
//
//  PASSOS para ativar o Google Login:
//  1. Acesse https://console.firebase.google.com
//  2. Selecione (ou crie) seu projeto
//  3. Authentication → Sign-in method → Ative "Google"
//  4. Authentication → Settings → Authorized domains →
//     adicione o domínio do seu site (ex: seliga.jovem)
//  5. Copie as credenciais do projeto (Project settings → General)
//     e cole no objeto abaixo.
// ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCPQuK79XDc8B5bgr8tVSUwcLkSHlVJU6c",
  authDomain:        "snapbite-85943.firebaseapp.com",
  projectId:         "snapbite-85943",
  storageBucket:     "snapbite-85943.firebasestorage.app",
  messagingSenderId: "839470161933",
  appId:             "1:839470161933:web:fc3fe935406a2406e13544",
  measurementId:     "G-CXMLLXPZLP"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// Persistência local: login sobrevive a fechar o browser
setPersistence(auth, browserLocalPersistence).catch(console.error);

// ─────────────────────────────────────────────────────
// Helpers: dados extras (telefone, termos) no localStorage
// ─────────────────────────────────────────────────────
function getCadastroExtra(uid) {
  const extras = JSON.parse(localStorage.getItem('snapbite_auth_extras') || '{}');
  return extras[uid] || null;
}

function salvarCadastroExtra(uid, dados) {
  const extras = JSON.parse(localStorage.getItem('snapbite_auth_extras') || '{}');
  extras[uid] = dados;
  localStorage.setItem('snapbite_auth_extras', JSON.stringify(extras));
}

// ─────────────────────────────────────────────────────
// Sincroniza usuário Firebase → App.usuario + localStorage
// ─────────────────────────────────────────────────────
function syncUsuarioFirebase(user) {
  if (!user) return null;

  const extra = getCadastroExtra(user.uid);

  const email = (user.email || '').toLowerCase();
  const perfis = JSON.parse(localStorage.getItem('snapbite_profiles') || '{}');

  const perfilPorUid = perfis[user.uid] || null;
  const perfilPorEmail = perfis[email] || null;
  const perfilExistente = perfilPorUid || perfilPorEmail || {};

  if (perfilPorEmail && !perfilPorUid) {
    perfis[user.uid] = perfilPorEmail;
    localStorage.setItem('snapbite_profiles', JSON.stringify(perfis));
  }

  const usuario = {
    uid: user.uid,
    nome: perfilExistente.nome || user.displayName || 'Usuário SnapBite',
    email: email,
    foto: perfilExistente.foto || user.photoURL || '',
    provider: user.providerData?.[0]?.providerId || 'firebase',
    telefone: extra?.telefone || '',
    aceitouTermos: !!extra?.aceitouTermos,
    senhaCriada: user.providerData?.some(p => p.providerId === 'password') || !!extra?.senhaCriada,
    twoFactorEnabled: !!extra?.twoFactorEnabled,
    cadastroCompleto: !!(extra?.telefone && extra?.aceitouTermos && (user.providerData?.some(p => p.providerId === 'password') || extra?.senhaCriada))
  };

  localStorage.setItem('snapbite_user', JSON.stringify(usuario));

  if (window.App) window.App.usuario = usuario;

  window.atualizarNavAuth?.();
  window.dispatchEvent(new CustomEvent('snapbite:login', { detail: usuario }));

  return usuario;
}

// ─────────────────────────────────────────────────────
// Abre modal para completar cadastro (telefone + termos)
// ─────────────────────────────────────────────────────
function abrirModalCompletarCadastro() {
  window.closeModal?.('modal-login');
  window.openModal?.('modal-completar-cadastro');
}

// ─────────────────────────────────────────────────────
// Login com Google (popup)
// ─────────────────────────────────────────────────────
async function loginComGoogleReal() {
  try {
    const result  = await signInWithPopup(auth, provider);
    const user    = result.user;
    const usuario = syncUsuarioFirebase(user);

    if (!usuario.cadastroCompleto) {
      // Com Google, o cliente ainda precisa criar nome/senha do site.
      const nomeEl  = document.getElementById('extra-nome');
      const emailEl = document.getElementById('extra-email');
      const telEl   = document.getElementById('extra-telefone');
      const termEl  = document.getElementById('extra-termos');
      const senhaEl = document.getElementById('extra-senha');
      const senha2El = document.getElementById('extra-senha-confirmar');

      if (nomeEl)  {
        nomeEl.readOnly = false;
        nomeEl.value  = usuario.nome || '';
      }
      if (emailEl) emailEl.value = usuario.email  || '';
      if (telEl)   telEl.value   = usuario.telefone || '';
      if (termEl)  termEl.checked = !!usuario.aceitouTermos;
      if (senhaEl) senhaEl.value = '';
      if (senha2El) senha2El.value = '';

      abrirModalCompletarCadastro();
      return { ok: false, precisaCompletar: true };
    }

    window.closeModal?.('modal-login');
    const twoFA = await exigirTwoFactorSeAtivo(usuario);
    if (!twoFA.ok) return twoFA;

    window.showToast?.(`Bem-vindo(a), ${usuario.nome.split(' ')[0]}! 🎉`, 'success');

    if (window.App?.pendingProduct && typeof window.adicionarAoCarrinho === 'function') {
      const produto = window.App.pendingProduct;
      window.App.pendingProduct = null;
      window.adicionarAoCarrinho(produto);
    }

    _redirecionarAposLogin();
    return { ok: true };
  } catch (error) {
    console.error('Firebase Google Auth error:', error);
    const msgs = {
      'auth/account-exists-with-different-credential': 'Esse e-mail já existe. Entre com e-mail e senha primeiro e depois use o Google na mesma conta.',
      'auth/popup-closed-by-user': 'Login cancelado.',
      'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups para continuar.'
    };
    window.showToast?.(msgs[error.code] || 'Não foi possível entrar com Google.', 'error');
    return { ok: false, msg: msgs[error.code] || 'Não foi possível entrar com Google.' };
  }
}

// ─────────────────────────────────────────────────────
// Se o usuário estiver na welcome.html, redireciona
// ─────────────────────────────────────────────────────
function _redirecionarSeWelcome() {
  if (window.location.pathname.endsWith('welcome.html') ||
      window.location.pathname === '/' ||
      window.location.pathname === '') {

    const usuario = JSON.parse(localStorage.getItem('snapbite_user') || 'null');
    if (usuario?.cadastroCompleto) {
      window.location.replace('index.html');
    }
  }
}

function _redirecionarAposLogin() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  const destinoSeguro = redirect && !redirect.startsWith('http') && !redirect.includes('://')
    ? redirect
    : 'index.html';

  // Garante que o App e o menu atualizem antes de sair da página.
  window.atualizarNavAuth?.();
  window.dispatchEvent(new CustomEvent('snapbite:auth-ok'));

  const path = window.location.pathname || '';
  const estaNoLogin = path.endsWith('login.html') || path.endsWith('/login') || path.includes('login');

  if (estaNoLogin) {
    window.location.replace(destinoSeguro);
  }
}

// ─────────────────────────────────────────────────────
// Completar cadastro (telefone + termos)
// ─────────────────────────────────────────────────────
function initCadastroExtra() {
  const form = document.getElementById('form-completar-cadastro');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.showToast?.('Sessão não encontrada. Tente entrar novamente.', 'error');
      return;
    }

    const nome = document.getElementById('extra-nome')?.value.trim();
    const telefone    = document.getElementById('extra-telefone')?.value.trim();
    const senha = document.getElementById('extra-senha')?.value || '';
    const senhaConfirmar = document.getElementById('extra-senha-confirmar')?.value || '';
    const aceitouTermos = document.getElementById('extra-termos')?.checked;

    if (!nome || nome.length < 2) {
      window.showToast?.('Digite seu nome.', 'warning');
      return;
    }
    if (!telefone) {
      window.showToast?.('Digite seu telefone.', 'warning');
      return;
    }
    if (!currentUser.providerData?.some(p => p.providerId === 'password')) {
      if (senha.length < 6) {
        window.showToast?.('Crie uma senha com pelo menos 6 caracteres.', 'warning');
        return;
      }
      if (senha !== senhaConfirmar) {
        window.showToast?.('As senhas não coincidem.', 'warning');
        return;
      }
    }
    if (!aceitouTermos) {
      window.showToast?.('Você precisa aceitar os termos.', 'warning');
      return;
    }

    try {
      await updateProfile(currentUser, { displayName: nome });

      if (!currentUser.providerData?.some(p => p.providerId === 'password')) {
        const credencialSenha = EmailAuthProvider.credential(currentUser.email, senha);
        await linkWithCredential(currentUser, credencialSenha);
      }

      salvarCadastroExtra(currentUser.uid, { telefone, aceitouTermos: true, senhaCriada: true });
    } catch (err) {
      console.error('Erro ao concluir cadastro Google:', err);
      const msgs = {
        'auth/provider-already-linked': 'Essa conta já possui senha cadastrada.',
        'auth/email-already-in-use': 'Esse e-mail já está cadastrado em outra conta.',
        'auth/credential-already-in-use': 'Esse e-mail já está vinculado a outra conta.',
        'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
        'auth/requires-recent-login': 'Entre novamente com Google e tente concluir o cadastro.'
      };
      window.showToast?.(msgs[err.code] || 'Erro ao concluir cadastro.', 'error');
      return;
    }

    const usuario = syncUsuarioFirebase(auth.currentUser);

    window.closeModal?.('modal-completar-cadastro');
    window.showToast?.(`Conta concluída, ${usuario.nome.split(' ')[0]}! ✅`, 'success');

    if (window.App?.pendingProduct && typeof window.adicionarAoCarrinho === 'function') {
      const produto = window.App.pendingProduct;
      window.App.pendingProduct = null;
      window.adicionarAoCarrinho(produto);
    }

    // Redireciona imediatamente após concluir cadastro
    _redirecionarAposLogin();
  });
}

// ─────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────
function logoutFirebaseReal() {
  signOut(auth).catch(console.error);
  localStorage.removeItem('snapbite_user');

  if (window.App) window.App.usuario = null;

  window.atualizarNavAuth?.();
  window.showToast?.('Você saiu da conta.', 'info');
}

// ─────────────────────────────────────────────────────
// Observer de estado de autenticação
// ─────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    const usuario = syncUsuarioFirebase(user);
    if (usuario.cadastroCompleto) {
      window.closeModal?.('modal-login');
      window.closeModal?.('modal-completar-cadastro');

      const path = window.location.pathname || '';
      if (path.endsWith('login.html') || path.endsWith('/login')) {
        _redirecionarAposLogin();
      }
    }
  } else {
    localStorage.removeItem('snapbite_user');
    if (window.App) window.App.usuario = null;
    window.atualizarNavAuth?.();
  }
});

// ─────────────────────────────────────────────────────
// Login com e-mail + senha (Firebase)
// ─────────────────────────────────────────────────────
async function loginComEmailSenha(email, senha) {
  try {
    const result  = await signInWithEmailAndPassword(auth, email, senha);
    const usuario = syncUsuarioFirebase(result.user);

    window.showToast?.(`Bem-vindo(a), ${usuario.nome.split(' ')[0]}! 🎉`, 'success');

    if (window.App?.pendingProduct && typeof window.adicionarAoCarrinho === 'function') {
      const produto = window.App.pendingProduct;
      window.App.pendingProduct = null;
      window.adicionarAoCarrinho(produto);
    }

    _redirecionarAposLogin();
    return { ok: true };
  } catch (err) {
    const msgs = {
      'auth/user-not-found':   'E-mail não encontrado.',
      'auth/wrong-password':   'Senha incorreta.',
      'auth/invalid-email':    'E-mail inválido.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/too-many-requests':'Muitas tentativas. Tente mais tarde.',
    };
    const msg = msgs[err.code] || 'Erro ao entrar. Tente novamente.';
    return { ok: false, msg };
  }
}

// ─────────────────────────────────────────────────────
// Cadastro com e-mail + senha (Firebase)
// ─────────────────────────────────────────────────────
async function cadastrarComEmailSenha(nome, email, senha, telefone, aceitouTermos) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, senha);
    const user   = result.user;

    // Salva nome no perfil Firebase
    await updateProfile(user, { displayName: nome });


    await sendEmailVerification(user);

    // Salva extras locais (telefone + termos)
    salvarCadastroExtra(user.uid, { telefone, aceitouTermos });

    const usuario = syncUsuarioFirebase(user);

    window.showToast?.(`Conta criada! Bem-vindo(a), ${nome.split(' ')[0]}! ✅`, 'success');
    _redirecionarAposLogin();
    return { ok: true };
  } catch (err) {
    const msgs = {
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/invalid-email':        'E-mail inválido.',
      'auth/weak-password':        'Senha muito fraca. Use ao menos 6 caracteres.',
    };
    const msg = msgs[err.code] || 'Erro ao criar conta. Tente novamente.';
    return { ok: false, msg };
  }
}

// ─────────────────────────────────────────────────────
// Recuperar senha por e-mail
// ─────────────────────────────────────────────────────
async function recuperarSenha(email) {
  try {
    const urlRecuperacao = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}recuperar-senha.html`;

await sendPasswordResetEmail(auth, email, {
  url: "https://carolina31serragrande-droid.github.io/snapbite-8/recuperar-senha.html",
  handleCodeInApp: false
});
    return { ok: true };
  } catch (err) {
    console.error('Erro ao enviar recuperação de senha:', err);
    const msgs = {
      'auth/user-not-found': 'Nenhuma conta com este e-mail.',
      'auth/invalid-email':  'E-mail inválido.',
      'auth/missing-email': 'Digite um e-mail válido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    };
    const msg = msgs[err.code] || 'Erro ao enviar e-mail. Tente novamente.';
    return { ok: false, msg };
  }
}

// ─────────────────────────────────────────────────────
// Confirmar troca real da senha pelo link do Firebase
// ─────────────────────────────────────────────────────
async function validarCodigoRedefinicaoSenha(oobCode) {
  try {
    const email = await verifyPasswordResetCode(auth, oobCode);
    return { ok: true, email };
  } catch (err) {
    console.error('Link de redefinição inválido:', err);
    const msgs = {
      'auth/expired-action-code': 'Este link expirou. Peça uma nova recuperação de senha.',
      'auth/invalid-action-code': 'Este link é inválido ou já foi utilizado.',
      'auth/user-disabled': 'Esta conta foi desativada.',
      'auth/user-not-found': 'Conta não encontrada.',
    };
    return { ok: false, msg: msgs[err.code] || 'Link inválido ou expirado.' };
  }
}

const params = new URLSearchParams(window.location.search);
const oobCodeUrl = params.get("oobCode");
async function confirmarNovaSenha(oobCode, novaSenha) {
  try {
    await confirmPasswordReset(auth, oobCodeUrl || oobCode, novaSenha);
    return { ok: true };
  } catch (err) {
    console.error('Erro ao confirmar nova senha:', err);
    const msgs = {
      'auth/expired-action-code': 'Este link expirou. Peça uma nova recuperação de senha.',
      'auth/invalid-action-code': 'Este link é inválido ou já foi utilizado.',
      'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
    };
    return { ok: false, msg: msgs[err.code] || 'Erro ao redefinir senha. Tente novamente.' };
  }
}


// ─────────────────────────────────────────────────────
// Código de segurança extra do perfil (2FA simples do app)
// ─────────────────────────────────────────────────────
function _getTwoFactorStore() {
  return JSON.parse(localStorage.getItem('snapbite_two_factor') || '{}');
}

function _getTwoFactorKey(usuario = JSON.parse(localStorage.getItem('snapbite_user') || 'null')) {
  return usuario?.uid || usuario?.email || auth.currentUser?.uid || auth.currentUser?.email || null;
}

function getTwoFactorStatus() {
  const key = _getTwoFactorKey();
  const store = _getTwoFactorStore();
  return key ? (store[key] || { enabled: false }) : { enabled: false };
}

function salvarTwoFactorCodigo(codigo) {
  const key = _getTwoFactorKey();
  if (!key) return { ok: false, msg: 'Entre na conta para configurar.' };
  const limpo = String(codigo || '').replace(/\D/g, '');
  if (limpo.length !== 6) return { ok: false, msg: 'O código precisa ter 6 números.' };
  const store = _getTwoFactorStore();
  store[key] = { enabled: true, code: limpo };
  localStorage.setItem('snapbite_two_factor', JSON.stringify(store));
  return { ok: true };
}

function desativarTwoFactor() {
  const key = _getTwoFactorKey();
  if (!key) return { ok: false, msg: 'Entre na conta para configurar.' };
  const store = _getTwoFactorStore();
  delete store[key];
  localStorage.setItem('snapbite_two_factor', JSON.stringify(store));
  return { ok: true };
}

async function exigirTwoFactorSeAtivo(usuario) {
  const key = _getTwoFactorKey(usuario);
  const store = _getTwoFactorStore();
  const cfg = key ? store[key] : null;
  if (!cfg?.enabled) return { ok: true };

  const digitado = prompt('Digite seu código de segurança SnapBite de 6 números:');
  if (String(digitado || '').replace(/\D/g, '') === cfg.code) {
    return { ok: true };
  }

  await signOut(auth).catch(console.error);
  localStorage.removeItem('snapbite_user');
  return { ok: false, msg: 'Código de segurança incorreto.' };
}


// ─────────────────────────────────────────────────────
// Alterações sensíveis do perfil após código por e-mail
// ─────────────────────────────────────────────────────
async function atualizarContaFirebasePerfil({ nome, email, senha }) {
  const user = auth.currentUser;

  if (!user) {
    return { ok: false, msg: 'Entre novamente na conta para alterar o perfil.' };
  }

  try {
    if (nome && nome.trim() && nome.trim() !== user.displayName) {
      await updateProfile(user, { displayName: nome.trim() });
    }

    const emailLimpo = (email || '').trim().toLowerCase();
    if (emailLimpo && emailLimpo !== (user.email || '').toLowerCase()) {
      await updateEmail(user, emailLimpo);
    }

    if (senha && senha.length >= 6) {
      await updatePassword(user, senha);
    }

    syncUsuarioFirebase(auth.currentUser);
    return { ok: true };
  } catch (err) {
    console.error('Erro ao atualizar dados sensíveis:', err);
    const msgs = {
      'auth/requires-recent-login': 'Por segurança, saia e entre novamente na conta antes de alterar e-mail ou senha.',
      'auth/email-already-in-use': 'Este e-mail já está sendo usado por outra conta.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'Senha fraca. Use pelo menos 6 caracteres.',
      'auth/provider-already-linked': 'Esse login já está vinculado.'
    };
    return { ok: false, msg: msgs[err.code] || 'Não foi possível alterar os dados da conta.' };
  }
}

// ─────────────────────────────────────────────────────
// Expõe globalmente para os botões do HTML chamarem
window.loginComGoogleReal      = loginComGoogleReal;
window.logoutFirebaseReal      = logoutFirebaseReal;
window.loginComEmailSenha      = loginComEmailSenha;
window.cadastrarComEmailSenha  = cadastrarComEmailSenha;
window.recuperarSenha          = recuperarSenha;
window.validarCodigoRedefinicaoSenha = validarCodigoRedefinicaoSenha;
window.confirmarNovaSenha      = confirmarNovaSenha;
window.getTwoFactorStatus      = getTwoFactorStatus;
window.salvarTwoFactorCodigo   = salvarTwoFactorCodigo;
window.desativarTwoFactor      = desativarTwoFactor;
window.atualizarContaFirebasePerfil = atualizarContaFirebasePerfil;

window.alterarEmailFirebase = async (novoEmail) => {
  const user = auth.currentUser;

  if (!user) {
    window.showToast?.('Usuário não encontrado.', 'error');
    return;
  }

  try {
    await updateEmail(user, novoEmail);
    window.showToast?.('E-mail atualizado com sucesso! 📩', 'success');
  } catch (err) {
    console.error(err);
    window.showToast?.('Erro ao atualizar e-mail.', 'error');
  }
};

window.snapbiteAuthReady = true;
window.dispatchEvent(new CustomEvent('snapbite:auth-ready'));

document.addEventListener('DOMContentLoaded', () => {
  initCadastroExtra();
});
