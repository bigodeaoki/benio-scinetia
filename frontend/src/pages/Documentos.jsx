import React from 'react';
import { FileText } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api, apiBaixar, apiEnviar } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_GERIR = ['owner', 'administrativo'];
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const fmtTamanho = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

// Status de download de um lado (matriz ou filiais)
function Baixado({ sim, em }) {
  return sim ? <Badge cor="verde">Baixado {em ? `em ${fmtDataHora(em)}` : ''}</Badge> : <Badge cor="amarelo">Pendente</Badge>;
}

// Documentos do grupo: qualquer usuário envia e baixa. Baixar marca o status
// do lado de quem baixou: matriz ou filial, conforme a empresa ativa.
export default function Documentos() {
  const s = React.useContext(SessaoContext);
  const papel = s.usuario?.papel;
  const { dados, erro, carregando, recarregar } = useDados(() => api('/documentos'), [s.empresaId]);
  const [enviando, setEnviando] = React.useState(false);
  const [editando, setEditando] = React.useState(null);
  const [baixando, setBaixando] = React.useState(null);
  const empresaDe = (d) => (d.empresa_id === s.escopo?.matriz?.id ? `${d.empresa_nome} (matriz)` : d.empresa_nome);
  const podeGerir = (d) => PODE_GERIR.includes(papel) || d.usuario_id === s.usuario?.id;
  const empresaAtiva = s.empresas.find((e) => e.id === s.empresaId);
  const lado = empresaAtiva?.matriz ? 'matriz' : 'filial';

  async function baixar(d) {
    setBaixando(d.id);
    try {
      const { blob, nome } = await apiBaixar(`/documentos/${d.id}/arquivo`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome || d.nome_arquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      recarregar();
      toast.sucesso(`Download registrado para ${lado === 'matriz' ? 'a matriz' : 'as filiais'}`);
    } catch (e) {
      toast.erro(e.message);
    } finally {
      setBaixando(null);
    }
  }

  async function alterarAtivo(d, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar documento' : 'Inativar documento', mensagem: ativo ? `Reativar ${d.titulo}?` : `Inativar ${d.titulo}? Ele deixa de ser baixado, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/documentos/${d.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Documento reativado' : 'Documento inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><FileText size={15} className="icone-cartao" />Documentos do grupo {s.escopo?.matriz?.nome || ''}</h3>
          <button className="botao" onClick={() => setEnviando(true)}>+ Enviar documento</button>
        </div>
        <div className="alerta alerta-info">
          Todo o grupo enxerga os documentos. Ao baixar, o status do seu lado vira <strong>Baixado</strong>: você está como <strong>{empresaAtiva?.nome}</strong>, então conta para {lado === 'matriz' ? 'a matriz' : 'as filiais'}.
          Arquivos de até {fmtTamanho(TAMANHO_MAXIMO)}.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum documento enviado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Documento</th><th>Arquivo</th><th>Empresa</th><th>Enviado por</th><th>Matriz</th><th>Filiais</th><th>Enviado em</th><th className="acoes">Ações</th></tr>
              </thead>
              <tbody>
                {dados.map((d) => (
                  <tr key={d.id} style={d.ativo ? undefined : { opacity: 0.55 }}>
                    <td><div className="negrito">{d.titulo}</div>{d.descricao && <div className="texto-suave">{d.descricao}</div>}</td>
                    <td><span className="mono">{d.nome_arquivo}</span> <span className="texto-suave">({fmtTamanho(d.tamanho)})</span></td>
                    <td>{empresaDe(d)}</td>
                    <td>{d.usuario_nome || '—'}</td>
                    <td><Baixado sim={!!d.baixado_matriz} em={d.baixado_matriz_em} /></td>
                    <td><Baixado sim={!!d.baixado_filial} em={d.baixado_filial_em} /></td>
                    <td>{fmtDataHora(d.criado_em)}</td>
                    <td className="acoes">
                      {d.ativo ? <button className="botao botao-mini" disabled={baixando === d.id} onClick={() => baixar(d)}>{baixando === d.id ? 'Baixando…' : 'Baixar'}</button> : <Badge cor="cinza">Inativo</Badge>}
                      {podeGerir(d) && <button className="botao botao-secundario botao-mini" onClick={() => setEditando(d)}>Editar</button>}
                      {podeGerir(d) && (d.ativo
                        ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(d, false)}>Inativar</button>
                        : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(d, true)}>Reativar</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {enviando && <FormEnvio aoFechar={() => setEnviando(false)} aoSalvar={() => { setEnviando(false); recarregar(); toast.sucesso('Documento enviado'); }} />}
      {editando && <FormEdicao documento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Documento salvo'); }} />}
    </>
  );
}

function FormEnvio({ aoFechar, aoSalvar }) {
  const [arquivo, setArquivo] = React.useState(null);
  const [f, setF] = React.useState({ titulo: '', descricao: '' });
  const [erro, setErro] = React.useState(null);
  const [ocupado, setOcupado] = React.useState(false);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    if (!arquivo) return setErro('Escolha um arquivo');
    if (arquivo.size > TAMANHO_MAXIMO) return setErro(`Arquivo maior que ${fmtTamanho(TAMANHO_MAXIMO)}`);
    const fd = new FormData();
    fd.append('arquivo', arquivo, arquivo.name);
    if (f.titulo.trim()) fd.append('titulo', f.titulo.trim());
    if (f.descricao.trim()) fd.append('descricao', f.descricao.trim());
    setOcupado(true);
    try {
      await apiEnviar('/documentos', fd);
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo="Enviar documento" largura={600} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" disabled={ocupado} onClick={salvar}>{ocupado ? 'Enviando…' : 'Enviar'}</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Arquivo *" dica={`Até ${fmtTamanho(TAMANHO_MAXIMO)}`}>
          <input type="file" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Título" dica="Sem título, usa o nome do arquivo"><input value={f.titulo} onChange={(e) => mudar('titulo', e.target.value)} placeholder={arquivo ? arquivo.name.replace(/\.[^.]+$/, '') : ''} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
    </Modal>
  );
}

function FormEdicao({ documento, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState({ titulo: documento.titulo, descricao: documento.descricao || '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    try {
      await api(`/documentos/${documento.id}`, { method: 'PUT', body: { titulo: f.titulo, descricao: f.descricao || undefined } });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={`Editar ${documento.titulo}`} largura={600} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Título *"><input value={f.titulo} onChange={(e) => mudar('titulo', e.target.value)} autoFocus /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Arquivo"><input value={`${documento.nome_arquivo} (${fmtTamanho(documento.tamanho)})`} readOnly /></Campo>
        <Campo rotulo="Identificador"><input value={documento.id} readOnly className="mono" /></Campo>
      </div>
    </Modal>
  );
}
