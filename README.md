# StudioPro

Sistema de Gestão para Estúdios Fotográficos.

## Módulos

- **Dashboard** — Indicadores em tempo real, atalhos rápidos, aniversários e agendamentos
- **Clientes** — Cadastro completo com campos de gestante, histórico, autorização de fotos
- **Serviços** — Catálogo com categorias, preços e pacotes
- **Orçamentos** — Criação com itens dinâmicos, descontos, depósitos e versão para impressão
- **Documentos** — Contratos e documentos com variáveis automáticas e impressão
- **Agenda** — Calendário mensal/semanal/diário com marcação de aniversários
- **Caixa** — Abertura/fechamento, lançamentos e histórico imutável
- **Financeiro** — Contas a receber/pagar, pagamentos parciais, inadimplência, exportação CSV
- **Alertas** — Centralizado com integração WhatsApp
- **Configurações** — Identidade do estúdio, cores, tema, regras
- **Backup** — Exportação/importação JSON de todos os dados

## Desenvolvimento (Web)

```bash
npm install
npm run dev
```

## Build Web

```bash
npm run build
```

## Gerar Instalador .exe (Windows)

### Pré-requisitos

1. **Node.js 18+** instalado
2. **Windows 10/11** (ou Windows com WSL2 para builds Linux)
3. Conexão com internet (electron-builder baixa o Electron runtime na primeira vez)

### Passos

1. Instale as dependências:
```bash
npm install
```

2. Gere o instalador .exe:
```bash
npm run electron:build:win
```

3. O instalador será gerado em:
```
release/StudioPro-Setup-24.1.0.exe
```

### Instalação no Windows

1. Execute o arquivo `StudioPro-Setup-24.1.0.exe`
2. Escolha o diretório de instalação (ou use o padrão)
3. Atalhos serão criados na Área de Trabalho e no Menu Iniciar
4. O aplicativo aparecerá como "StudioPro"

### Desenvolvimento com Electron

Para rodar em modo desenvolvimento com Electron + Vite:

```bash
npm run electron:dev
```

Isso inicia o Vite dev server e o Electron simultaneamente, com DevTools aberto.

### Build sem instalador (apenas teste)

Para gerar o executável sem criar o instalador NSIS:

```bash
npm run electron:pack
```

O resultado estará em `release/win-unpacked/StudioPro.exe`.

## Estrutura

```
├── electron/
│   ├── main.js          # Processo principal do Electron
│   ├── preload.js       # Bridge seguro para o renderer
│   └── build/
│       └── icon.ico     # Ícone do aplicativo
├── src/
│   ├── pages/           # 11 páginas/módulos
│   ├── components/      # Componentes reutilizáveis
│   ├── context/         # Context providers
│   └── lib/             # Supabase client, tipos, utils
├── supabase/
│   └── migrations/      # Schema do banco de dados
└── vite.config.ts       # Config Vite (base: ./ para Electron)
```

## Dados

O sistema usa Supabase como backend. As credenciais estão em `.env`.

Para backup local, use o módulo Backup dentro do aplicativo para exportar/importar todos os dados em JSON.

## Tecnologia

- React 18 + TypeScript
- Vite 7
- Tailwind CSS 3
- Electron 33 + electron-builder
- Supabase (PostgreSQL)
- Lucide Icons
