# Extrator de Dados PDF - Ane

Ferramenta pessoal para extrair dados estruturados de arquivos PDF usando OCR (Optical Character Recognition) e preencher automaticamente arquivos CSV com os dados extraídos.

## 📋 Descrição

Esta é uma ferramenta desenvolvida especificamente para uso pessoal, que permite extrair informações de tabelas em PDFs (especialmente PDFs escaneados ou baseados em imagens) usando tecnologia OCR e preencher automaticamente arquivos CSV com os dados encontrados.

## ✨ Funcionalidades

- **Extração de PDF com OCR**: Processa PDFs usando Tesseract.js para extrair texto de documentos escaneados
- **Análise Inteligente de Dados**: Identifica e extrai automaticamente:
  - ID da amostra
  - Sexo (M/F/N)
  - Idade
  - Nome
- **Preenchimento Automático de CSV**: Preenche automaticamente arquivos CSV com os dados extraídos
- **Edição Inline**: Permite editar dados diretamente na tabela antes de exportar
- **Interface Moderna**: Design responsivo e intuitivo com feedback visual
- **Visualização de Texto Bruto**: Permite visualizar o texto extraído do PDF para verificação
- **Progresso em Tempo Real**: Mostra o progresso do processamento do PDF

## 🚀 Como Usar

### 1. Extrair Dados do PDF

1. Clique em "Selecionar Arquivo PDF"
2. Escolha o arquivo PDF que contém os dados
3. Aguarde o processamento (o OCR pode levar alguns segundos)
4. Visualize os dados extraídos na tabela

### 2. Preencher CSV

1. Clique em "Selecionar Arquivo CSV"
2. Escolha o arquivo CSV que deseja preencher
3. Certifique-se de que o CSV contém uma coluna de ID (ex: "ID amost.", "ID", "Id", etc.)
4. Clique em "Processar e Baixar CSV"
5. O arquivo preenchido será baixado automaticamente

### 3. Editar Dados

- Clique em qualquer célula da tabela (exceto a coluna #) para editar
- Pressione Enter para confirmar a edição
- Os dados editados serão salvos automaticamente

## 🛠️ Tecnologias Utilizadas

- **HTML5**: Estrutura da aplicação
- **CSS3**: Estilização moderna com variáveis CSS e design responsivo
- **JavaScript (Vanilla)**: Lógica da aplicação
- **PDF.js**: Biblioteca para processamento de PDFs
- **Tesseract.js**: Motor OCR para reconhecimento de texto em imagens
- **Font Awesome**: Ícones

## 📁 Estrutura do Projeto

```
Ane/
├── index.html          # Estrutura HTML da aplicação
├── css/
│   └── style.css       # Estilos (tokens de cor, tema claro/escuro, responsivo)
├── js/
│   ├── config.js       # Configurações, nomes de colunas e mensagens
│   ├── parser.js       # Texto do OCR → registros (regex; sem DOM)
│   ├── csv.js          # Leitura, preenchimento e escrita de CSV (sem DOM)
│   ├── pdf-ocr.js      # PDF → texto, página a página (PDF.js + Tesseract.js)
│   ├── view.js         # Renderização da interface (HTML sempre escapado)
│   └── app.js          # Estado e eventos: liga os módulos à interface
└── README.md
```

## 🏗️ Arquitetura do Código

Scripts clássicos (sem build e sem módulos ES, para funcionar abrindo o `index.html` direto do disco), todos registrados no namespace global `Ane`:

- **`Ane.parser`**: corrige erros comuns do OCR, junta linhas quebradas e extrai `{ sequence, id, sex, age, name }`
- **`Ane.csv`**: detecta o separador (`,` ou `;`), preenche células vazias cruzando pelos últimos dígitos do ID e gera o CSV de saída
- **`Ane.pdfOcr`**: renderiza cada página em canvas e aplica OCR, reportando o progresso
- **`Ane.view`**: loader, tabela editável, abas e mensagens de status
- **`Ane.config` / `Ane.messages`**: constantes centralizadas

A ordem dos `<script>` no `index.html` importa: `config` → `parser` → `csv` → `pdf-ocr` → `view` → `app`.

## ⚙️ Configurações

As configurações ficam em `js/config.js`:

```javascript
Ane.config = {
  OCR_LANGUAGE: 'por',  // Idioma do OCR (português)
  OCR_SCALE: 7.0,       // Escala de renderização da página antes do OCR
  ID_DIGITS: 5,         // Dígitos finais do ID usados para cruzar PDF e CSV
  PDFJS_WORKER_SRC: '…' // Worker do PDF.js (mesma versão da biblioteca)
};
```

## 📝 Formato de Dados Esperado

O extrator procura por padrões no formato:

```
[sequência] [ID] | [Sexo] | [Idade]
[Nome]
```

Exemplo:
```
1 12345 | M | 25
João Silva
```

## 🔍 Colunas CSV Suportadas

O sistema procura automaticamente por colunas com os seguintes nomes:

- **ID**: `ID amost.`, `ID`, `Id`, `id`, `ID amostra`, `ID amostra.`
- **Nome**: Qualquer coluna contendo "nome" (case-insensitive)
- **Sexo**: Qualquer coluna contendo "sexo" (case-insensitive)
- **Idade**: Qualquer coluna contendo "idade" (case-insensitive)

O separador (`,` ou `;`) é detectado automaticamente pelo cabeçalho e mantido no arquivo gerado. IDs com pontuação (ex.: `25.083.144`) são normalizados antes da comparação. Apenas células vazias são preenchidas, e as edições feitas na tabela são usadas no preenchimento.

## 🌐 Compatibilidade

- Navegadores modernos (Chrome, Firefox, Safari, Edge)
- Suporte a dispositivos móveis (design responsivo)
- Funciona completamente no cliente (sem necessidade de servidor)

## 📦 Dependências Externas

As seguintes bibliotecas são carregadas via CDN:

- **PDF.js** (v3.11.174): `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`
  - Worker: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
- **Tesseract.js** (v5): `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
- **Font Awesome** (v6.4.0): `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`

## 🎨 Características de Design

- Design moderno com gradientes e animações suaves
- Suporte a modo escuro (baseado nas preferências do sistema)
- Interface responsiva para diferentes tamanhos de tela
- Feedback visual claro para todas as ações
- Indicadores de progresso durante o processamento

## ⚠️ Limitações

- O processamento OCR pode ser lento para PDFs grandes
- A precisão do OCR depende da qualidade do PDF original
- Requer conexão com internet para carregar as bibliotecas externas
- Funciona melhor com PDFs que contêm tabelas bem formatadas

## 🔧 Observações Técnicas

- O processamento é feito completamente no navegador (client-side)
- Utiliza Tesseract.js para OCR em português
- Funciona melhor com PDFs que contêm tabelas bem formatadas

## 📄 Notas

Este é um projeto pessoal desenvolvido para uso específico. A aplicação processa todos os dados localmente no navegador. Nenhum dado é enviado para servidores externos, garantindo privacidade e segurança.

