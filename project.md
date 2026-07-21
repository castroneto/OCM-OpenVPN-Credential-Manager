quero criar um monorepo com 2 apps nestjs e react 

esse sistema deve ser simples pois a unica responsabilidade e gerenciar os usuarios e seguro nao quero nada mocado ou mal implementado 

preciso de uma arquitetura bem feita

quero que todas as rotas que recebem parametro estejam validadas por uma camada de class validator 
new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    forbidUnknownValues: true
});

nenhum parametro a mais deve passar se nao estiver na validacao 

o banco de dados do sistema deve ser um better-sqlite3 

quero gerar tamben um arquivo .deb para que possa instalar no servidor e usar 

ao instalar o .deb ele deve instalar openvpn dnsmask e o proprio servico de frontend e backend 

tamben seria interessante uma interface interativa de configuracao inicial ao instalar o .deb 


essa e a estrutura de pastas 

├── apps/
│   ├── api/          (NestJS)
│   └── web/          (React + Vite)
│
├── packages/
│   ├── shared/
│   ├── dto/
│   ├── types/
│   └── config/
│
├── installer/
│   ├── debian/
│   ├── scripts/
│   └── systemd/
│
├── docs/
│
└── docker/

nada alem disso 



DTO obrigatório

Nunca aceitar

any

object

Record<string, any>

Toda rota deve receber um DTO.

Exemplo

CreateUserDto

Nunca

@Post()

create(@Body() body)


Params

Até params devem possuir DTO.

Ao invés de

:id

Criaria

class UserIdParamDto {

 @IsUUID()

 id:string;

}

ou

@IsInt()

dependendo do caso.

Query

Mesma coisa.

Nunca

?page=abc

Sem validação.

Nunca usar exec()

Sempre

spawn()

ou

execFile()

Nunca

bash -c

Nunca interpolar strings.

Arquitetura de permissões

Somente Admin


quero tamben um github action para gerar esses .deb a cada release criada 

ja no frontend eu quero o @radix-ui/themes

tamben quero um readme.md de codumentacao get started de como subir no servidor 

o nome do projeto e  OCM – OpenVPN Credential Manager

O foco total e SEGURANCA, SIMPLICIDADE, FUNCIONALIDADE