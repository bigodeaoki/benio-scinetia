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

function cabecalhos(json) {
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  if (sessao.token) headers.Authorization = `Bearer ${sessao.token}`;
  if (sessao.empresaId) headers['X-Empresa-Id'] = String(sessao.empresaId);
  return headers;
}

// Sessão expirada derruba o app para a tela de entrada; outros erros viram Error com a mensagem da API
async function tratar(resp) {
  if (resp.status === 401 && sessao.token) {
    limparSessao();
    window.dispatchEvent(new Event('scientia:logout'));
    throw new Error('Sessão expirada — entre de novo');
  }
  if (!resp.ok) {
    const dados = await resp.json().catch(() => null);
    const msg = Array.isArray(dados?.message) ? dados.message.join('; ') : dados?.message;
    throw new Error(msg || `Erro ${resp.status}`);
  }
  return resp;
}

export async function api(path, { method = 'GET', body } = {}) {
  const resp = await tratar(await fetch(`/api${path}`, { method, headers: cabecalhos(true), body: body !== undefined ? JSON.stringify(body) : undefined }));
  return resp.json().catch(() => null);
}

// Envio multipart (arquivos): o navegador define o Content-Type com o boundary
export async function apiEnviar(path, formData) {
  const resp = await tratar(await fetch(`/api${path}`, { method: 'POST', headers: cabecalhos(false), body: formData }));
  return resp.json().catch(() => null);
}

// Download autenticado: devolve o blob e o nome vindo do Content-Disposition
export async function apiBaixar(path) {
  const resp = await tratar(await fetch(`/api${path}`, { headers: cabecalhos(false) }));
  const disp = resp.headers.get('content-disposition') || '';
  const utf8 = disp.match(/filename\*=UTF-8''([^;]+)/i);
  const simples = disp.match(/filename="?([^";]+)"?/i);
  const nome = utf8 ? decodeURIComponent(utf8[1]) : simples ? simples[1] : null;
  return { blob: await resp.blob(), nome };
}
