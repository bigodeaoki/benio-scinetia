import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, UsuarioAtual } from './decorators';
import { CadastroDto, LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Public()
  @Post('cadastro')
  cadastro(@Body() dto: CadastroDto) {
    return this.service.cadastro(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Get('me')
  me(@UsuarioAtual() usuario: any) {
    return this.service.me(usuario.id);
  }
}
