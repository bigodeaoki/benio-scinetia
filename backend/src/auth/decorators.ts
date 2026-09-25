import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PAPEIS = 'papeis';
export const Papeis = (...papeis: string[]) => SetMetadata(PAPEIS, papeis);

export interface EscopoSessao {
  papel: string;
  matrizId: string | null;      // grupo do usuário; null para o admin
  empresaIds: string[] | null;  // empresas que ele pode usar; null = todas (admin)
}

// Escopo montado pelo AuthGuard: papel, matriz (grupo) e empresas permitidas
export const Escopo = createParamDecorator((_: unknown, ctx: ExecutionContext): EscopoSessao => {
  return ctx.switchToHttp().getRequest().escopo;
});

export const MatrizId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  return ctx.switchToHttp().getRequest().escopo?.matrizId ?? null;
});

// Empresa ativa (header X-Empresa-Id, validada dentro do escopo)
export const EmpresaId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  return ctx.switchToHttp().getRequest().empresaId;
});

export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().usuario;
});
