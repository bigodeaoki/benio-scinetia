// Cliente HTTP: token JWT e empresa ativa (UUID) dentro do escopo do usuário
const CHAVE_TOKEN = 'scientia_saas_token';
const CHAVE_EMPRESA = 'scientia_saas_empresa';

const sessao = {
  token: localStorage.getItem(CHAVE_TOKEN) || null,
  empresaId: localStorage.getItem(CHAVE_EMPRESA) || null,
};

export const getToken = () => sessao.token;
export const getEmpresaId = () => sessao.empresaId;

export function setSessao(token, empresaId) {
  sessao.token = token;
  sessao.empresaId = empresaId || null;
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  if (empresaId) localStorage.setItem(CHAVE_EMPRESA, String(empresaId));
}

export function limparSessao() {
  sessao.token = null;
  sessao.empresaId = null;
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_EMPRESA);
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessao.token) headers.Authorization = `Bearer ${sessao.token}`;
  if (sessao.empresaId) headers['X-Empresa-Id'] = String(sessao.empresaId);
  const resp = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (resp.status === 401 && sessao.token) {
    limparSessao();
    window.dispatchEvent(new Event('scientia:logout'));
    throw new Error('Sessão expirada — entre de novo');
  }
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = Array.isArray(dados?.message) ? dados.message.join('; ') : dados?.message;
    throw new Error(msg || `Erro ${resp.status}`);
  }
  return dados;
}
