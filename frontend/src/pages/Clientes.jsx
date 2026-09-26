import React from 'react';
import { Contact } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'vendas', 'administrativo', 'financeiro'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
// XX.XXX.XXX/XXXX-XX (numérico ou alfanumérico)
const fmtCnpj = (c) => (c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c || '—');
const fmtCep = (c) => (c && c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c || '');

// Clientes: cada empresa cadastra os seus e todo o grupo enxerga. Altera a
// empresa que cadastrou (ou a dona do grupo); as outras só consultam.
export default function Clientes() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api(filtroEmpresa ? `/clientes?empresa=${filtroEmpresa}` : '/clientes'), [s.empresaId, filtroEmpresa]);
  const [aberto, setAberto] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (c) => (c.empresa_id === s.escopo?.matriz?.id ? `${c.empresa_nome} (matriz)` : c.empresa_nome);

  async function alterarAtivo(c, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar cliente' : 'Inativar cliente', mensagem: ativo ? `Reativar ${c.razao_social}?` : `Inativar ${c.razao_social}? Ele some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/clientes/${c.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Cliente reativado' : 'Cliente inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Contact size={15} className="icone-cartao" />Clientes do grupo {s.escopo?.matriz?.nome || ''}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setAberto({ novo: true })}>+ Novo cliente</button>}
        </div>
        <div className="alerta alerta-info">
          Cada empresa cadastra os seus clientes e todo o grupo (matriz e filiais) enxerga. Quem altera é a empresa que cadastrou, ou a dona do grupo.
          Você está como <strong>{empresa?.nome}</strong>.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum cliente cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Cliente</th><th>CNPJ</th><th>Empresa</th><th>Cidade/UF</th><th>Contato</th><th>Responsáveis</th><th>Status</th><th>Criado em</th><th className="acoes">Ações</th></tr>
              </thead>
              <tbody>
                {dados.map((c) => (
                  <tr key={c.id} style={c.ativo ? undefined : { opacity: 0.55 }}>
                    <td><div className="negrito">{c.razao_social}</div>{c.nome_fantasia && <div className="texto-suave">{c.nome_fantasia}</div>}</td>
                    <td className="mono">{fmtCnpj(c.cnpj)}</td>
                    <td>{empresaDe(c)}</td>
                    <td>{[c.cidade, c.uf].filter(Boolean).join('/') || '—'}</td>
                    <td>{c.telefone && <div>{c.telefone}</div>}{c.email && <div className="texto-suave">{c.email}</div>}{!c.telefone && !c.email && '—'}</td>
                    <td>{c.responsaveis?.length ? <>{c.responsaveis[0].nome}{c.responsaveis.length > 1 && <span className="texto-suave"> +{c.responsaveis.length - 1}</span>}</> : '—'}</td>
                    <td><Badge cor={c.ativo ? 'verde' : 'cinza'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td>{fmtDataHora(c.criado_em)}</td>
                    <td className="acoes">
                      {podeEditar && c.editavel ? (
                        <>
                          <button className="botao botao-secundario botao-mini" onClick={() => setAberto(c)}>Editar</button>
                          {c.ativo
                            ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(c, false)}>Inativar</button>
                            : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(c, true)}>Reativar</button>}
                        </>
                      ) : (
                        <button className="botao botao-secundario botao-mini" onClick={() => setAberto({ ...c, somenteLeitura: true })}>Ver</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {aberto && (
        <FormCliente cliente={aberto.novo ? null : aberto} somenteLeitura={!!aberto.somenteLeitura} empresas={s.empresas} empresaAtiva={s.empresaId}
          ehDono={s.usuario?.papel === 'owner'} nomeEmpresa={nomeEmpresa} aoFechar={() => setAberto(null)}
          aoSalvar={() => { setAberto(null); recarregar(); toast.sucesso('Cliente salvo'); }} />
      )}
    </>
  );
}

const RESPONSAVEL_VAZIO = { nome: '', cargo: '', telefone: '', email: '' };
const Secao = ({ titulo }) => <div className="texto-suave negrito" style={{ margin: '12px 0 4px', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4 }}>{titulo}</div>;

function FormCliente({ cliente, somenteLeitura, empresas, empresaAtiva, ehDono, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(cliente
    ? {
      razao_social: cliente.razao_social, nome_fantasia: cliente.nome_fantasia || '', cnpj: fmtCnpj(cliente.cnpj) === '—' ? '' : fmtCnpj(cliente.cnpj), inscricao_estadual: cliente.inscricao_estadual || '',
      email: cliente.email || '', telefone: cliente.telefone || '', cep: fmtCep(cliente.cep), logradouro: cliente.logradouro || '', numero: cliente.numero || '', complemento: cliente.complemento || '',
      bairro: cliente.bairro || '', cidade: cliente.cidade || '', uf: cliente.uf || '', observacoes: cliente.observacoes || '', empresa_id: cliente.empresa_id,
      responsaveis: (cliente.responsaveis || []).map((r) => ({ nome: r.nome, cargo: r.cargo || '', telefone: r.telefone || '', email: r.email || '' })),
    }
    : { razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', observacoes: '', empresa_id: empresaAtiva, responsaveis: [] });
  const [erro, setErro] = React.useState(null);
  const ro = somenteLeitura;
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const mudarResp = (i, campo, valor) => setF((s) => ({ ...s, responsaveis: s.responsaveis.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)) }));
  const adicionar = () => setF((s) => ({ ...s, responsaveis: [...s.responsaveis, { ...RESPONSAVEL_VAZIO }] }));
  const remover = (i) => setF((s) => ({ ...s, responsaveis: s.responsaveis.filter((_, j) => j !== i) }));
  const ou = (v) => (v && v.trim() ? v.trim() : undefined);

  async function salvar() {
    setErro(null);
    const corpo = {
      razao_social: f.razao_social, nome_fantasia: ou(f.nome_fantasia), cnpj: ou(f.cnpj), inscricao_estadual: ou(f.inscricao_estadual), email: ou(f.email), telefone: ou(f.telefone),
      cep: ou(f.cep), logradouro: ou(f.logradouro), numero: ou(f.numero), complemento: ou(f.complemento), bairro: ou(f.bairro), cidade: ou(f.cidade), uf: ou(f.uf), observacoes: ou(f.observacoes),
      empresa_id: f.empresa_id,
      responsaveis: f.responsaveis.map((r) => ({ nome: r.nome, cargo: ou(r.cargo), telefone: ou(r.telefone), email: ou(r.email) })),
    };
    try {
      if (cliente) await api(`/clientes/${cliente.id}`, { method: 'PUT', body: corpo });
      else await api('/clientes', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  const campo = (rotulo, nome, extra = {}) => (
    <Campo rotulo={rotulo} largura={extra.largura} dica={extra.dica}>
      <input value={f[nome]} onChange={(e) => mudar(nome, e.target.value)} readOnly={ro} placeholder={extra.placeholder} className={extra.mono ? 'mono' : undefined} type={extra.type || 'text'} />
    </Campo>
  );

  return (
    <Modal titulo={ro ? cliente.razao_social : cliente ? `Editar ${cliente.razao_social}` : 'Novo cliente'} largura={820} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>{ro ? 'Fechar' : 'Cancelar'}</button>{!ro && <button className="botao" onClick={salvar}>Salvar</button>}</>}
    >
      <Erro msg={erro} />
      {ro && <div className="alerta alerta-info">Cadastrado por <strong>{cliente.empresa_nome}</strong>: só essa empresa, ou a dona do grupo, altera.</div>}
      <Secao titulo="Empresa" />
      <div className="linha-campos">
        {campo('Razão social *', 'razao_social')}
        {campo('Nome fantasia', 'nome_fantasia')}
      </div>
      <div className="linha-campos">
        {campo('CNPJ', 'cnpj', { largura: 200, mono: true, placeholder: '00.000.000/0000-00', dica: 'Numérico ou alfanumérico' })}
        {campo('Inscrição estadual', 'inscricao_estadual', { largura: 200 })}
        <Campo rotulo="Cadastrado por *" dica={ehDono ? 'Empresa do grupo dona do cadastro' : undefined}>
          {ehDono && !ro
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={cliente ? cliente.empresa_nome : nomeEmpresa(empresas.find((e) => e.id === f.empresa_id))} readOnly />}
        </Campo>
      </div>
      <Secao titulo="Contatos da empresa" />
      <div className="linha-campos">
        {campo('Telefone', 'telefone', { largura: 200, placeholder: '(11) 99999-9999' })}
        {campo('E-mail', 'email', { type: 'email' })}
      </div>
      <Secao titulo="Endereço" />
      <div className="linha-campos">
        {campo('CEP', 'cep', { largura: 130, mono: true, placeholder: '00000-000' })}
        {campo('Logradouro', 'logradouro')}
        {campo('Número', 'numero', { largura: 110 })}
        {campo('Complemento', 'complemento', { largura: 160 })}
      </div>
      <div className="linha-campos">
        {campo('Bairro', 'bairro')}
        {campo('Cidade', 'cidade')}
        <Campo rotulo="UF" largura={90}>
          {ro ? <input value={f.uf} readOnly /> : (
            <select value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>
              <option value="">—</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </Campo>
      </div>
      <Secao titulo="Responsáveis e seus contatos" />
      {!f.responsaveis.length && <div className="texto-suave" style={{ marginBottom: 6 }}>Nenhum responsável informado.</div>}
      {f.responsaveis.map((r, i) => (
        <div className="linha-campos" key={i} style={{ alignItems: 'flex-end' }}>
          <Campo rotulo={i === 0 ? 'Nome *' : undefined}><input value={r.nome} onChange={(e) => mudarResp(i, 'nome', e.target.value)} readOnly={ro} placeholder="Nome" /></Campo>
          <Campo rotulo={i === 0 ? 'Cargo' : undefined} largura={160}><input value={r.cargo} onChange={(e) => mudarResp(i, 'cargo', e.target.value)} readOnly={ro} placeholder="Cargo" /></Campo>
          <Campo rotulo={i === 0 ? 'Telefone' : undefined} largura={160}><input value={r.telefone} onChange={(e) => mudarResp(i, 'telefone', e.target.value)} readOnly={ro} placeholder="Telefone" /></Campo>
          <Campo rotulo={i === 0 ? 'E-mail' : undefined}><input type="email" value={r.email} onChange={(e) => mudarResp(i, 'email', e.target.value)} readOnly={ro} placeholder="E-mail" /></Campo>
          {!ro && <button type="button" className="botao botao-perigo botao-mini" style={{ height: 34, marginBottom: 10 }} title="Remover" onClick={() => remover(i)}>×</button>}
        </div>
      ))}
      {!ro && <button type="button" className="botao botao-secundario botao-mini" onClick={adicionar}>+ Adicionar responsável</button>}
      <Secao titulo="Observações" />
      <div className="linha-campos">
        {campo('Observações', 'observacoes')}
      </div>
      {cliente && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={cliente.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(cliente.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(cliente.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}
