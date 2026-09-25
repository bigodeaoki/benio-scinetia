import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PAPEIS = 'papeis';
export const Papeis = (...papeis: string[]) => SetMetadata(PAPEIS, papeis);

// Conta (tenant) do usuário logado — tudo que grava ou lê passa por ela
export const ContaId = createParamDecorator((_: unknown, ctx: ExecutionContext): number => {
  return ctx.switchToHttp().getRequest().contaId;
});

// Empresa ativa, validada pelo AuthGuard a partir do header X-Empresa-Id
export const EmpresaId = createParamDecorator((_: unknown, ctx: ExecutionContext): number | null => {
  return ctx.switchToHttp().getRequest().empresaId;
});

export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().usuario;
});
