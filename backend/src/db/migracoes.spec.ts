import { separarComandos } from './migracoes';

describe('separarComandos', () => {
  it('separa pelo ponto e vírgula do fim da linha e ignora comentários', () => {
    const sql = ['-- cabeçalho', 'SET NAMES utf8mb4;', '', '-- tabela', 'CREATE TABLE IF NOT EXISTS a (', '  id INT, -- não é comentário de linha inteira', '  nome VARCHAR(10)', ') ENGINE=InnoDB;', 'ALTER TABLE a ADD b INT;  '].join('\n');
    const comandos = separarComandos(sql);
    expect(comandos).toHaveLength(3);
    expect(comandos[0]).toBe('SET NAMES utf8mb4');
    expect(comandos[1]).toMatch(/^CREATE TABLE IF NOT EXISTS a \(/);
    expect(comandos[1]).toMatch(/ENGINE=InnoDB$/);
    expect(comandos[2]).toBe('ALTER TABLE a ADD b INT');
  });

  it('aceita fim de linha do Windows e arquivo sem quebra no final', () => {
    expect(separarComandos('SELECT 1;\r\nSELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
    expect(separarComandos('-- só comentário\n')).toEqual([]);
  });
});
