import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';
import { ErrosFilter } from './shared/erros.filter';

// Scientia SaaS — API (deploy via Railway)
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  // Campo fora do DTO é recusado: em SaaS, entrada livre é porta para problema
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ErrosFilter());
  // '::' aceita IPv6 e IPv4: a rede privada do Railway fala IPv6. Sem IPv6 no ambiente, cai para IPv4
  try {
    await app.listen(env.PORT, '::');
  } catch (e: any) {
    if (e?.code !== 'EAFNOSUPPORT' && e?.code !== 'EADDRNOTAVAIL') throw e;
    await app.listen(env.PORT, '0.0.0.0');
  }
  console.log(`[scientia-saas] API ouvindo em http://[::]:${env.PORT}/api (${env.producao ? 'produção' : 'desenvolvimento'})`);
}
bootstrap();
